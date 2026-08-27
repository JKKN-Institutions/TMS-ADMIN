import { describe, it, expect } from 'vitest';
import { deriveInChargeGate, type InChargeGateInput } from './incharge-gate';

const base: InChargeGateInput = {
  allowed: false,
  eligible: true,
  assignedRouteCount: 0,
  hasRoute: true,
  hasOutstandingBill: false,
};

describe('deriveInChargeGate', () => {
  it('opens the portal for an assigned, permitted staffer', () => {
    expect(deriveInChargeGate({ ...base, allowed: true, assignedRouteCount: 1 }))
      .toBe('in_duty');
  });

  it('opens the portal for an assigned staffer who owes fees', () => {
    // Attendance enforcement is gone: holding the assignment is the whole
    // condition. An outstanding bill no longer narrows what an in-charge who
    // is already on duty may see.
    expect(deriveInChargeGate({
      ...base, allowed: true, assignedRouteCount: 1, hasOutstandingBill: true,
    })).toBe('in_duty');
  });

  it('demands payment from a billed, unassigned staffer', () => {
    expect(deriveInChargeGate({ ...base, hasOutstandingBill: true })).toBe('must_pay');
  });

  it('demands payment regardless of route or eligibility once billed', () => {
    expect(deriveInChargeGate({
      ...base, hasOutstandingBill: true, hasRoute: false,
    })).toBe('must_pay');
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
    // An eligible, unassigned staffer who owes money must NOT see the
    // willingness toggle -- it would re-grant the fee exemption.
    expect(deriveInChargeGate({ ...base, hasOutstandingBill: true }))
      .not.toBe('choose');
  });
});
