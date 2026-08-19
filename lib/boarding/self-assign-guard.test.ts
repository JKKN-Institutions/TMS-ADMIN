import { describe, it, expect } from 'vitest';
import { maySelfAssign } from './self-assign-guard';

describe('maySelfAssign', () => {
  it('allows a staffer with no outstanding bill', () => {
    expect(maySelfAssign({ hasOutstandingBill: false, hasActiveProbation: false }))
      .toEqual({ allowed: true });
  });

  it('blocks a staffer carrying an outstanding bill', () => {
    // This is the leak: 26 staff were removed and billed on 2026-08-14, then
    // re-granted themselves the fee exemption through the willingness toggle
    // on 08-17 and 08-18 because this check did not exist.
    expect(maySelfAssign({ hasOutstandingBill: true, hasActiveProbation: false }))
      .toEqual({ allowed: false, reason: 'outstanding_bill' });
  });

  it('allows a billed staffer who has an ACTIVE probation', () => {
    // The pledge route creates the probation and then assigns. Without this
    // branch, accepting the deal would be rejected by the very guard that
    // makes the deal necessary.
    expect(maySelfAssign({ hasOutstandingBill: true, hasActiveProbation: true }))
      .toEqual({ allowed: true });
  });

  it('allows an unbilled staffer with a stale active probation', () => {
    expect(maySelfAssign({ hasOutstandingBill: false, hasActiveProbation: true }))
      .toEqual({ allowed: true });
  });
});
