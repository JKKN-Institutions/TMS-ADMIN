// lib/fees/payment-notice/sweep.ts
// The scheduled 48-hour payment notice sweep. Loads state, asks planSweep()
// what to do, and does it. Every fine goes through createFines() so the
// money-row-first write order, the compensating delete, and the 23505
// idempotency no-op are reused, never re-implemented.

import type { SupabaseClient } from '@supabase/supabase-js';
import { loadFeeNoticeConfig, istDate, addDays } from './config';
import { planSweep, type NoticeRow, type UnpaidBill } from './plan';
import { FINE_REASON, startMessage, reminderMessage, type LearnerMessage } from './messages';
import { term1PaidLearnerIds } from '@/lib/fees/term1';
import { createFines } from '@/lib/fines/create';
import { logSystemActivity } from '@/lib/activity/log';
import { resolveLearnerProfileIds } from '@/lib/notifications/learner-recipients';
import { dispatchNotification } from '@/lib/notifications/dispatch';

const CHUNK = 150;

export interface SweepSummary {
  skipped?: 'disabled' | 'no_current_transport_year';
  dryRun: boolean;
  opened: number;
  paid: number;
  cancelled: number;
  reminded: number;
  fined: number;
  fineSkipped: number;
  errors: number;
}

export interface SweepDeps {
  term1PaidLearnerIds: typeof term1PaidLearnerIds;
  createFines: typeof createFines;
  notify: (svc: SupabaseClient, msgs: LearnerMessage[]) => Promise<void>;
  logSystemActivity: typeof logSystemActivity;
}

/** Best-effort: one dispatch per learner; failures are logged, never thrown. */
async function notifyLearners(svc: SupabaseClient, msgs: LearnerMessage[]): Promise<void> {
  if (!msgs.length) return;
  let profiles: Map<string, string>;
  try {
    profiles = await resolveLearnerProfileIds(svc, msgs.map((m) => m.learnerId));
  } catch (e) {
    console.error('[payment-notice] recipient resolution failed', e);
    return;
  }
  for (const m of msgs) {
    const profileId = profiles.get(m.learnerId);
    if (!profileId) continue;
    try {
      await dispatchNotification(svc as never, {
        title: m.title,
        body: m.body,
        category: 'fees',
        priority: 'urgent',
        url: '/student/fees',
        createdBy: null,
        expiresAt: m.expiresAt ?? null,
        idempotencyKey: m.idempotencyKey,
        targeting: { type: 'users', user_ids: [profileId] },
      });
    } catch (e) {
      console.error('[payment-notice] notify failed', m.idempotencyKey, e);
    }
  }
}

const DEFAULT_DEPS: SweepDeps = { term1PaidLearnerIds, createFines, notify: notifyLearners, logSystemActivity };

const empty = (dryRun: boolean): SweepSummary => ({
  dryRun, opened: 0, paid: 0, cancelled: 0, reminded: 0, fined: 0, fineSkipped: 0, errors: 0,
});

async function loadUnpaidBills(svc: SupabaseClient, yearId: string, paid: Set<string>): Promise<UnpaidBill[]> {
  const { data, error } = await svc
    .from('tms_fee_bill')
    .select('id, person_id, term_no, created_at, status')
    .eq('transport_year_id', yearId)
    .eq('person_type', 'learner')
    .eq('status', 'generated');
  if (error) throw new Error(`Failed to load bills: ${error.message}`);
  // One source bill per person: the lowest term_no, earliest created.
  const best = new Map<string, { id: string; term_no: number; created_at: string }>();
  for (const r of (data ?? []) as Array<{ id: string; person_id: string; term_no: number | null; created_at: string }>) {
    if (paid.has(r.person_id)) continue;
    const t = r.term_no ?? Number.MAX_SAFE_INTEGER;
    const cur = best.get(r.person_id);
    if (!cur || t < cur.term_no || (t === cur.term_no && r.created_at < cur.created_at)) {
      best.set(r.person_id, { id: r.id, term_no: t, created_at: r.created_at });
    }
  }
  return [...best.entries()].map(([person_id, b]) => ({ person_id, bill_id: b.id, created_at: b.created_at }));
}

async function loadFineAmounts(svc: SupabaseClient, yearId: string, personIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!personIds.length) return out;
  const { data: rates, error: rateErr } = await svc
    .from('tms_fine_stop_rate')
    .select('stop_id, fine_amount')
    .eq('transport_year_id', yearId);
  if (rateErr) throw new Error(`Failed to load fine rates: ${rateErr.message}`);
  const byStop = new Map(
    ((rates ?? []) as Array<{ stop_id: string; fine_amount: number }>).map((r) => [r.stop_id, Number(r.fine_amount)]),
  );
  for (let i = 0; i < personIds.length; i += CHUNK) {
    const { data, error } = await svc
      .from('learners_profiles')
      .select('id, transport_stop_id')
      .in('id', personIds.slice(i, i + CHUNK));
    if (error) throw new Error(`Failed to load learner stops: ${error.message}`);
    for (const l of (data ?? []) as Array<{ id: string; transport_stop_id: string | null }>) {
      const amt = l.transport_stop_id ? byStop.get(l.transport_stop_id) : undefined;
      if (amt && amt > 0) out.set(l.id, amt);
    }
  }
  return out;
}

async function updateStatus(svc: SupabaseClient, ids: string[], status: 'paid' | 'cancelled', nowIso: string) {
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { error } = await svc
      .from('tms_fee_payment_notice')
      .update({ status, updated_at: nowIso })
      .in('id', ids.slice(i, i + CHUNK))
      .eq('status', 'running');
    if (error) throw new Error(`Failed to mark notices ${status}: ${error.message}`);
  }
}

export async function runPaymentNoticeSweep(
  svc: SupabaseClient,
  opts: { dryRun?: boolean; now?: Date; deps?: Partial<SweepDeps> } = {},
): Promise<SweepSummary> {
  const dryRun = opts.dryRun === true;
  const now = opts.now ?? new Date();
  const nowIso = now.toISOString();
  const d: SweepDeps = { ...DEFAULT_DEPS, ...opts.deps };
  const out = empty(dryRun);

  const cfg = await loadFeeNoticeConfig(svc);
  if (!cfg.enabled || !cfg.enabledAt) return { ...out, skipped: 'disabled' };

  const { data: ty } = await svc.from('tms_transport_year').select('id').eq('is_current', true).limit(1);
  const yearId = (ty as Array<{ id: string }> | null)?.[0]?.id ?? null;
  if (!yearId) return { ...out, skipped: 'no_current_transport_year' };

  const paid = await d.term1PaidLearnerIds(svc, yearId);
  const unpaidBills = await loadUnpaidBills(svc, yearId, paid);

  const { data: ovr, error: ovrErr } = await svc
    .from('tms_fee_override')
    .select('person_id')
    .eq('transport_year_id', yearId);
  if (ovrErr) throw new Error(`Failed to load overrides: ${ovrErr.message}`);
  const overridden = new Set(((ovr ?? []) as Array<{ person_id: string }>).map((r) => r.person_id));

  const { data: nrows, error: nErr } = await svc
    .from('tms_fee_payment_notice')
    .select('id, person_id, status, started_at, expires_at, reminder_sent_at, source_bill_id')
    .eq('transport_year_id', yearId);
  if (nErr) throw new Error(`Failed to load notices: ${nErr.message}`);
  const notices = (nrows ?? []) as NoticeRow[];

  const people = [...new Set([
    ...unpaidBills.map((b) => b.person_id),
    ...notices.filter((n) => n.status === 'running').map((n) => n.person_id),
  ])];
  const fineAmount = await loadFineAmounts(svc, yearId, people);

  const plan = planSweep({
    now, cfg: { ...cfg, enabledAt: cfg.enabledAt }, paid, overridden, unpaidBills, fineAmount, notices,
  });

  out.paid = plan.markPaid.length;
  out.cancelled = plan.cancel.length;
  out.opened = plan.open.length;
  out.reminded = plan.remind.length;
  if (dryRun) {
    out.fined = plan.fine.length;
    return out;
  }

  // 1. paid / cancelled
  await updateStatus(svc, plan.markPaid, 'paid', nowIso);
  await updateStatus(svc, plan.cancel, 'cancelled', nowIso);

  // 2. open (ignoreDuplicates: an overlapping run that already opened one is a no-op)
  const opened: Array<{ id: string; person_id: string; expires_at: string }> = [];
  for (let i = 0; i < plan.open.length; i += CHUNK) {
    const batch = plan.open.slice(i, i + CHUNK).map((o) => ({
      person_id: o.person_id, transport_year_id: yearId, source_bill_id: o.source_bill_id,
      started_at: o.started_at, expires_at: o.expires_at, status: 'running',
    }));
    const { data, error } = await svc
      .from('tms_fee_payment_notice')
      .upsert(batch, { onConflict: 'person_id,transport_year_id', ignoreDuplicates: true })
      .select('id, person_id, expires_at');
    if (error) { console.error('[payment-notice] open failed', error.message); out.errors += batch.length; continue; }
    opened.push(...((data ?? []) as typeof opened));
  }
  out.opened = opened.length;
  if (opened.length) {
    await d.notify(svc, opened.map((n) =>
      startMessage(n.id, n.person_id, n.expires_at, fineAmount.get(n.person_id) ?? 0)));
  }

  // 3. remind — stamp first so a crash after sending can't cause a resend storm;
  // the dispatch idempotency key covers the reverse case.
  for (const r of plan.remind) {
    const { error } = await svc
      .from('tms_fee_payment_notice')
      .update({ reminder_sent_at: nowIso, updated_at: nowIso })
      .eq('id', r.notice_id)
      .is('reminder_sent_at', null);
    if (error) { out.errors++; continue; }
  }
  if (plan.remind.length) {
    await d.notify(svc, plan.remind.map((r) => reminderMessage(r.notice_id, r.person_id, r.expires_at, r.amount)));
  }

  // 4. fine
  for (const f of plan.fine) {
    try {
      const key = `payment-notice:${f.notice_id}`;
      const res = await d.createFines(svc, {
        transportYearId: yearId,
        personIds: [f.person_id],
        dueDate: addDays(istDate(f.expires_at), cfg.fineDueDays),
        reason: FINE_REASON,
        notify: true,
        idempotencyKey: key,
        actorId: null,
        sourceBillByPerson: f.source_bill_id ? { [f.person_id]: f.source_bill_id } : undefined,
      });
      if (res.created + res.duplicates === 0) {
        if (res.skipped.length) {
          out.fineSkipped++;
          console.warn('[payment-notice] fine skipped; notice stays running', f.notice_id, res.skipped[0]?.reason);
        } else {
          out.errors++;
        }
        continue;
      }
      const { data: fine, error: fErr } = await svc
        .from('tms_fee_fine')
        .select('id')
        .eq('idempotency_key', `${key}:${f.person_id}`)
        .maybeSingle();
      const fineId = (fine as { id: string } | null)?.id;
      if (fErr || !fineId) { out.errors++; continue; }
      const { error: uErr } = await svc
        .from('tms_fee_payment_notice')
        .update({ status: 'fined', fine_id: fineId, updated_at: nowIso })
        .eq('id', f.notice_id)
        .eq('status', 'running');
      if (uErr) { out.errors++; continue; }
      out.fined++;
      await d.logSystemActivity({
        module: 'fees',
        action: 'generate',
        entityType: 'tms_fee_fine',
        entityId: fineId,
        description: `Transport Fee raised automatically: maintenance fee unpaid 48 hours after notice`,
        metadata: { notice_id: f.notice_id, person_id: f.person_id, expires_at: f.expires_at },
      });
    } catch (e) {
      console.error('[payment-notice] fine failed', f.notice_id, e);
      out.errors++;
    }
  }

  return out;
}
