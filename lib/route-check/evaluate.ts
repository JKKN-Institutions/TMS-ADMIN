/**
 * Route Check evaluation: what a scanned learner / staff member's status is
 * on THIS route TODAY, and recording the resulting tick. Verify-only: reads
 * bookings, attendance-roster fees and staff bills; writes only
 * tms_route_check_person.
 */
import type { createServiceRoleClient } from '@/lib/supabase/server';
import { loadRosterFees, UNKNOWN_FEE, type RosterFee } from '@/lib/boarding/fee-roster';
import { learnerCheckOutcome, staffCheckOutcome, type CheckOutcome } from './outcome';
import { staffBillStates } from './staff-fees';
import { entryFeeState, personEntryFromRow, type PersonDbRow } from './entries';
import { normEmail, selectIn, staffName } from './admin';
import type { CheckPersonEntry, EntryFeeState, MatchedBy } from './types';

type Svc = ReturnType<typeof createServiceRoleClient>;

export interface LearnerEvaluation {
  learnerId: string; name: string; code: string | null; onRoute: boolean; booked: boolean; fee: RosterFee; outcome: CheckOutcome;
}
export interface StaffEvaluation {
  staffId: string; name: string; code: string | null; onRoute: boolean; isIncharge: boolean;
  feeState: EntryFeeState; feeOwed: number | null; outcome: CheckOutcome;
}

const PERSON_COLS = 'id, check_id, person_kind, learner_id, staff_id, manual_type, manual_name, matched_by, scanned_code, outcome, on_route, booked, fee_state, notes, created_at';

export async function evaluateLearner(svc: Svc, learnerId: string, routeId: string, date: string): Promise<LearnerEvaluation | null> {
  const [learnerQ, bookingQ, fees] = await Promise.all([
    svc.from('learners_profiles').select('id, first_name, last_name, roll_number, register_number, transport_route_id').eq('id', learnerId).maybeSingle(),
    svc.from('tms_booking').select('route_id').eq('learner_id', learnerId).eq('travel_date', date),
    // Display-only and fail-soft: a failed fee read is 'unknown', never 'paid'.
    loadRosterFees(svc, [learnerId]),
  ]);
  if (learnerQ.error) throw new Error(`evaluateLearner: learner read failed: ${learnerQ.error.message}`);
  if (bookingQ.error) throw new Error(`evaluateLearner: booking read failed: ${bookingQ.error.message}`);
  const l = learnerQ.data as { first_name: string | null; last_name: string | null; roll_number: string | null; register_number: string | null; transport_route_id: string | null } | null;
  if (!l) return null;
  const bookings = (bookingQ.data ?? []) as { route_id: string }[];
  const booked = bookings.length > 0;
  const onRoute = l.transport_route_id === routeId || bookings.some((b) => b.route_id === routeId);
  const fee = fees.get(learnerId) ?? { ...UNKNOWN_FEE };
  return {
    learnerId,
    name: staffName(l),
    code: l.roll_number ?? l.register_number ?? null,
    onRoute, booked, fee,
    outcome: learnerCheckOutcome({ known: true, onRoute, booked, feeUnpaid: fee.state === 'unpaid' }),
  };
}

/** Lower-cased emails of the route's active in-charges. Throws on read error. */
export async function inchargeEmailsForRoute(svc: Svc, routeId: string): Promise<Set<string>> {
  const { data, error } = await svc.from('tms_staff_route_assignment').select('staff_email').eq('route_id', routeId).eq('is_active', true);
  if (error) throw new Error(`inchargeEmailsForRoute: read failed: ${error.message}`);
  return new Set(((data ?? []) as { staff_email: string | null }[]).map((r) => normEmail(r.staff_email)).filter(Boolean));
}

export async function evaluateStaff(svc: Svc, staffId: string, routeId: string): Promise<StaffEvaluation | null> {
  const { data, error } = await svc.from('staff')
    .select('id, first_name, last_name, staff_id, email, institution_email, transport_route_id').eq('id', staffId).maybeSingle();
  if (error) throw new Error(`evaluateStaff: staff read failed: ${error.message}`);
  const s = data as { first_name: string | null; last_name: string | null; staff_id: string | null; email: string | null; institution_email: string | null; transport_route_id: string | null } | null;
  if (!s) return null;
  const [incharges, bills] = await Promise.all([inchargeEmailsForRoute(svc, routeId), staffBillStates(svc, [staffId])]);
  const isIncharge = [normEmail(s.email), normEmail(s.institution_email)].some((e) => e && incharges.has(e));
  const bill = bills.get(staffId) ?? { hasOutstanding: false, outstandingAmount: 0, hasBill: false };
  const feeState = entryFeeState({ isIncharge, hasBill: bill.hasBill, hasOutstanding: bill.hasOutstanding });
  return {
    staffId, name: staffName(s), code: s.staff_id ?? null,
    onRoute: s.transport_route_id === routeId, isIncharge, feeState,
    feeOwed: bill.hasOutstanding ? bill.outstandingAmount : null,
    outcome: staffCheckOutcome({ onRoute: s.transport_route_id === routeId, isIncharge, hasOutstandingBill: bill.hasOutstanding }),
  };
}

export type NewEntry =
  | { kind: 'learner'; learnerId: string; matchedBy: MatchedBy; scannedCode: string | null; ev: LearnerEvaluation }
  | { kind: 'staff'; staffId: string; matchedBy: MatchedBy; scannedCode: string | null; ev: StaffEvaluation }
  | { kind: 'unknown'; scannedCode: string };

export async function recordEntry(svc: Svc, checkId: string, entry: NewEntry): Promise<{ row: PersonDbRow; alreadyChecked: boolean }> {
  const insert =
    entry.kind === 'learner'
      ? { check_id: checkId, person_kind: 'learner', learner_id: entry.learnerId, matched_by: entry.matchedBy, scanned_code: entry.scannedCode,
          outcome: entry.ev.outcome, on_route: entry.ev.onRoute, booked: entry.ev.booked, fee_state: entry.ev.fee.state }
      : entry.kind === 'staff'
        ? { check_id: checkId, person_kind: 'staff', staff_id: entry.staffId, matched_by: entry.matchedBy, scanned_code: entry.scannedCode,
            outcome: entry.ev.outcome, on_route: entry.ev.onRoute, booked: null, fee_state: entry.ev.feeState }
        : { check_id: checkId, person_kind: 'unknown', scanned_code: entry.scannedCode, outcome: 'unknown_card' };
  const { data, error } = await svc.from('tms_route_check_person').insert(insert).select(PERSON_COLS).single();
  if (!error) return { row: data as PersonDbRow, alreadyChecked: false };
  if (error.code !== '23505' || entry.kind === 'unknown') throw new Error(`recordEntry: insert failed: ${error.message}`);
  // Already ticked in this check — return that row rather than a second line.
  const col = entry.kind === 'learner' ? 'learner_id' : 'staff_id';
  const id = entry.kind === 'learner' ? entry.learnerId : entry.staffId;
  const { data: existing, error: exErr } = await svc.from('tms_route_check_person').select(PERSON_COLS).eq('check_id', checkId).eq(col, id).maybeSingle();
  if (exErr || !existing) throw new Error(`recordEntry: re-read after 23505 failed: ${exErr?.message ?? 'no row'}`);
  return { row: existing as PersonDbRow, alreadyChecked: true };
}

export async function loadEntries(svc: Svc, checkId: string): Promise<CheckPersonEntry[]> {
  const { data, error } = await svc.from('tms_route_check_person').select(PERSON_COLS).eq('check_id', checkId).order('created_at', { ascending: true });
  if (error) throw new Error(`loadEntries: read failed: ${error.message}`);
  const rows = (data ?? []) as PersonDbRow[];
  const [learners, staff] = await Promise.all([
    selectIn<{ id: string; first_name: string | null; last_name: string | null; roll_number: string | null; register_number: string | null }>(
      svc, 'learners_profiles', 'id, first_name, last_name, roll_number, register_number', 'id', rows.map((r) => r.learner_id ?? '')),
    selectIn<{ id: string; first_name: string | null; last_name: string | null; staff_id: string | null }>(
      svc, 'staff', 'id, first_name, last_name, staff_id', 'id', rows.map((r) => r.staff_id ?? '')),
  ]);
  const names = {
    learners: new Map(learners.map((l) => [l.id, { name: staffName(l), code: l.roll_number ?? l.register_number ?? null }])),
    staff: new Map(staff.map((s) => [s.id, { name: staffName(s), code: s.staff_id ?? null }])),
  };
  return rows.map((r) => personEntryFromRow(r, names));
}

/** Evaluate + record one resolved candidate. Returns the API's 'recorded' payload. */
export async function tickCandidate(
  svc: Svc, check: { id: string; route_id: string; check_date: string },
  pick: { personKind: 'learner' | 'staff'; id: string; matchedBy: MatchedBy; scannedCode: string | null },
): Promise<{ kind: 'recorded'; entry: CheckPersonEntry; alreadyChecked: boolean; feeOwed: number | null } | null> {
  if (pick.personKind === 'learner') {
    const ev = await evaluateLearner(svc, pick.id, check.route_id, check.check_date);
    if (!ev) return null;
    const { row, alreadyChecked } = await recordEntry(svc, check.id, { kind: 'learner', learnerId: pick.id, matchedBy: pick.matchedBy, scannedCode: pick.scannedCode, ev });
    const entry = personEntryFromRow(row, { learners: new Map([[pick.id, { name: ev.name, code: ev.code }]]), staff: new Map() });
    return { kind: 'recorded', entry, alreadyChecked, feeOwed: ev.fee.owed };
  }
  const ev = await evaluateStaff(svc, pick.id, check.route_id);
  if (!ev) return null;
  const { row, alreadyChecked } = await recordEntry(svc, check.id, { kind: 'staff', staffId: pick.id, matchedBy: pick.matchedBy, scannedCode: pick.scannedCode, ev });
  const entry = personEntryFromRow(row, { learners: new Map(), staff: new Map([[pick.id, { name: ev.name, code: ev.code }]]) });
  return { kind: 'recorded', entry, alreadyChecked, feeOwed: ev.feeOwed };
}
