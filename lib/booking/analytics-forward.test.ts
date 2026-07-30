// lib/booking/analytics-forward.test.ts
import { describe, it, expect } from 'vitest';
import { aggregateToday, aggregateUpcoming } from './analytics-forward';
import type { AttendanceRow, BookingRow, Labels, LearnerDim } from './analytics-types';

const learners = new Map<string, LearnerDim>([
  ['L1', { id: 'L1', profileId: 'P1', institutionId: 'I1', departmentId: 'D1', programId: 'G1' }],
  ['L2', { id: 'L2', profileId: 'P2', institutionId: 'I1', departmentId: 'D1', programId: 'G1' }],
  ['L3', { id: 'L3', profileId: 'P3', institutionId: 'I1', departmentId: 'D2', programId: 'G2' }],
]);

const labels: Labels = {
  routes: new Map([['R1', '05 · Sankari'], ['R2', '18 · Ganapathipalayam']]),
  stops: new Map([['S1', 'Ammapet']]),
  institutions: new Map([['I1', 'Engineering']]),
  departments: new Map([['D1', 'CSE'], ['D2', 'ECE']]),
  programs: new Map(),
  staff: new Map(),
};

const bk = (learner: string, date: string, route = 'R1', stop: string | null = null): BookingRow => ({
  learner_id: learner, travel_date: date, route_id: route, stop_id: stop,
  booked_at: `${date}T04:00:00Z`, booked_by: null,
});

const at = (learner: string, date: string, over: Partial<AttendanceRow> = {}): AttendanceRow => ({
  learner_id: learner, trip_date: date, route_id: 'R1', stop_id: null,
  direction: 'onward', status: 'present', method: 'qr_scan', is_walk_up: false, scanned_by: null, ...over,
});

const TODAY = '2026-07-27';

describe('aggregateToday', () => {
  it('splits the roster into present, absent and still-unmarked', () => {
    const bookings = [bk('L1', TODAY), bk('L2', TODAY), bk('L3', TODAY)];
    const attendance = [at('L1', TODAY), at('L2', TODAY, { status: 'absent' })];
    const r = aggregateToday(TODAY, bookings, attendance, labels);

    expect(r.booked).toBe(3);
    expect(r.present).toBe(1);
    expect(r.absent).toBe(1);
    expect(r.unmarked).toBe(1); // L3 has no row at all
    expect(r.marked).toBe(2);
    // The three buckets must exhaust the roster — an operator reading "still to
    // scan" needs that number to be trustworthy.
    expect(r.present + r.absent + r.unmarked).toBe(r.booked);
    expect(r.markedPct).toBe(66.7);
  });

  it('counts a learner present in either direction as marked exactly once', () => {
    const bookings = [bk('L1', TODAY)];
    const both = [at('L1', TODAY), at('L1', TODAY, { direction: 'return' })];
    const r = aggregateToday(TODAY, bookings, both, labels);

    expect(r.marked).toBe(1);
    expect(r.present).toBe(1);
    expect(r.unmarked).toBe(0);
  });

  it('treats present as winning over absent across the two legs', () => {
    // Marked absent on the onward leg but boarded the return — they travelled.
    const bookings = [bk('L1', TODAY)];
    const mixed = [at('L1', TODAY, { status: 'absent' }), at('L1', TODAY, { direction: 'return' })];
    const r = aggregateToday(TODAY, bookings, mixed, labels);

    expect(r.present).toBe(1);
    expect(r.absent).toBe(0);
  });

  it('excludes walk-ups — they are not part of the booked roster being worked through', () => {
    const bookings = [bk('L1', TODAY)];
    const withWalkUp = [at('L1', TODAY), at('L9', TODAY, { is_walk_up: true })];
    const r = aggregateToday(TODAY, bookings, withWalkUp, labels);

    expect(r.booked).toBe(1);
    expect(r.present).toBe(1);
    // L9 must not inflate marked past booked, which would make unmarked negative.
    expect(r.marked).toBe(1);
    expect(r.unmarked).toBe(0);
  });

  it('ranks routes by how many are still unmarked, worst first', () => {
    const bookings = [
      bk('L1', TODAY, 'R1'),
      bk('L2', TODAY, 'R2'),
      bk('L3', TODAY, 'R2'),
    ];
    const attendance = [at('L1', TODAY, { route_id: 'R1' })]; // R1 done, R2 untouched
    const r = aggregateToday(TODAY, bookings, attendance, labels);

    expect(r.byRoute[0].id).toBe('R2');
    expect(r.byRoute[0].unmarked).toBe(2);
    expect(r.byRoute[1].id).toBe('R1');
    expect(r.byRoute[1].unmarked).toBe(0);
  });

  it('returns a zeroed, non-NaN block when nothing is booked', () => {
    const r = aggregateToday(TODAY, [], [], labels);
    expect(r.markedPct).toBe(0);
    expect(r.unmarked).toBe(0);
    expect(r.byRoute).toEqual([]);
  });
});

describe('aggregateUpcoming', () => {
  const from = '2026-07-28';
  const to = '2026-07-30';

  it('summarises forward demand per day and per route', () => {
    const bookings = [
      bk('L1', '2026-07-28', 'R1', 'S1'),
      bk('L2', '2026-07-28', 'R1', 'S1'),
      bk('L3', '2026-07-29', 'R2'),
    ];
    const r = aggregateUpcoming(from, to, bookings, learners, labels, new Map());

    expect(r.kpis.total).toBe(3);
    expect(r.kpis.learners).toBe(3);
    expect(r.kpis.routes).toBe(2);
    expect(r.kpis.days).toBe(2);
    expect(r.kpis.peakDay).toEqual({ date: '2026-07-28', count: 2 });
    expect(r.perDay).toEqual([
      { date: '2026-07-28', count: 2 },
      { date: '2026-07-29', count: 1 },
    ]);
    expect(r.topStops).toEqual([{ id: 'S1', label: 'Ammapet', count: 2 }]);
    expect(r.byDepartment.map((d) => d.label)).toEqual(['CSE', 'ECE']);
  });

  it('reports capacity as null rather than zero when no vehicle capacity is known', () => {
    // tms_route.total_capacity is dead data (0/null on 23 of 24 routes), so an
    // unknown capacity must never render as a real 0 — that would show every
    // route infinitely over capacity.
    const bookings = [bk('L1', '2026-07-28', 'R2')];
    const r = aggregateUpcoming(from, to, bookings, learners, labels, new Map());

    const row = r.byRoute.find((x) => x.id === 'R2')!;
    expect(row.capacity).toBeNull();
    expect(row.peakUtilization).toBeNull();
    expect(r.kpis.routesWithoutCapacity).toBe(1);
    expect(r.kpis.routesOverCapacity).toBe(0); // unknown capacity is NOT over capacity
  });

  it('measures utilization against the busiest single day, not the range total', () => {
    // 4 bookings over 2 days on a 3-seat bus. Summing the range would read 133%
    // and cry overflow; the bus only ever carries 2 at once, so it fits.
    const bookings = [
      bk('L1', '2026-07-28', 'R1'), bk('L2', '2026-07-28', 'R1'),
      bk('L3', '2026-07-29', 'R1'), bk('L1', '2026-07-30', 'R1'),
    ];
    const r = aggregateUpcoming(from, to, bookings, learners, labels, new Map([['R1', 3]]));

    const row = r.byRoute[0];
    expect(row.count).toBe(4);
    expect(row.peakDay).toEqual({ date: '2026-07-28', count: 2 });
    expect(row.peakUtilization).toBe(66.7);
    expect(r.overCapacity).toEqual([]);
  });

  it('flags only the route-days that actually exceed the seats', () => {
    const bookings = [
      bk('L1', '2026-07-28', 'R1'), bk('L2', '2026-07-28', 'R1'), bk('L3', '2026-07-28', 'R1'),
      bk('L1', '2026-07-29', 'R1'),
    ];
    const r = aggregateUpcoming(from, to, bookings, learners, labels, new Map([['R1', 2]]));

    expect(r.overCapacity).toEqual([
      { routeId: 'R1', label: '05 · Sankari', date: '2026-07-28', booked: 3, capacity: 2 },
    ]);
    expect(r.kpis.routesOverCapacity).toBe(1);
  });

  it('ranks over-capacity by overflow size, not raw bookings', () => {
    // R1: 3 booked on 2 seats = 1 over. R2: 4 booked on 10 seats = fits.
    // A raw-count sort would rank R2's busier day first despite it being fine.
    const bookings = [
      bk('L1', '2026-07-28', 'R1'), bk('L2', '2026-07-28', 'R1'), bk('L3', '2026-07-28', 'R1'),
      bk('L1', '2026-07-29', 'R2'), bk('L2', '2026-07-29', 'R2'),
      bk('L3', '2026-07-29', 'R2'), bk('L1', '2026-07-30', 'R2'),
    ];
    const r = aggregateUpcoming(
      from, to, bookings, learners, labels, new Map([['R1', 2], ['R2', 10]])
    );

    expect(r.overCapacity).toHaveLength(1);
    expect(r.overCapacity[0].routeId).toBe('R1');
  });

  it('returns a zeroed, non-NaN block for an empty horizon', () => {
    const r = aggregateUpcoming(from, to, [], learners, labels, new Map());
    expect(r.kpis.total).toBe(0);
    expect(r.kpis.peakDay).toBeNull();
    expect(r.perDay).toEqual([]);
    expect(r.byRoute).toEqual([]);
    expect(r.overCapacity).toEqual([]);
    expect(r.kpis.routesWithoutCapacity).toBe(0);
  });
});
