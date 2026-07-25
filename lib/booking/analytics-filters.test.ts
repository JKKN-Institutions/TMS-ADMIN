// lib/booking/analytics-filters.test.ts
import { describe, it, expect } from 'vitest';
import { matchesLearner, filterBookings, filterAttendance, buildFacets } from './analytics-filters';
import { EMPTY_FILTERS, type AttendanceRow, type BookingRow, type Labels, type LearnerDim } from './analytics-types';

const learners = new Map<string, LearnerDim>([
  ['L1', { id: 'L1', profileId: 'P1', institutionId: 'I1', departmentId: 'D1', programId: 'G1' }],
  ['L2', { id: 'L2', profileId: 'P2', institutionId: 'I2', departmentId: 'D2', programId: 'G2' }],
]);

const labels: Labels = {
  routes: new Map([['R1', '05 · Sankari'], ['R2', '12 · Salem']]),
  stops: new Map([['S1', 'Main Gate'], ['S2', 'Ammapet']]),
  institutions: new Map([['I1', 'Engineering'], ['I2', 'Pharmacy']]),
  departments: new Map([['D1', 'CSE'], ['D2', 'Pharm.D']]),
  programs: new Map([['G1', 'B.E. CSE'], ['G2', 'Pharm.D']]),
};

const bookings: BookingRow[] = [
  { learner_id: 'L1', travel_date: '2026-07-09', route_id: 'R1', stop_id: 'S1', booked_at: '2026-07-08T04:00:00Z', booked_by: 'P1' },
  { learner_id: 'L2', travel_date: '2026-07-09', route_id: 'R2', stop_id: 'S2', booked_at: '2026-07-01T04:00:00Z', booked_by: 'ADMIN' },
  { learner_id: 'L9', travel_date: '2026-07-10', route_id: 'R1', stop_id: null, booked_at: '2026-07-09T04:00:00Z', booked_by: null },
];

const attendance: AttendanceRow[] = [
  { learner_id: 'L1', trip_date: '2026-07-09', route_id: 'R1', stop_id: 'S1', direction: 'onward', status: 'present', method: 'qr_scan', is_walk_up: false },
  { learner_id: 'L2', trip_date: '2026-07-09', route_id: 'R2', stop_id: 'S2', direction: 'return', status: 'absent', method: 'manual', is_walk_up: false },
];

describe('matchesLearner', () => {
  it('passes everything when no academic filter is active', () => {
    expect(matchesLearner(learners.get('L1'), EMPTY_FILTERS)).toBe(true);
    expect(matchesLearner(undefined, EMPTY_FILTERS)).toBe(true);
  });

  it('matches on any one academic dimension and supports multi-select', () => {
    expect(matchesLearner(learners.get('L1'), { ...EMPTY_FILTERS, departmentIds: ['D1'] })).toBe(true);
    expect(matchesLearner(learners.get('L2'), { ...EMPTY_FILTERS, departmentIds: ['D1'] })).toBe(false);
    expect(matchesLearner(learners.get('L2'), { ...EMPTY_FILTERS, departmentIds: ['D1', 'D2'] })).toBe(true);
  });

  it('requires ALL active academic dimensions to match', () => {
    const f = { ...EMPTY_FILTERS, institutionIds: ['I1'], programIds: ['G2'] };
    expect(matchesLearner(learners.get('L1'), f)).toBe(false);
  });

  it('excludes an unresolvable learner once any academic filter is active', () => {
    expect(matchesLearner(undefined, { ...EMPTY_FILTERS, institutionIds: ['I1'] })).toBe(false);
  });
});

describe('filterBookings', () => {
  it('returns every row when no filter is set', () => {
    expect(filterBookings(bookings, learners, EMPTY_FILTERS)).toHaveLength(3);
  });

  it('filters by route and by stop', () => {
    expect(filterBookings(bookings, learners, { ...EMPTY_FILTERS, routeIds: ['R1'] })).toHaveLength(2);
    expect(filterBookings(bookings, learners, { ...EMPTY_FILTERS, stopIds: ['S1'] })).toHaveLength(1);
  });

  it('drops rows with a null stop when a stop filter is active', () => {
    const out = filterBookings(bookings, learners, { ...EMPTY_FILTERS, stopIds: ['S1', 'S2'] });
    expect(out.map((b) => b.learner_id)).toEqual(['L1', 'L2']);
  });

  it('filters by booked-by, treating a null booker as neither self nor admin', () => {
    expect(filterBookings(bookings, learners, { ...EMPTY_FILTERS, bookedBy: 'self' }).map((b) => b.learner_id)).toEqual(['L1']);
    expect(filterBookings(bookings, learners, { ...EMPTY_FILTERS, bookedBy: 'admin' }).map((b) => b.learner_id)).toEqual(['L2']);
  });
});

describe('filterAttendance', () => {
  it('filters by direction, status and method independently', () => {
    expect(filterAttendance(attendance, learners, { ...EMPTY_FILTERS, direction: 'onward' })).toHaveLength(1);
    expect(filterAttendance(attendance, learners, { ...EMPTY_FILTERS, attStatus: 'absent' })).toHaveLength(1);
    expect(filterAttendance(attendance, learners, { ...EMPTY_FILTERS, method: 'qr_scan' })).toHaveLength(1);
  });

  it('applies academic filters to attendance too', () => {
    expect(filterAttendance(attendance, learners, { ...EMPTY_FILTERS, departmentIds: ['D2'] }).map((a) => a.learner_id)).toEqual(['L2']);
  });
});

describe('buildFacets', () => {
  it('lists only ids present in the data, labelled and sorted', () => {
    const f = buildFacets(bookings, attendance, learners, labels);
    expect(f.routes.map((r) => r.label)).toEqual(['05 · Sankari', '12 · Salem']);
    expect(f.departments.map((d) => d.label)).toEqual(['CSE', 'Pharm.D']);
    expect(f.stops.find((s) => s.id === 'S2')?.routeId).toBe('R2');
  });

  it('falls back to the raw id when a label is missing', () => {
    const f = buildFacets(bookings, [], learners, { ...labels, routes: new Map() });
    expect(f.routes.map((r) => r.label).sort()).toEqual(['R1', 'R2']);
  });

  it('returns empty facet lists for empty input', () => {
    const f = buildFacets([], [], learners, labels);
    expect(f).toEqual({ routes: [], stops: [], institutions: [], departments: [], programs: [] });
  });
});
