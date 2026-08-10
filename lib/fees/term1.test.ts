import { describe, it, expect } from 'vitest';
import { isTerm1Paid } from './term1';

describe('isTerm1Paid', () => {
  it('is true only for a generated ledger row whose money row is paid', () => {
    expect(isTerm1Paid('generated', 'paid')).toBe(true);
  });

  it('is false when the money row is not fully paid', () => {
    expect(isTerm1Paid('generated', 'unpaid')).toBe(false);
    expect(isTerm1Paid('generated', 'partially_paid')).toBe(false);
    expect(isTerm1Paid('generated', 'overdue')).toBe(false);
  });

  it('is false for a cancelled (vacated) ledger row even if the money row says paid', () => {
    expect(isTerm1Paid('cancelled', 'paid')).toBe(false);
  });

  it('is false for a staff_deferred ledger row', () => {
    expect(isTerm1Paid('staff_deferred', 'paid')).toBe(false);
  });

  it('is false when either side is missing', () => {
    expect(isTerm1Paid(null, 'paid')).toBe(false);
    expect(isTerm1Paid('generated', null)).toBe(false);
    expect(isTerm1Paid(undefined, undefined)).toBe(false);
  });
});
