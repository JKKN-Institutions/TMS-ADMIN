import { describe, it, expect } from 'vitest';
import { foldTermsIntoBill, allocateWaterfall } from './instalments';

const T = (term_no: number, amount: number, due_date: string, term_label: string | null = null) =>
  ({ term_no, term_label, amount, due_date });

describe('foldTermsIntoBill', () => {
  it('sums the terms and dates the bill from the earliest one', () => {
    const f = foldTermsIntoBill([T(1, 2750, '2026-07-31'), T(2, 2750, '2026-08-31')]);
    expect(f).not.toBeNull();
    expect(f!.total).toBe(5500);
    expect(f!.dueDate).toBe('2026-07-31');
    expect(f!.instalments).toHaveLength(2);
  });

  it('orders instalments by due date, then renumbers sequence_no from 1', () => {
    // A structure may list terms out of order; the platform allocates payments
    // by (due_date, sequence_no), so the two must agree or the waterfall pays
    // the wrong instalment first.
    const f = foldTermsIntoBill([T(2, 2500, '2026-08-31', 'Term 2'), T(1, 3000, '2026-07-31', 'Term 1')]);
    expect(f!.instalments.map((i) => i.sequence_no)).toEqual([1, 2]);
    expect(f!.instalments.map((i) => i.due_date)).toEqual(['2026-07-31', '2026-08-31']);
    expect(f!.instalments.map((i) => i.label)).toEqual(['Term 1', 'Term 2']);
  });

  it('makes the instalments sum EXACTLY to the total, absorbing rounding in the last', () => {
    // trg_bbi_validate_sum rejects the whole insert otherwise.
    const f = foldTermsIntoBill([T(1, 1633.33, '2026-07-31'), T(2, 1633.33, '2026-08-31'), T(3, 1633.34, '2026-09-30')]);
    const sum = f!.instalments.reduce((s, i) => s + i.amount, 0);
    expect(sum).toBe(f!.total);
  });

  it('returns a single instalment for a one-term structure', () => {
    const f = foldTermsIntoBill([T(1, 5500, '2026-08-31', 'Term 1')]);
    expect(f!.total).toBe(5500);
    expect(f!.instalments).toEqual([
      { sequence_no: 1, amount: 5500, due_date: '2026-08-31', label: 'Term 1' },
    ]);
  });

  it('returns null for no terms, so a caller cannot write a zero bill', () => {
    expect(foldTermsIntoBill([])).toBeNull();
  });

  it('returns null when the terms total zero or less', () => {
    // billing_bill_instalments has CHECK (amount > 0) and a zero bill is not a debt.
    expect(foldTermsIntoBill([T(1, 0, '2026-07-31')])).toBeNull();
  });
});

describe('allocateWaterfall', () => {
  it('fills instalments oldest-first', () => {
    expect(allocateWaterfall(2750, [{ amount: 2750 }, { amount: 2750 }])).toEqual([2750, 0]);
  });

  it('splits a payment that lands mid-instalment', () => {
    expect(allocateWaterfall(4000, [{ amount: 2750 }, { amount: 2750 }])).toEqual([2750, 1250]);
  });

  it('never allocates more than an instalment is worth', () => {
    expect(allocateWaterfall(99999, [{ amount: 2750 }, { amount: 2750 }])).toEqual([2750, 2750]);
  });

  it('treats a negative or absent paid amount as zero', () => {
    expect(allocateWaterfall(-5, [{ amount: 100 }])).toEqual([0]);
  });
});
