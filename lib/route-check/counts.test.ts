import { describe, it, expect } from 'vitest';
import { checkCounts, matchesFilter, scannedCounts, type CheckRowLite, type ScannedPersonLite } from './counts';

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

describe('scannedCounts', () => {
  const p = (o: Partial<ScannedPersonLite>): ScannedPersonLite => ({
    kind: 'learner', outcome: 'ok', feeState: 'paid', bookingState: 'this_route', fineNote: null, ...o,
  });

  it('counts only the people scanned on this check', () => {
    expect(scannedCounts([
      p({}),
      p({ feeState: 'unpaid', outcome: 'fee_unpaid' }),
      p({ bookingState: 'none', outcome: 'no_booking' }),
      p({ bookingState: 'other_route', outcome: 'not_on_route' }),
      p({ kind: 'staff', feeState: 'unpaid', bookingState: null, outcome: 'fee_unpaid' }),
    ])).toEqual({ checked: 5, unpaid: 2, noBooking: 1, notOnRoute: 1, unknownCards: 0, finesRaised: 0 });
  });

  it('keeps unknown cards out of "checked" but reports them', () => {
    expect(scannedCounts([
      p({}),
      p({ kind: 'unknown', outcome: 'unknown_card', feeState: null, bookingState: null }),
    ])).toMatchObject({ checked: 1, unknownCards: 1 });
  });

  it('staff never count as "no booking" (they do not book)', () => {
    expect(scannedCounts([p({ kind: 'staff', bookingState: null })]).noBooking).toBe(0);
  });

  it('counts people fined BY this check, not people who already had a fine', () => {
    expect(scannedCounts([
      p({ fineNote: 'fee:raised booking:raised' }),
      p({ fineNote: 'fee:already_fined booking:booked' }),
      p({ fineNote: 'fee:already_fined booking:raised' }),
      p({ fineNote: 'fines_off' }),
    ]).finesRaised).toBe(2);
  });
});
