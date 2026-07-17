import { describe, it, expect } from 'vitest';
import { isTermCancellable, isVacateEligible, sumAmountToCancel } from './types';

describe('isTermCancellable', () => {
  it('cancels an unpaid term with a positive balance', () => {
    expect(isTermCancellable({ moneyStatus: 'unpaid', balance: 5000, amount: 5000 })).toBe(true);
  });
  it('cancels an overdue/partial term (balance from balance_amount)', () => {
    expect(isTermCancellable({ moneyStatus: 'partially_paid', balance: 2000, amount: 5000 })).toBe(true);
  });
  it('skips a fully-paid term (status paid)', () => {
    expect(isTermCancellable({ moneyStatus: 'paid', balance: 0, amount: 5000 })).toBe(false);
  });
  it('skips a term whose balance is already 0 even if not marked paid', () => {
    expect(isTermCancellable({ moneyStatus: 'unpaid', balance: 0, amount: 5000 })).toBe(false);
  });
  it('falls back to amount when balance is null', () => {
    expect(isTermCancellable({ moneyStatus: 'unpaid', balance: null, amount: 5000 })).toBe(true);
  });
  it('is case-insensitive on the paid token', () => {
    expect(isTermCancellable({ moneyStatus: 'PAID', balance: 100, amount: 5000 })).toBe(false);
  });
});

describe('isVacateEligible', () => {
  it('eligible: bus-required, active, has a current-year bill', () => {
    expect(isVacateEligible({ busRequired: true, lifecycleStatus: 'active', hasCurrentYearBill: true })).toBe(true);
  });
  it('not eligible without a current-year bill', () => {
    expect(isVacateEligible({ busRequired: true, lifecycleStatus: 'active', hasCurrentYearBill: false })).toBe(false);
  });
  it('not eligible when not bus-required', () => {
    expect(isVacateEligible({ busRequired: false, lifecycleStatus: 'active', hasCurrentYearBill: true })).toBe(false);
  });
  it('not eligible for a non-active lifecycle', () => {
    expect(isVacateEligible({ busRequired: true, lifecycleStatus: 'reserved', hasCurrentYearBill: true })).toBe(false);
  });
});

describe('sumAmountToCancel', () => {
  it('sums the amounts of the given cancellable terms', () => {
    expect(sumAmountToCancel([
      { ledgerId: 'a', moneyId: 'm1', termNo: 1, amount: 5000, moneyStatus: 'unpaid', balance: 5000 },
      { ledgerId: 'b', moneyId: 'm2', termNo: 2, amount: 4000, moneyStatus: 'overdue', balance: 4000 },
    ])).toBe(9000);
  });
  it('is 0 for an empty list', () => {
    expect(sumAmountToCancel([])).toBe(0);
  });
});
