import { describe, it, expect } from 'vitest';
import { maySelfAssign } from './self-assign-guard';

describe('maySelfAssign', () => {
  it('allows a staffer with no outstanding bill', () => {
    expect(maySelfAssign({ hasOutstandingBill: false }))
      .toEqual({ allowed: true });
  });

  it('blocks a staffer carrying an outstanding bill', () => {
    // This is the leak: 26 staff were removed and billed on 2026-08-14, then
    // re-granted themselves the fee exemption through the willingness toggle
    // on 08-17 and 08-18 because this check did not exist.
    expect(maySelfAssign({ hasOutstandingBill: true }))
      .toEqual({ allowed: false, reason: 'outstanding_bill' });
  });

  it('has no exception left for a billed staffer', () => {
    // The attendance pledge used to buy a billed staffer back in. Enforcement
    // was removed 2026-08-27, so settling the bill is the only way through and
    // an outstanding bill is decisive on its own.
    expect(maySelfAssign({ hasOutstandingBill: true }).allowed).toBe(false);
  });
});
