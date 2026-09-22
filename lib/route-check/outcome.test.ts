import { describe, it, expect } from 'vitest';
import { learnerCheckOutcome, staffCheckOutcome } from './outcome';

describe('learnerCheckOutcome (first match wins: unknown -> not_on_route -> no_booking -> fee_unpaid -> ok)', () => {
  const base = { known: true, onRoute: true, booked: true, feeUnpaid: false };
  it('ok when everything checks out', () => {
    expect(learnerCheckOutcome(base)).toBe('ok');
  });
  it('unknown_card beats every other condition', () => {
    expect(learnerCheckOutcome({ ...base, known: false, onRoute: false, booked: false, feeUnpaid: true })).toBe('unknown_card');
  });
  it('not_on_route beats no_booking and fee_unpaid', () => {
    expect(learnerCheckOutcome({ ...base, onRoute: false, booked: false, feeUnpaid: true })).toBe('not_on_route');
  });
  it('no_booking beats fee_unpaid', () => {
    expect(learnerCheckOutcome({ ...base, booked: false, feeUnpaid: true })).toBe('no_booking');
  });
  it('fee_unpaid when only the fee is the problem', () => {
    expect(learnerCheckOutcome({ ...base, feeUnpaid: true })).toBe('fee_unpaid');
  });
});

describe('staffCheckOutcome', () => {
  it('ok when on route and no outstanding bill', () => {
    expect(staffCheckOutcome({ onRoute: true, isIncharge: false, hasOutstandingBill: false })).toBe('ok');
  });
  it('not_on_route when off-route and not an in-charge', () => {
    expect(staffCheckOutcome({ onRoute: false, isIncharge: false, hasOutstandingBill: false })).toBe('not_on_route');
  });
  it('an in-charge is exempt from not_on_route even when off-route', () => {
    expect(staffCheckOutcome({ onRoute: false, isIncharge: true, hasOutstandingBill: false })).toBe('ok');
  });
  it('fee_unpaid when there is an outstanding bill and not an in-charge', () => {
    expect(staffCheckOutcome({ onRoute: true, isIncharge: false, hasOutstandingBill: true })).toBe('fee_unpaid');
  });
  it('an in-charge is exempt from fee_unpaid even with an outstanding bill', () => {
    expect(staffCheckOutcome({ onRoute: true, isIncharge: true, hasOutstandingBill: true })).toBe('ok');
  });
});
