// Automatic Transport Fee fines for a SUBMITTED Bus Inspection check.
// Facts are re-read here (never trusted from scan time); the pure rules decide;
// createFines writes. Keys make every path idempotent:
//   maintenance-unpaid:<yearId>  (shared with the 48h payment-notice sweep → one per learner per year)
//   no-booking:<date>            (one per learner per day)
//
// Fix round 1 (money safety):
//   I1: a learner who is already fined for this key is found by a BULK pre-check
//       read of tms_fee_fine BEFORE createFines runs. createFines' own duplicate
//       handling (insert billing_student_bills, then a compensating delete when
//       the tms_fee_fine insert 23505s) is a correctness backstop for a genuine
//       race, not the normal path — every repeat inspection of an already-fined
//       learner (every morning/evening check, all year) must never insert-then-
//       delete a real money row.
//   I2a: ONE createFines call per rule, batching every still-eligible learner,
//       instead of one call per learner per rule (was ~1,000+ sequential round
//       trips per full bus). A bulk read-back after the call tells us who was
//       actually raised.
import type { SupabaseClient } from '@supabase/supabase-js';
import { createFines, type FineKind } from '@/lib/fines/create';
import { loadExceptions } from '@/lib/booking/calendar';
import { logSystemActivity } from '@/lib/activity/log';
import { addDays } from '@/lib/booking/window';
import { chunk } from './admin';
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
  /** Bulk-read tms_fee_fine ids for a set of full idempotency keys ('<baseKey>:<personId>'). */
  readFineIdsByKeys: (svc: SupabaseClient, keys: string[]) => Promise<Map<string, string>>;
}

async function defaultReadFineIdsByKeys(svc: SupabaseClient, keys: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const part of chunk(keys)) {
    if (part.length === 0) continue;
    const { data, error } = await svc.from('tms_fee_fine').select('id, idempotency_key').in('idempotency_key', part);
    if (error) throw new Error(`raiseCheckFines: fine key read failed: ${error.message}`);
    for (const r of (data ?? []) as { id: string; idempotency_key: string }[]) out.set(r.idempotency_key, r.id);
  }
  return out;
}

const DEFAULT_DEPS: FineDeps = {
  now: () => new Date(),
  loadLearnerFeeFacts,
  loadBookingRoutes,
  loadExceptionDates: async (svc, routeId, date) => new Set((await loadExceptions(svc, routeId, date, date)).keys()),
  createFines,
  logSystemActivity,
  readFineIdsByKeys: defaultReadFineIdsByKeys,
};

type RuleName = 'fee' | 'booking';
type RuleStatus = 'skip' | 'already_fined' | 'pending' | 'raised' | 'error';
interface RuleState { note: FineNote; fineId: string | null; status: RuleStatus }

type CheckRef = { id: string; route_id: string; check_date: string };

/** The check's learner ticks. Staff / unknown rows never reach the fine rules. */
async function loadLearnerTicks(svc: SupabaseClient, checkId: string): Promise<{ id: string; learner_id: string }[]> {
  const { data: rows, error } = await svc.from('tms_route_check_person')
    .select('id, learner_id').eq('check_id', checkId).eq('person_kind', 'learner');
  if (error) throw new Error(`raiseCheckFines: ticks read failed: ${error.message}`);
  // The query filter isn't enforced by every caller's test double, so guard here
  // too — a staff/unknown row must never reach createFines.
  return ((rows ?? []) as { id: string; learner_id: string | null }[])
    .filter((t): t is { id: string; learner_id: string } => !!t.learner_id);
}

/**
 * Re-read every fact and run the pure rules for each learner. Shared by submit
 * (raiseCheckFines) and the Submit-dialog preview, so the two cannot disagree.
 * Read-only.
 */
async function decideTicks(svc: SupabaseClient, check: CheckRef, learnerIds: string[], d: FineDeps) {
  const [{ yearId, facts }, bookings, exceptions] = await Promise.all([
    d.loadLearnerFeeFacts(svc, learnerIds),
    d.loadBookingRoutes(svc, learnerIds, check.check_date),
    d.loadExceptionDates(svc, check.route_id, check.check_date),
  ]);
  const serviceDay = isServiceDay(check.check_date, exceptions);
  const now = d.now();

  const feeState = new Map<string, RuleState>();
  const bookingState = new Map<string, RuleState>();
  const skipped: CheckFineSummary['skipped'] = [];

  for (const lid of learnerIds) {
    const fee: FineDecision = yearId
      ? decideFeeFine(facts.get(lid) ?? { mark: 'unknown', term1DueDate: null, runningNoticeExpiresAt: null }, { checkDate: check.check_date, now })
      : { raise: false, note: 'no_current_year' };
    const booking: FineDecision = yearId
      ? decideBookingFine(bookingMark(bookings.get(lid) ?? [], check.route_id), { serviceDay })
      : { raise: false, note: 'no_current_year' };

    if (!fee.raise) {
      feeState.set(lid, { note: fee.note, fineId: null, status: 'skip' });
      skipped.push({ personId: lid, rule: 'fee', note: fee.note });
    } else {
      feeState.set(lid, { note: 'raised', fineId: null, status: 'pending' });
    }

    if (!booking.raise) {
      bookingState.set(lid, { note: booking.note, fineId: null, status: 'skip' });
      skipped.push({ personId: lid, rule: 'booking', note: booking.note });
    } else {
      bookingState.set(lid, { note: 'raised', fineId: null, status: 'pending' });
    }
  }

  return {
    yearId, feeState, bookingState, skipped,
    feeBaseKey: yearId ? `maintenance-unpaid:${yearId}` : '',
    bookingBaseKey: `no-booking:${check.check_date}`,
  };
}

export interface CheckFinePreview {
  enabled: boolean;
  unpaidAmount: number;
  noBookingAmount: number;
  fee: { willRaise: number; alreadyFined: number };
  booking: { willRaise: number; alreadyFined: number };
}

/**
 * What submitting this check would fine RIGHT NOW, without writing anything —
 * for the Submit dialog. Submit re-decides from fresh facts, so this is a
 * preview, not a promise. Throws on a read failure rather than returning a
 * misleading 0.
 */
export async function previewCheckFines(svc: SupabaseClient, check: CheckRef, deps: Partial<FineDeps> = {}): Promise<CheckFinePreview> {
  const d: FineDeps = { ...DEFAULT_DEPS, ...deps };
  const cfg = await loadRouteCheckFineConfig(svc);
  const out: CheckFinePreview = {
    enabled: cfg.enabled, unpaidAmount: cfg.unpaidAmount, noBookingAmount: cfg.noBookingAmount,
    fee: { willRaise: 0, alreadyFined: 0 }, booking: { willRaise: 0, alreadyFined: 0 },
  };
  if (!cfg.enabled) return out;
  const ticks = await loadLearnerTicks(svc, check.id);
  if (ticks.length === 0) return out;

  const dec = await decideTicks(svc, check, ticks.map((t) => t.learner_id), d);
  const tally = async (state: Map<string, RuleState>, baseKey: string, into: { willRaise: number; alreadyFined: number }) => {
    const pending = [...state.entries()].filter(([, s]) => s.status === 'pending').map(([lid]) => lid);
    if (pending.length === 0) return;
    const existing = await d.readFineIdsByKeys(svc, pending.map((lid) => `${baseKey}:${lid}`));
    for (const lid of pending) {
      if (existing.has(`${baseKey}:${lid}`)) into.alreadyFined += 1;
      else into.willRaise += 1;
    }
  };
  await tally(dec.feeState, dec.feeBaseKey, out.fee);
  await tally(dec.bookingState, dec.bookingBaseKey, out.booking);
  return out;
}

export async function raiseCheckFines(
  svc: SupabaseClient,
  check: CheckRef,
  actorId: string,
  deps: Partial<FineDeps> = {},
): Promise<CheckFineSummary> {
  const d: FineDeps = { ...DEFAULT_DEPS, ...deps };
  const out: CheckFineSummary = { enabled: false, raised: 0, alreadyFined: 0, skipped: [], errors: 0 };

  const ticks = await loadLearnerTicks(svc, check.id);
  if (ticks.length === 0) return out;

  const cfg = await loadRouteCheckFineConfig(svc);
  if (!cfg.enabled) {
    const { error: offErr } = await svc.from('tms_route_check_person')
      .update({ fine_note: 'fines_off' }).eq('check_id', check.id).eq('person_kind', 'learner');
    if (offErr) console.error('[route-check] fines-off note write failed', check.id, offErr.message); // M2
    return out;
  }
  out.enabled = true;

  const dueDate = addDays(check.check_date, cfg.fineDueDays);
  const { yearId, feeState, bookingState, skipped, feeBaseKey, bookingBaseKey } =
    await decideTicks(svc, check, ticks.map((t) => t.learner_id), d);
  out.skipped.push(...skipped);

  await processRule({
    svc, check, actorId, dueDate, d, out,
    rule: 'fee', state: feeState, baseKey: feeBaseKey, amount: cfg.unpaidAmount, kind: 'maintenance_unpaid',
    reason: `Bus inspection ${check.check_date}: Transport Maintenance Fee unpaid`,
    transportYearId: yearId,
  });
  await processRule({
    svc, check, actorId, dueDate, d, out,
    rule: 'booking', state: bookingState, baseKey: bookingBaseKey, amount: cfg.noBookingAmount, kind: 'no_booking',
    reason: `Bus inspection ${check.check_date}: travelled without booking`,
    transportYearId: yearId,
  });

  for (const t of ticks) {
    const lid = t.learner_id;
    const fs = feeState.get(lid) as RuleState;
    const bs = bookingState.get(lid) as RuleState;
    const patch: Record<string, unknown> = {
      fine_note: `fee:${fs.note} booking:${bs.note}`,
    };
    if (fs.fineId) patch.fee_fine_id = fs.fineId;
    if (bs.fineId) patch.booking_fine_id = bs.fineId;
    const { error: uErr } = await svc.from('tms_route_check_person').update(patch).eq('id', t.id);
    if (uErr) console.error('[route-check] fine note write failed', t.id, uErr.message);
  }

  return out;
}

async function processRule(args: {
  svc: SupabaseClient;
  check: { id: string; route_id: string; check_date: string };
  actorId: string;
  dueDate: string;
  d: FineDeps;
  out: CheckFineSummary;
  rule: RuleName;
  state: Map<string, RuleState>;
  baseKey: string;
  amount: number;
  kind: FineKind;
  reason: string;
  transportYearId: string | null;
}): Promise<void> {
  const { svc, check, actorId, dueDate, d, out, rule, state, baseKey, amount, kind, reason, transportYearId } = args;
  const pendingIds = [...state.entries()].filter(([, s]) => s.status === 'pending').map(([lid]) => lid);
  if (pendingIds.length === 0) return;
  if (!transportYearId) {
    // Shouldn't happen: decideFeeFine/decideBookingFine already skip with
    // 'no_current_year' when there's no current transport year. Defensive only.
    for (const lid of pendingIds) { state.set(lid, { note: 'error', fineId: null, status: 'error' }); out.errors++; }
    return;
  }

  // I1: bulk pre-check — a learner already fined for this key must never reach
  // createFines (that would insert a real bill, then delete it on 23505).
  let existing: Map<string, string>;
  try {
    existing = await d.readFineIdsByKeys(svc, pendingIds.map((lid) => `${baseKey}:${lid}`));
  } catch (e) {
    console.error('[route-check] fine pre-check read failed', check.id, rule, e);
    for (const lid of pendingIds) { state.set(lid, { note: 'error', fineId: null, status: 'error' }); out.errors++; }
    return;
  }

  const stillEligible: string[] = [];
  for (const lid of pendingIds) {
    const fid = existing.get(`${baseKey}:${lid}`);
    if (fid) {
      state.set(lid, { note: 'already_fined', fineId: fid, status: 'already_fined' });
      out.alreadyFined++;
    } else {
      stillEligible.push(lid);
    }
  }
  if (stillEligible.length === 0) return;

  // I2a: ONE createFines call for every still-eligible learner under this rule.
  let created: { created: number; duplicates: number; errors: number } | null = null;
  try {
    created = await d.createFines(svc, {
      transportYearId, personIds: stillEligible, dueDate, reason,
      notify: true, idempotencyKey: baseKey, actorId, fixedAmount: amount, kind,
    });
  } catch (e) {
    console.error('[route-check] createFines threw', check.id, rule, e);
    for (const lid of stillEligible) { state.set(lid, { note: 'error', fineId: null, status: 'error' }); out.errors++; }
    return;
  }
  void created; // aggregate counts aren't attributable per-person; the read-back below is authoritative

  // Bulk read-back: who now has a fine for this key (whether freshly created here
  // or already present from a race with another submission).
  let readBack: Map<string, string>;
  try {
    readBack = await d.readFineIdsByKeys(svc, stillEligible.map((lid) => `${baseKey}:${lid}`));
  } catch (e) {
    console.error('[route-check] fine read-back failed', check.id, rule, e); // M1
    for (const lid of stillEligible) { state.set(lid, { note: 'error', fineId: null, status: 'error' }); out.errors++; }
    return;
  }

  for (const lid of stillEligible) {
    const fid = readBack.get(`${baseKey}:${lid}`);
    if (!fid) {
      state.set(lid, { note: 'error', fineId: null, status: 'error' });
      out.errors++;
      continue;
    }
    state.set(lid, { note: 'raised', fineId: fid, status: 'raised' });
    out.raised++;
    await d.logSystemActivity({
      module: 'fees', action: 'generate', entityType: 'tms_fee_fine', entityId: fid,
      description: `Transport Fee ₹${amount} raised by bus inspection (${rule === 'fee' ? 'maintenance fee unpaid' : 'no booking'})`,
      metadata: { check_id: check.id, route_id: check.route_id, learner_id: lid, rule, actor_id: actorId },
    });
  }
}
