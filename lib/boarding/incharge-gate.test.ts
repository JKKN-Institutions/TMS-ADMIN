import { describe, it, expect } from 'vitest';
import { deriveInChargeGate, type InChargeGateInput } from './incharge-gate';

const base: InChargeGateInput = {
  allowed: false,
  eligible: true,
  assignedRouteCount: 0,
  hasRoute: true,
  hasOutstandingBill: false,
  probationThisMonth: 'none',
  remainingServiceDays: 5,
};

describe('deriveInChargeGate', () => {
  it('opens the portal for an assigned, permitted staffer', () => {
    expect(deriveInChargeGate({ ...base, allowed: true, assignedRouteCount: 1 }))
      .toBe('in_duty');
  });

  it('opens the portal during an active probation', () => {
    // Accepting the pledge reassigns them, so `allowed` is already true. This
    // is the whole reason the promise "mark daily and the bill is cancelled"
    // is keepable -- marking requires the portal.
    expect(deriveInChargeGate({
      ...base, allowed: true, assignedRouteCount: 1,
      hasOutstandingBill: true, probationThisMonth: 'active',
    })).toBe('in_duty');
  });

  it('offers the pledge to a billed, unassigned staffer', () => {
    expect(deriveInChargeGate({ ...base, hasOutstandingBill: true })).toBe('pledge');
  });

  it('demands payment when the probation already failed this month', () => {
    expect(deriveInChargeGate({
      ...base, hasOutstandingBill: true, probationThisMonth: 'failed',
    })).toBe('must_pay');
  });

  it('demands payment when no service days remain in the month', () => {
    // Offering a commitment that cannot be honoured -- there are no days left
    // to mark -- would be a promise the system knows it will break.
    expect(deriveInChargeGate({
      ...base, hasOutstandingBill: true, remainingServiceDays: 0,
    })).toBe('must_pay');
  });

  it('demands payment when the staffer has no allocated route', () => {
    expect(deriveInChargeGate({
      ...base, hasOutstandingBill: true, hasRoute: false,
    })).toBe('must_pay');
  });

  it('demands payment when the staffer is no longer eligible', () => {
    expect(deriveInChargeGate({
      ...base, hasOutstandingBill: true, eligible: false,
    })).toBe('must_pay');
  });

  it('offers the willingness toggle to an eligible, unbilled, unassigned staffer', () => {
    expect(deriveInChargeGate(base)).toBe('choose');
  });

  it('denies an unbilled staffer whose route is not allocated', () => {
    expect(deriveInChargeGate({ ...base, hasRoute: false })).toBe('denied');
  });

  it('denies a non-eligible user', () => {
    expect(deriveInChargeGate({ ...base, eligible: false })).toBe('denied');
  });

  it('denies an assigned staffer whose role grant failed', () => {
    // Not 'choose': they already have an assignment, so the toggle would
    // invite a confirm the server rejects with 409.
    expect(deriveInChargeGate({ ...base, assignedRouteCount: 1 })).toBe('denied');
  });

  it('puts the bill ahead of the toggle', () => {
    // An eligible, unassigned staffer who owes money must see the pledge, not
    // the willingness toggle -- the toggle would re-grant the exemption.
    expect(deriveInChargeGate({ ...base, hasOutstandingBill: true }))
      .not.toBe('choose');
  });
});
