// lib/booking/analytics-attendance.test.ts
import { describe, it, expect } from 'vitest';
import { aggregateAttendance } from './analytics-attendance';
import type { AttendanceRow, BookingRow, Labels, LearnerDim } from './analytics-types';

const learners = new Map<string, LearnerDim>([
  ['L1', { id: 'L1', profileId: 'P1', institutionId: 'I1', departmentId: 'D1', programId: 'G1' }],
  ['L2', { id: 'L2', profileId: 'P2', institutionId: 'I1', departmentId: 'D1', programId: 'G1' }],
  ['L3', { id: 'L3', profileId: 'P3', institutionId: 'I1', departmentId: 'D2', programId: 'G2' }],
]);

const labels: Labels = {
  routes: new Map([['R1', '05 · Sankari']]),
  stops: new Map(),
  institutions: new Map([['I1', 'Engineering']]),
  departments: new Map([['D1', 'CSE'], ['D2', 'ECE']]),
  programs: new Map(),
};

const bk = (learner: string, date: string, route = 'R1'): BookingRow => ({
  learner_id: learner, travel_date: date, route_id: route, stop_id: null,
  booked_at: `${date}T04:00:00Z`, booked_by: null,
});

const at = (
  learner: string, date: string, over: Partial<AttendanceRow> = {}
): AttendanceRow => ({
  learner_id: learner, trip_date: date, route_id: 'R1', stop_id: null,
  direction: 'onward', status: 'present', method: 'qr_scan', is_walk_up: false, ...over,
});

describe('aggregateAttendance', () => {
  // 2026-07-09 is scanned; 2026-07-10 has bookings but NO attendance rows.
  const bookings = [bk('L1', '2026-07-09'), bk('L2', '2026-07-09'), bk('L3', '2026-07-09'), bk('L1', '2026-07-10')];
  const attendance = [at('L1', '2026-07-09'), at('L2', '2026-07-09', { status: 'absent' })];
  // No separate record-level filter in these tests, so join and composition share the same array.
  const out = aggregateAttendance(bookings, attendance, attendance, learners, labels);

  it('excludes unscanned days from BOTH the numerator and the denominator', () => {
    // 3 bookings on the scanned day; the 2026-07-10 booking is ignored entirely.
    expect(out.kpis.bookedOnScannedDays).toBe(3);
  });

  it('counts a booked learner marked present as boarded', () => {
    expect(out.kpis.boarded).toBe(1);
  });

  it('does NOT count an `absent` row as boarded', () => {
    // L2 has an attendance row, but status=absent -> no-show.
    expect(out.kpis.noShows).toBe(2); // L2 (absent) + L3 (no row at all)
  });

  it('computes the show-up rate against the scanned-day denominator', () => {
    expect(out.kpis.showUpRate).toBe(33.3); // 1 / 3
  });

  it('counts raw attendance records separately from boardings', () => {
    expect(out.kpis.records).toBe(2);
    expect(out.kpis.present).toBe(1);
    expect(out.kpis.absent).toBe(1);
  });

  it('treats a learner present in EITHER direction as boarded, without double counting', () => {
    const both = [at('L1', '2026-07-09'), at('L1', '2026-07-09', { direction: 'return' })];
    const r = aggregateAttendance([bk('L1', '2026-07-09')], both, both, learners, labels);
    expect(r.kpis.boarded).toBe(1);
    expect(r.kpis.records).toBe(2);
    expect(r.kpis.showUpRate).toBe(100);
  });

  it('counts a present learner with no booking as a walk-up', () => {
    const rows = [at('L9', '2026-07-09')];
    const r = aggregateAttendance([], rows, rows, learners, labels);
    expect(r.kpis.walkUps).toBe(1);
    expect(r.kpis.bookedOnScannedDays).toBe(0);
    expect(r.kpis.showUpRate).toBe(0);
  });

  it('dedups a walk-up present in both directions to exactly one, and exercises the is_walk_up flag', () => {
    // No booking at all for L9 -> qualifies as a walk-up via the "!bookingKeys.has(...)" branch.
    const bothDirections = [at('L9', '2026-07-09'), at('L9', '2026-07-09', { direction: 'return' })];
    const r1 = aggregateAttendance([], bothDirections, bothDirections, learners, labels);
    expect(r1.kpis.walkUps).toBe(1);

    // L1 HAS a matching booking, so only the explicit is_walk_up flag can make this
    // count as a walk-up -- exercises the other half of the OR.
    const flagged = [at('L1', '2026-07-09', { is_walk_up: true })];
    const r2 = aggregateAttendance([bk('L1', '2026-07-09')], flagged, flagged, learners, labels);
    expect(r2.kpis.walkUps).toBe(1);
  });

  it('reports route and day coverage', () => {
    expect(out.coverage).toEqual({
      routesWithAttendance: 1, routesInRange: 1, daysWithAttendance: 1, daysInRange: 2,
    });
  });

  it('breaks no-shows down per day and per route', () => {
    expect(out.perDay).toEqual([{ date: '2026-07-09', booked: 3, boarded: 1, noShows: 2 }]);
    expect(out.noShowByRoute).toEqual([
      { id: 'R1', label: '05 · Sankari', booked: 3, boarded: 1, noShows: 2, rate: 66.7 },
    ]);
  });

  it('breaks no-shows down per department', () => {
    expect(out.byDepartment).toEqual([
      { id: 'D1', label: 'CSE', booked: 2, boarded: 1, noShows: 1, rate: 50 },
      { id: 'D2', label: 'ECE', booked: 1, boarded: 0, noShows: 1, rate: 100 },
    ]);
  });

  it('tallies direction, method and status', () => {
    expect(out.byDirection).toEqual({ onward: 2, return: 0 });
    expect(out.byMethod).toEqual({ qr_scan: 2, manual: 0 });
    expect(out.byStatus).toEqual({ present: 1, absent: 1 });
  });

  it('returns a zeroed, non-NaN block for empty input', () => {
    const empty = aggregateAttendance([], [], [], learners, labels);
    expect(empty.unavailable).toBe(false);
    expect(empty.kpis.showUpRate).toBe(0);
    expect(empty.kpis.noShows).toBe(0);
    expect(empty.perDay).toEqual([]);
    expect(empty.noShowByRoute).toEqual([]);
  });

  it('flags unavailable when the caller says the query failed', () => {
    expect(aggregateAttendance([], [], [], learners, labels, true).unavailable).toBe(true);
  });

  it('gates on (route, date), not date alone — an unscanned route must not read as 100% no-show', () => {
    // R1 is scanned on 07-09; R2 is not scanned at all, though it has a booking that day.
    const twoRouteBookings = [bk('L1', '2026-07-09', 'R1'), bk('L2', '2026-07-09', 'R2')];
    const onlyR1Attendance = [at('L1', '2026-07-09', { route_id: 'R1' })];
    const r = aggregateAttendance(twoRouteBookings, onlyR1Attendance, onlyR1Attendance, learners, labels);

    // The R2 booking must be excluded entirely: not in the denominator, and R2 must
    // not appear in noShowByRoute at all (the regression this guards against would
    // rank R2 as 100% no-show and sort it to the top of the "worst routes" chart).
    expect(r.kpis.bookedOnScannedDays).toBe(1);
    expect(r.noShowByRoute.some((row) => row.id === 'R2')).toBe(false);
    expect(r.noShowByRoute).toEqual([
      { id: 'R1', label: '05 · Sankari', booked: 1, boarded: 1, noShows: 0, rate: 0 },
    ]);
  });

  it('a null-route attendance row conservatively qualifies bookings on that date across ALL routes', () => {
    const twoRouteBookings = [bk('L1', '2026-07-09', 'R1'), bk('L2', '2026-07-09', 'R2')];
    // An attendance row with no route attribution -- can't tell which route it belongs
    // to, so it qualifies the whole date rather than excluding everything on it.
    const unknownRouteAttendance = [at('L9', '2026-07-09', { route_id: null })];
    const r = aggregateAttendance(twoRouteBookings, unknownRouteAttendance, unknownRouteAttendance, learners, labels);

    // Neither L1 nor L2 boarded, so both are no-shows, but BOTH still enter the
    // denominator because 2026-07-09 was qualified via the null-route row.
    expect(r.kpis.bookedOnScannedDays).toBe(2);
    expect(r.kpis.noShows).toBe(2);
  });

  it('a record-level filter on attendanceForComposition must not move the show-up denominator', () => {
    const join = [at('L1', '2026-07-09'), at('L2', '2026-07-09', { status: 'absent' })];
    const presentOnly = join.filter((a) => a.status === 'present');
    const bookingsHere = [bk('L1', '2026-07-09'), bk('L2', '2026-07-09')];

    const full = aggregateAttendance(bookingsHere, join, join, learners, labels);
    const filtered = aggregateAttendance(bookingsHere, join, presentOnly, learners, labels);

    // The join array is unchanged, so the boarded/no-show math must be identical
    // regardless of what the composition array was narrowed to.
    expect(filtered.kpis.showUpRate).toBe(full.kpis.showUpRate);
    expect(filtered.kpis.bookedOnScannedDays).toBe(full.kpis.bookedOnScannedDays);
    expect(filtered.kpis.noShows).toBe(full.kpis.noShows);

    // Only the composition-fed fields track the narrowed array.
    expect(filtered.kpis.records).toBe(1);
    expect(filtered.byStatus.absent).toBe(0);
  });
});
