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
  const out = aggregateAttendance(bookings, attendance, learners, labels);

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
    const r = aggregateAttendance([bk('L1', '2026-07-09')], both, learners, labels);
    expect(r.kpis.boarded).toBe(1);
    expect(r.kpis.records).toBe(2);
    expect(r.kpis.showUpRate).toBe(100);
  });

  it('counts a present learner with no booking as a walk-up', () => {
    const r = aggregateAttendance([], [at('L9', '2026-07-09')], learners, labels);
    expect(r.kpis.walkUps).toBe(1);
    expect(r.kpis.bookedOnScannedDays).toBe(0);
    expect(r.kpis.showUpRate).toBe(0);
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
    const empty = aggregateAttendance([], [], learners, labels);
    expect(empty.unavailable).toBe(false);
    expect(empty.kpis.showUpRate).toBe(0);
    expect(empty.kpis.noShows).toBe(0);
    expect(empty.perDay).toEqual([]);
    expect(empty.noShowByRoute).toEqual([]);
  });

  it('flags unavailable when the caller says the query failed', () => {
    expect(aggregateAttendance([], [], learners, labels, true).unavailable).toBe(true);
  });
});
