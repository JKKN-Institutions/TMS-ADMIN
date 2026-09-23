/**
 * The full Route Check screen payload: roster learners with fee/booking
 * badges and ticks, staff riders + in-charges with bill status, counts and
 * the recorded entries. Shared by the GET view and the submit snapshot so
 * both read the same numbers. Throws on any read the view cannot do without.
 */
import type { createServiceRoleClient } from '@/lib/supabase/server';
import { loadRouteRosterView } from '@/lib/attendance/route-roster';
import { checkCounts } from './counts';
import { tickIndex, notOnRouteOf, registeredCount, entryFeeState } from './entries';
import { loadEntries, inchargeEmailsForRoute } from './evaluate';
import { staffBillStates } from './staff-fees';
import { mapLimit, normEmail, staffByEmail, staffName } from './admin';
import { loadLearnerFeeFacts, loadBookingRoutes } from './fee-facts';
import { bookingMark, countableFeeState } from './marks';
import type { CheckRow } from './check-access';
import type { CheckView, CheckLearnerRow, CheckStaffRow } from './types';

type Svc = ReturnType<typeof createServiceRoleClient>;

type StaffRow = { id: string; first_name: string | null; last_name: string | null; designation: string | null; staff_id: string | null; email: string | null; institution_email: string | null; is_active: boolean | null };
const STAFF_COLS = 'id, first_name, last_name, designation, staff_id, email, institution_email, is_active';

export async function buildCheckView(svc: Svc, check: CheckRow): Promise<CheckView> {
  const [roster, entries, inchargeEmails, vehicleQ] = await Promise.all([
    loadRouteRosterView(svc, {
      routeId: check.route_id, date: check.check_date, direction: check.leg,
      viewer: { actorId: check.checker_id, isOverrideHolder: false, isSuperAdmin: false },
      withFees: true,
    }),
    loadEntries(svc, check.id),
    inchargeEmailsForRoute(svc, check.route_id),
    check.vehicle_id
      ? svc.from('tms_vehicle').select('registration_number').eq('id', check.vehicle_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (!roster) throw new Error('buildCheckView: route not found');
  if (vehicleQ.error) throw new Error(`buildCheckView: vehicle read failed: ${vehicleQ.error.message}`);
  const ticks = tickIndex(entries);

  const learnerIds = roster.rows.map((r) => r.learner_id);
  const [{ facts }, bookingRoutes] = await Promise.all([
    loadLearnerFeeFacts(svc, learnerIds),
    loadBookingRoutes(svc, learnerIds, check.check_date),
  ]);

  const learners: CheckLearnerRow[] = roster.rows.map((r) => {
    const fee = r.fee ?? { state: 'unknown' as const, owed: null };
    return {
      learnerId: r.learner_id, name: r.name, roll: r.roll, stopId: r.stop_id, stopName: r.stop_name, stopTime: r.stop_time,
      status: r.status, booked: r.booked,
      feeState: countableFeeState(facts.get(r.learner_id)?.mark ?? 'unknown'),
      feeMark: facts.get(r.learner_id)?.mark ?? 'unknown',
      bookingMark: bookingMark(bookingRoutes.get(r.learner_id) ?? [], check.route_id),
      feeOwed: fee.owed,
      notOnRoute: notOnRouteOf(r), otherBus: r.other_bus ?? null,
      checked: ticks.learners.has(r.learner_id), checkOutcome: ticks.learners.get(r.learner_id) ?? null,
    };
  });

  // Staff: allocated riders (staff.transport_route_id) plus the route's active
  // in-charges (≤ 4 per route → one wildcard-safe staffByEmail lookup each).
  const [ridersQ, inchargeStaff] = await Promise.all([
    svc.from('staff').select(STAFF_COLS).eq('transport_route_id', check.route_id).eq('is_active', true),
    mapLimit([...inchargeEmails], 4, (e) => staffByEmail(svc, e)),
  ]);
  if (ridersQ.error) throw new Error(`buildCheckView: staff riders read failed: ${ridersQ.error.message}`);
  const staffById = new Map<string, StaffRow>();
  for (const s of [...(ridersQ.data ?? []), ...inchargeStaff.flat().filter((s) => s.is_active)] as StaffRow[]) staffById.set(s.id, s);
  const bills = await staffBillStates(svc, [...staffById.keys()]);
  const staff: CheckStaffRow[] = [...staffById.values()].map((s) => {
    const isIncharge = [normEmail(s.email), normEmail(s.institution_email)].some((e) => e && inchargeEmails.has(e));
    const bill = bills.get(s.id) ?? { hasOutstanding: false, outstandingAmount: 0, hasBill: false };
    return {
      staffId: s.id, name: staffName(s) || '—', designation: s.designation, code: s.staff_id, isIncharge,
      feeState: entryFeeState({ isIncharge, hasBill: bill.hasBill, hasOutstanding: bill.hasOutstanding }),
      feeOwed: bill.hasOutstanding ? bill.outstandingAmount : null,
      checked: ticks.staff.has(s.id), checkOutcome: ticks.staff.get(s.id) ?? null,
    };
  }).sort((a, b) => Number(b.isIncharge) - Number(a.isIncharge) || a.name.localeCompare(b.name));

  const c = checkCounts(learners.map((l) => ({ booked: l.booked, status: l.status, feeState: l.feeState, notOnRoute: l.notOnRoute })));
  return {
    check: { id: check.id, routeId: check.route_id, status: check.status, checkDate: check.check_date, leg: check.leg, startedAt: check.started_at, submittedAt: check.submitted_at },
    route: { id: roster.route.id, routeNumber: roster.route.route_number, routeName: roster.route.route_name,
      vehicleReg: (vehicleQ.data as { registration_number: string | null } | null)?.registration_number ?? null },
    learners, staff, entries,
    counts: { registered: registeredCount(roster.rows), booked: c.booked, present: c.present, unpaid: c.unpaid,
      withoutBooking: c.withoutBooking, notOnRoute: c.notOnRoute, checked: entries.filter((e) => e.kind !== 'unknown').length },
  };
}
