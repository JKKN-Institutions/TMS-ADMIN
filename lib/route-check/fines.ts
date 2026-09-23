// Automatic Transport Fee fines for a SUBMITTED Bus Inspection check.
// Facts are re-read here (never trusted from scan time); the pure rules decide;
// createFines writes. Keys make every path idempotent:
//   maintenance-unpaid:<yearId>  (shared with the 48h payment-notice sweep → one per learner per year)
//   no-booking:<date>            (one per learner per day)
import type { SupabaseClient } from '@supabase/supabase-js';
import { createFines, type FineKind } from '@/lib/fines/create';
import { loadExceptions } from '@/lib/booking/calendar';
import { logSystemActivity } from '@/lib/activity/log';
import { addDays } from '@/lib/booking/window';
import { loadRouteCheckFineConfig } from './fine-config';
import { loadLearnerFeeFacts, loadBookingRoutes } from './fee-facts';
import { bookingMark } from './marks';
import { decideBookingFine, decideFeeFine, isServiceDay, type FineDecision, type FineNote } from './fine-rules';

export interface CheckFineSummary {
  enabled: boolean;
  raised: number;
  alreadyFined: number;
  skipped: Array<{ personId: string; rule: 'fee' | 'booking'; note: FineNote }>;
  errors: number;
}

export interface FineDeps {
  now: () => Date;
  loadLearnerFeeFacts: typeof loadLearnerFeeFacts;
  loadBookingRoutes: typeof loadBookingRoutes;
  loadExceptionDates: (svc: SupabaseClient, routeId: string, date: string) => Promise<Set<string>>;
  createFines: typeof createFines;
  logSystemActivity: typeof logSystemActivity;
}

const DEFAULT_DEPS: FineDeps = {
  now: () => new Date(),
  loadLearnerFeeFacts,
  loadBookingRoutes,
  loadExceptionDates: async (svc, routeId, date) => new Set((await loadExceptions(svc, routeId, date, date)).keys()),
  createFines,
  logSystemActivity,
};

export async function raiseCheckFines(
  svc: SupabaseClient,
  check: { id: string; route_id: string; check_date: string },
  actorId: string,
  deps: Partial<FineDeps> = {},
): Promise<CheckFineSummary> {
  const d: FineDeps = { ...DEFAULT_DEPS, ...deps };
  const out: CheckFineSummary = { enabled: false, raised: 0, alreadyFined: 0, skipped: [], errors: 0 };

  const { data: rows, error } = await svc.from('tms_route_check_person')
    .select('id, learner_id').eq('check_id', check.id).eq('person_kind', 'learner');
  if (error) throw new Error(`raiseCheckFines: ticks read failed: ${error.message}`);
  // RULING R1: the query filter isn't enforced by every caller's test double, so
  // guard here too — a staff/unknown row must never reach createFines.
  const ticks = ((rows ?? []) as { id: string; learner_id: string | null }[])
    .filter((t): t is { id: string; learner_id: string } => !!t.learner_id);
  if (ticks.length === 0) return out;

  const cfg = await loadRouteCheckFineConfig(svc);
  if (!cfg.enabled) {
    await svc.from('tms_route_check_person').update({ fine_note: 'fines_off' }).eq('check_id', check.id).eq('person_kind', 'learner');
    return out;
  }
  out.enabled = true;

  const ids = ticks.map((t) => t.learner_id);
  const [{ yearId, facts }, bookings, exceptions] = await Promise.all([
    d.loadLearnerFeeFacts(svc, ids),
    d.loadBookingRoutes(svc, ids, check.check_date),
    d.loadExceptionDates(svc, check.route_id, check.check_date),
  ]);
  const serviceDay = isServiceDay(check.check_date, exceptions);
  const now = d.now();
  const dueDate = addDays(check.check_date, cfg.fineDueDays);

  for (const t of ticks) {
    const notes: string[] = [];
    const patch: Record<string, unknown> = {};
    const fee: FineDecision = yearId
      ? decideFeeFine(facts.get(t.learner_id) ?? { mark: 'unknown', term1DueDate: null, runningNoticeExpiresAt: null }, { checkDate: check.check_date, now })
      : { raise: false, note: 'no_current_year' };
    const booking: FineDecision = yearId
      ? decideBookingFine(bookingMark(bookings.get(t.learner_id) ?? [], check.route_id), { serviceDay })
      : { raise: false, note: 'no_current_year' };

    const rules: Array<{ rule: 'fee' | 'booking'; decision: FineDecision; key: string; amount: number; kind: FineKind; reason: string; col: string }> = [
      { rule: 'fee', decision: fee, key: `maintenance-unpaid:${yearId}`, amount: cfg.unpaidAmount, kind: 'maintenance_unpaid',
        reason: `Bus inspection ${check.check_date}: Transport Maintenance Fee unpaid`, col: 'fee_fine_id' },
      { rule: 'booking', decision: booking, key: `no-booking:${check.check_date}`, amount: cfg.noBookingAmount, kind: 'no_booking',
        reason: `Bus inspection ${check.check_date}: travelled without booking`, col: 'booking_fine_id' },
    ];

    for (const r of rules) {
      if (!r.decision.raise) {
        out.skipped.push({ personId: t.learner_id, rule: r.rule, note: r.decision.note });
        notes.push(`${r.rule}:${r.decision.note}`);
        continue;
      }
      try {
        const res = await d.createFines(svc, {
          transportYearId: yearId as string, personIds: [t.learner_id], dueDate, reason: r.reason,
          notify: true, idempotencyKey: r.key, actorId, fixedAmount: r.amount, kind: r.kind,
        });
        if (res.created + res.duplicates === 0) { out.errors++; notes.push(`${r.rule}:error`); continue; }
        const { data: fine } = await svc.from('tms_fee_fine').select('id').eq('idempotency_key', `${r.key}:${t.learner_id}`).maybeSingle();
        const fineId = (fine as { id: string } | null)?.id ?? null;
        if (fineId) patch[r.col] = fineId;
        if (res.created > 0) {
          out.raised++;
          notes.push(`${r.rule}:raised`);
          await d.logSystemActivity({
            module: 'fees', action: 'generate', entityType: 'tms_fee_fine', entityId: fineId ?? undefined,
            description: `Transport Fee ₹${r.amount} raised by bus inspection (${r.rule === 'fee' ? 'maintenance fee unpaid' : 'no booking'})`,
            metadata: { check_id: check.id, route_id: check.route_id, learner_id: t.learner_id, rule: r.rule, actor_id: actorId },
          });
        } else {
          out.alreadyFined++;
          notes.push(`${r.rule}:already_fined`);
        }
      } catch (e) {
        console.error('[route-check] fine failed', check.id, t.learner_id, r.rule, e);
        out.errors++;
        notes.push(`${r.rule}:error`);
      }
    }
    patch.fine_note = notes.join(' ');
    const { error: uErr } = await svc.from('tms_route_check_person').update(patch).eq('id', t.id);
    if (uErr) console.error('[route-check] fine note write failed', t.id, uErr.message);
  }
  return out;
}
