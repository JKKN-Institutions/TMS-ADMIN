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

// --- Asymmetric top-N: byRoute is the FULL ranked list, topStops caps at 15. ---
// Generated (not hand-written) so the fixture comfortably clears the cap: 20 distinct
// routes and 20 distinct stops, with stop counts strictly decreasing (MS0 highest,
// MS19 lowest) so "the top 15" is a real, checkable claim rather than an arbitrary slice.
const MANY_ROUTE_COUNT = 20;
const MANY_STOP_COUNT = 20;
const manyRoutes = Array.from({ length: MANY_ROUTE_COUNT }, (_, i) => `MR${i}`);
const manyStops = Array.from({ length: MANY_STOP_COUNT }, (_, i) => `MS${i}`);

const manyLabels: Labels = {
  routes: new Map(manyRoutes.map((id) => [id, `Route ${id}`])),
  stops: new Map(manyStops.map((id) => [id, `Stop ${id}`])),
  institutions: new Map(),
  departments: new Map(),
  programs: new Map(),
};

// MS0 gets 20 bookings, MS1 gets 19, ... MS19 gets 1 — a distinct, descending count
// per stop. Each stop's bookings cycle through all MANY_ROUTE_COUNT routes so every
// route is guaranteed to appear at least once (from the MS0 group, which cycles all 20).
const manyRows: BookingRow[] = manyStops.flatMap((stopId, i) => {
  const count = MANY_STOP_COUNT - i;
  return Array.from({ length: count }, (_, n) => ({
    learner_id: 'LX',
    travel_date: '2026-07-20',
    route_id: manyRoutes[n % manyRoutes.length],
    stop_id: stopId,
    booked_at: '2026-07-19T04:00:00Z',
    booked_by: null,
  }));
});

describe('aggregateBookings top-N asymmetry (byRoute uncapped, topStops capped)', () => {
  const out = aggregateBookings(manyRows, learners, manyLabels);

  it('byRoute returns ALL distinct routes — never capped', () => {
    expect(out.byRoute).toHaveLength(MANY_ROUTE_COUNT);
    expect(new Set(out.byRoute.map((r) => r.id)).size).toBe(MANY_ROUTE_COUNT);
    // every entry is labelled, not just echoing the raw id
    expect(out.byRoute.every((r) => r.label === manyLabels.routes.get(r.id))).toBe(true);
  });

  it('topStops caps at exactly 15 entries', () => {
    expect(out.topStops).toHaveLength(15);
  });

  it('topStops keeps the 15 HIGHEST-count stops, sorted descending — not the lowest or an unsorted slice', () => {
    // MS0..MS14 carry counts 20..6 and must be exactly what survives, in that order.
    expect(out.topStops.map((s) => s.id)).toEqual(manyStops.slice(0, 15));
    expect(out.topStops.map((s) => s.count)).toEqual([20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6]);
    expect(out.topStops[0]).toEqual({ id: 'MS0', label: 'Stop MS0', count: 20 });

    // The lowest-count stops (MS15..MS19, counts 5..1) must be dropped by the cap.
    const droppedIds = manyStops.slice(15);
    for (const id of droppedIds) {
      expect(out.topStops.some((s) => s.id === id)).toBe(false);
    }
  });
});
