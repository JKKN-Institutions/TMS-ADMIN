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

/**
 * The unfiltered case: every input at the same depth. Tests that care about a
 * specific depth override just that field, which makes the distinction being
 * asserted visible in the test body rather than buried in argument order.
 */
const agg = (
  bookings: BookingRow[],
  attendance: AttendanceRow[],
  over: Partial<Parameters<typeof aggregateAttendance>[0]> = {}
) =>
  aggregateAttendance({
    bookings,
    bookingsForWalkUp: bookings,
    attendanceAll: attendance,
    attendanceForJoin: attendance,
    attendanceForComposition: attendance,
    learners,
    labels,
    ...over,
  });

describe('aggregateAttendance', () => {
  // 2026-07-09 is scanned; 2026-07-10 has bookings but NO attendance rows.
  const bookings = [bk('L1', '2026-07-09'), bk('L2', '2026-07-09'), bk('L3', '2026-07-09'), bk('L1', '2026-07-10')];
  const attendance = [at('L1', '2026-07-09'), at('L2', '2026-07-09', { status: 'absent' })];
  // No separate record-level filter in these tests, so join and composition share the same array.
  const out = agg(bookings, attendance);

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
    const r = agg([bk('L1', '2026-07-09')], both);
    expect(r.kpis.boarded).toBe(1);
    expect(r.kpis.records).toBe(2);
    expect(r.kpis.showUpRate).toBe(100);
  });

  it('counts a present learner with no booking as a walk-up', () => {
    const rows = [at('L9', '2026-07-09')];
    const r = agg([], rows);
    expect(r.kpis.walkUps).toBe(1);
    expect(r.kpis.bookedOnScannedDays).toBe(0);
    expect(r.kpis.showUpRate).toBe(0);
  });

  it('dedups a walk-up present in both directions to exactly one, and exercises the is_walk_up flag', () => {
    // No booking at all for L9 -> qualifies as a walk-up via the "!bookingKeys.has(...)" branch.
    const bothDirections = [at('L9', '2026-07-09'), at('L9', '2026-07-09', { direction: 'return' })];
    const r1 = agg([], bothDirections);
    expect(r1.kpis.walkUps).toBe(1);

    // L1 HAS a matching booking, so only the explicit is_walk_up flag can make this
    // count as a walk-up -- exercises the other half of the OR.
    const flagged = [at('L1', '2026-07-09', { is_walk_up: true })];
    const r2 = agg([bk('L1', '2026-07-09')], flagged);
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
    const empty = agg([], []);
    expect(empty.unavailable).toBe(false);
    expect(empty.kpis.showUpRate).toBe(0);
    expect(empty.kpis.noShows).toBe(0);
    expect(empty.perDay).toEqual([]);
    expect(empty.noShowByRoute).toEqual([]);
  });

  it('flags unavailable when the caller says the query failed', () => {
    expect(agg([], [], { unavailable: true }).unavailable).toBe(true);
  });

  it('gates on (route, date), not date alone — an unscanned route must not read as 100% no-show', () => {
    // R1 is scanned on 07-09; R2 is not scanned at all, though it has a booking that day.
    const twoRouteBookings = [bk('L1', '2026-07-09', 'R1'), bk('L2', '2026-07-09', 'R2')];
    const onlyR1Attendance = [at('L1', '2026-07-09', { route_id: 'R1' })];
    const r = agg(twoRouteBookings, onlyR1Attendance);

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
    const r = agg(twoRouteBookings, unknownRouteAttendance);

    // Neither L1 nor L2 boarded, so both are no-shows, but BOTH still enter the
    // denominator because 2026-07-09 was qualified via the null-route row.
    expect(r.kpis.bookedOnScannedDays).toBe(2);
    expect(r.kpis.noShows).toBe(2);
    // The null-route fallback must reach coverage too — this is the inverse of
    // the (route, date) tightening, and it was previously unasserted.
    expect(r.coverage.daysWithAttendance).toBe(1);
    expect(r.coverage.routesWithAttendance).toBe(2);
  });

  it('a record-level filter on attendanceForComposition must not move the show-up denominator', () => {
    const join = [at('L1', '2026-07-09'), at('L2', '2026-07-09', { status: 'absent' })];
    const presentOnly = join.filter((a) => a.status === 'present');
    const bookingsHere = [bk('L1', '2026-07-09'), bk('L2', '2026-07-09')];

    const full = agg(bookingsHere, join);
    const filtered = agg(bookingsHere, join, { attendanceForComposition: presentOnly });

    // The join array is unchanged, so the boarded/no-show math must be identical
    // regardless of what the composition array was narrowed to.
    expect(filtered.kpis.showUpRate).toBe(full.kpis.showUpRate);
    expect(filtered.kpis.bookedOnScannedDays).toBe(full.kpis.bookedOnScannedDays);
    expect(filtered.kpis.noShows).toBe(full.kpis.noShows);

    // Only the composition-fed fields track the narrowed array.
    expect(filtered.kpis.records).toBe(1);
    expect(filtered.byStatus.absent).toBe(0);
  });

  it('a COHORT filter must not move the show-up denominator either', () => {
    // The gate asks "was this route-day scanned by anyone?". D2's only learner
    // (L3) entirely no-showed, so a D2-filtered attendance array is EMPTY —
    // and if that array drove the gate, 2026-07-09 would read as unscanned and
    // L3's booking would vanish from the denominator, turning a 100% no-show
    // cohort into "no data". Prod encodes no-shows as absence, so this is the
    // common case, not an edge case.
    const d2Bookings = [bk('L3', '2026-07-09')];
    const d2Attendance: AttendanceRow[] = []; // nobody in D2 was scanned

    const r = aggregateAttendance({
      bookings: d2Bookings,
      bookingsForWalkUp: d2Bookings,
      attendanceAll: attendance, // full range set — L1/L2 were scanned that day
      attendanceForJoin: d2Attendance,
      attendanceForComposition: d2Attendance,
      learners,
      labels,
    });

    expect(r.kpis.bookedOnScannedDays).toBe(1);
    expect(r.kpis.boarded).toBe(0);
    expect(r.kpis.noShows).toBe(1);
    expect(r.kpis.showUpRate).toBe(0);
  });

  it('a booking-side filter must not turn ordinary boarders into walk-ups', () => {
    // bookedBy filters bookings only — attendance has no such column. Filtering
    // to admin-made bookings hides L1's self-made one, so testing walk-ups
    // against the narrowed set would report L1's boarding as a walk-up.
    const allBookings = [bk('L1', '2026-07-09'), bk('L2', '2026-07-09')];
    const adminOnly = [bk('L2', '2026-07-09')]; // L1 booked for themselves
    const rows = [at('L1', '2026-07-09'), at('L2', '2026-07-09')];

    const r = aggregateAttendance({
      bookings: adminOnly,
      bookingsForWalkUp: allBookings, // cohort depth, bookedBy NOT applied
      attendanceAll: rows,
      attendanceForJoin: rows,
      attendanceForComposition: rows,
      learners,
      labels,
    });

    expect(r.kpis.walkUps).toBe(0);
    // The booking-side filter still narrows what is ANALYSED, just not the
    // definition of "had a booking".
    expect(r.kpis.bookedOnScannedDays).toBe(1);
  });

  it('counts a day as scanned only if a BOOKED route was scanned that day', () => {
    // R2 has bookings but was never scanned. R1 was scanned on 07-09. Under a
    // route filter selecting only R2, a date-only test would see "07-09 was
    // scanned" (by R1) and claim the day as covered. Prod scan calendars are
    // near-disjoint, so any single-route filter hits this.
    const r2Only = [bk('L1', '2026-07-09', 'R2'), bk('L2', '2026-07-10', 'R2')];
    const r1Attendance = [at('L3', '2026-07-09', { route_id: 'R1' })];
    const r = agg(r2Only, r1Attendance);

    expect(r.coverage.routesWithAttendance).toBe(0);
    expect(r.coverage.daysWithAttendance).toBe(0); // NOT 1 — 07-09 was scanned on R1, not R2
    expect(r.coverage.daysInRange).toBe(2);
  });

  it('orders byDepartment by no-shows descending, not alphabetically', () => {
    // 'Aardvark' sorts first alphabetically but has the FEWEST no-shows. The tab
    // slices [0,15] off this array under a "Top 15" label, so an alphabetical
    // order silently turns the chart into "the alphabetically-first 15".
    const local = new Map<string, LearnerDim>([
      ['A1', { id: 'A1', profileId: null, institutionId: null, departmentId: 'DA', programId: null }],
      ['B1', { id: 'B1', profileId: null, institutionId: null, departmentId: 'DB', programId: null }],
      ['B2', { id: 'B2', profileId: null, institutionId: null, departmentId: 'DB', programId: null }],
      ['B3', { id: 'B3', profileId: null, institutionId: null, departmentId: 'DB', programId: null }],
    ]);
    const localLabels: Labels = {
      ...labels,
      departments: new Map([['DA', 'Aardvark Studies'], ['DB', 'Zoology']]),
    };
    const rows = [bk('A1', '2026-07-09'), bk('B1', '2026-07-09'), bk('B2', '2026-07-09'), bk('B3', '2026-07-09')];
    const scan = [at('A1', '2026-07-09')]; // only A1 boarded

    const r = aggregateAttendance({
      bookings: rows,
      bookingsForWalkUp: rows,
      attendanceAll: scan,
      attendanceForJoin: scan,
      attendanceForComposition: scan,
      learners: local,
      labels: localLabels,
    });

    expect(r.byDepartment.map((d) => d.label)).toEqual(['Zoology', 'Aardvark Studies']);
    expect(r.byDepartment[0].noShows).toBe(3);
  });

  it('measures the manual-capture share over the JOIN population, not the filtered records', () => {
    // The manual share caveats the show-up figures, which are never
    // method-filtered. Filtering records to qr_scan must NOT report 0% manual
    // and retract a warning that still applies.
    const rows = [bk('L1', '2026-07-09'), bk('L2', '2026-07-09')];
    const join = [
      at('L1', '2026-07-09', { method: 'qr_scan' }),
      at('L2', '2026-07-09', { method: 'manual' }),
    ];
    const qrOnly = join.filter((a) => a.method === 'qr_scan');

    const unfiltered = agg(rows, join);
    const filtered = agg(rows, join, { attendanceForComposition: qrOnly });

    expect(unfiltered.kpis.manualSharePct).toBe(50);
    expect(filtered.kpis.manualSharePct).toBe(50); // unmoved by the record filter
    expect(filtered.byMethod).toEqual({ qr_scan: 1, manual: 0 }); // composition still narrows
  });

  it('scopes the manual-capture share to the COHORT, not the whole fleet', () => {
    // The assertion above cannot tell attendanceForJoin from attendanceAll — the
    // helper defaults them to the same array, so it passes with either denominator.
    // Here the cohort is all-manual inside a fleet that is half-manual: only a
    // join-scoped denominator yields 100. A refactor to attendanceAll gives 50.
    const cohortBooking = [bk('L1', '2026-07-09')];
    const cohortAttendance = [at('L1', '2026-07-09', { method: 'manual' })];
    const fleetAttendance = [
      ...cohortAttendance,
      at('L2', '2026-07-09', { method: 'qr_scan' }),
      at('L3', '2026-07-09', { method: 'qr_scan' }),
    ];

    const r = aggregateAttendance({
      bookings: cohortBooking,
      bookingsForWalkUp: cohortBooking,
      attendanceAll: fleetAttendance, // 1 of 3 manual = 33% fleet-wide
      attendanceForJoin: cohortAttendance, // 1 of 1 manual = 100% for this cohort
      attendanceForComposition: cohortAttendance,
      learners,
      labels,
    });

    // The user is reading THIS cohort's show-up rate, so the caveat must describe
    // this cohort. A fleet-wide 33% would under-warn about the figure on screen.
    expect(r.kpis.manualSharePct).toBe(100);
  });

  it('never reports more scanned routes than the bookings cover', () => {
    // Coverage is a fraction of the ANALYSED bookings. Counting distinct routes
    // straight off the attendance array would report "2 of 1" here.
    const oneRoute = [bk('L1', '2026-07-09', 'R1')];
    const wideAttendance = [
      at('L1', '2026-07-09', { route_id: 'R1' }),
      at('L2', '2026-07-09', { route_id: 'R2' }),
    ];
    const r = agg(oneRoute, wideAttendance);

    expect(r.coverage.routesInRange).toBe(1);
    expect(r.coverage.routesWithAttendance).toBe(1);
    expect(r.coverage.routesWithAttendance).toBeLessThanOrEqual(r.coverage.routesInRange);
  });
});
