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

describe('isTerm1Paid — instalment bills', () => {
  it('clears term 1 when instalment 1 is settled, even though the bill is only partially paid', () => {
    // The whole point: a learner paying by instalments must not be locked out.
    expect(
      isTerm1Paid('generated', 'partially_paid', {
        paid: 2750,
        instalments: [{ amount: 2750 }, { amount: 2750 }],
      })
    ).toBe(true);
  });

  it('does NOT clear term 1 when instalment 1 is only part-paid', () => {
    expect(
      isTerm1Paid('generated', 'partially_paid', {
        paid: 1000,
        instalments: [{ amount: 2750 }, { amount: 2750 }],
      })
    ).toBe(false);
  });

  it('clears term 1 when the whole instalment bill is paid', () => {
    expect(
      isTerm1Paid('generated', 'paid', {
        paid: 5500,
        instalments: [{ amount: 2750 }, { amount: 2750 }],
      })
    ).toBe(true);
  });

  it('falls back to the whole-bill rule when the bill has no instalments', () => {
    // Every pre-change bill, and the 15 part-paid learners we do not convert.
    expect(isTerm1Paid('generated', 'paid', { paid: 3000, instalments: [] })).toBe(true);
    expect(isTerm1Paid('generated', 'partially_paid', { paid: 1, instalments: [] })).toBe(false);
    expect(isTerm1Paid('generated', 'paid')).toBe(true);
  });

  it('stays fail-closed for a cancelled ledger row regardless of instalments', () => {
    expect(
      isTerm1Paid('cancelled', 'paid', { paid: 5500, instalments: [{ amount: 2750 }, { amount: 2750 }] })
    ).toBe(false);
  });
});
