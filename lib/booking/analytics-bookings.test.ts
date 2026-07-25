// lib/booking/analytics-bookings.test.ts
import { describe, it, expect } from 'vitest';
import { aggregateBookings } from './analytics-bookings';
import type { BookingRow, Labels, LearnerDim } from './analytics-types';

const learners = new Map<string, LearnerDim>([
  ['L1', { id: 'L1', profileId: 'P1', institutionId: 'I1', departmentId: 'D1', programId: 'G1' }],
  ['L2', { id: 'L2', profileId: 'P2', institutionId: 'I1', departmentId: 'D2', programId: 'G2' }],
]);

const labels: Labels = {
  routes: new Map([['R1', '05 · Sankari'], ['R2', '12 · Salem']]),
  stops: new Map([['S1', 'Main Gate']]),
  institutions: new Map([['I1', 'Engineering']]),
  departments: new Map([['D1', 'CSE'], ['D2', 'ECE']]),
  programs: new Map(),
};

// 2026-07-20 is a Monday; 2026-07-21 a Tuesday.
const rows: BookingRow[] = [
  { learner_id: 'L1', travel_date: '2026-07-20', route_id: 'R1', stop_id: 'S1', booked_at: '2026-07-19T04:00:00Z', booked_by: 'P1' },
  { learner_id: 'L2', travel_date: '2026-07-20', route_id: 'R1', stop_id: 'S1', booked_at: '2026-07-10T04:00:00Z', booked_by: 'ADMIN' },
  { learner_id: 'L1', travel_date: '2026-07-21', route_id: 'R2', stop_id: null, booked_at: '2026-07-21T04:00:00Z', booked_by: null },
];

describe('aggregateBookings', () => {
  const out = aggregateBookings(rows, learners, labels);

  it('reports headline KPIs', () => {
    expect(out.kpis.total).toBe(3);
    expect(out.kpis.learners).toBe(2);
    expect(out.kpis.routes).toBe(2);
    expect(out.kpis.days).toBe(2);
  });

  it('divides avgPerDay by BOOKED days, not calendar days', () => {
    expect(out.kpis.avgPerDay).toBe(1.5); // 3 bookings / 2 booked days
  });

  it('picks the busiest day as the peak', () => {
    expect(out.kpis.peakDay).toEqual({ date: '2026-07-20', count: 2 });
  });

  it('orders perDay ascending by date', () => {
    expect(out.perDay).toEqual([
      { date: '2026-07-20', count: 2 },
      { date: '2026-07-21', count: 1 },
    ]);
  });

  it('ranks routes by count, labelled', () => {
    expect(out.byRoute).toEqual([
      { id: 'R1', label: '05 · Sankari', count: 2 },
      { id: 'R2', label: '12 · Salem', count: 1 },
    ]);
  });

  it('emits all five lead-time buckets even when empty', () => {
    expect(out.leadTime.map((b) => b.bucket)).toEqual(['same_day', 'd1', 'd2_3', 'd4_7', 'd8_plus']);
    expect(out.leadTime.find((b) => b.bucket === 'd1')?.count).toBe(1);
    expect(out.leadTime.find((b) => b.bucket === 'd8_plus')?.count).toBe(1);
    expect(out.leadTime.find((b) => b.bucket === 'same_day')?.count).toBe(1);
  });

  it('emits all seven weekdays, Monday first', () => {
    expect(out.byWeekday).toHaveLength(7);
    expect(out.byWeekday[0]).toEqual({ weekday: 0, label: 'Mon', count: 2 });
    expect(out.byWeekday[1]).toEqual({ weekday: 1, label: 'Tue', count: 1 });
    expect(out.byWeekday[6].count).toBe(0);
  });

  it('splits booked-by three ways', () => {
    expect(out.bookedBy).toEqual({ self: 1, admin: 1, unknown: 1 });
    expect(out.kpis.selfPct).toBe(33.3);
  });

  it('rolls up institutions and departments', () => {
    expect(out.byInstitution).toEqual([{ id: 'I1', label: 'Engineering', count: 3 }]);
    expect(out.byDepartment.map((d) => d.label)).toEqual(['CSE', 'ECE']);
  });

  it('counts stops, skipping null stop ids', () => {
    expect(out.topStops).toEqual([{ id: 'S1', label: 'Main Gate', count: 2 }]);
  });

  it('returns zeroed KPIs and empty series for empty input, never NaN', () => {
    const empty = aggregateBookings([], learners, labels);
    expect(empty.kpis.total).toBe(0);
    expect(empty.kpis.avgPerDay).toBe(0);
    expect(empty.kpis.selfPct).toBe(0);
    expect(empty.kpis.peakDay).toBeNull();
    expect(empty.perDay).toEqual([]);
    expect(empty.byRoute).toEqual([]);
    expect(empty.leadTime.every((b) => b.count === 0)).toBe(true);
    expect(empty.byWeekday.every((d) => d.count === 0)).toBe(true);
  });
});
