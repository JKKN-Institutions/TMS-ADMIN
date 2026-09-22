import { describe, it, expect } from 'vitest';
import { checkCounts, matchesFilter, type CheckRowLite } from './counts';

const rows: CheckRowLite[] = [
  { booked: true, status: 'present', feeState: 'paid', notOnRoute: false },
  { booked: true, status: 'unmarked', feeState: 'unpaid', notOnRoute: false },
  { booked: false, status: 'unmarked', feeState: 'none', notOnRoute: false },
  { booked: false, status: 'absent', feeState: 'unknown', notOnRoute: true },
];

describe('checkCounts', () => {
  it('tallies each dimension independently', () => {
    expect(checkCounts(rows)).toEqual({
      total: 4,
      booked: 2,
      present: 1,
      unpaid: 1,
      withoutBooking: 2,
      notOnRoute: 1,
    });
  });
  it('empty roster', () => {
    expect(checkCounts([])).toEqual({ total: 0, booked: 0, present: 0, unpaid: 0, withoutBooking: 0, notOnRoute: 0 });
  });
});

describe('matchesFilter', () => {
  it('all matches every row', () => {
    rows.forEach((r) => expect(matchesFilter(r, 'all')).toBe(true));
  });
  it('unpaid matches only feeState unpaid', () => {
    expect(rows.map((r) => matchesFilter(r, 'unpaid'))).toEqual([false, true, false, false]);
  });
  it('without_booking matches only unbooked rows', () => {
    expect(rows.map((r) => matchesFilter(r, 'without_booking'))).toEqual([false, false, true, true]);
  });
  it('not_on_route matches only flagged rows', () => {
    expect(rows.map((r) => matchesFilter(r, 'not_on_route'))).toEqual([false, false, false, true]);
  });
});
