import { describe, it, expect } from 'vitest';
import { collapseReceipts, normalizeMode, PAYMENT_MODE_LABELS, type ReceiptFacet } from './receipts';

const rc = (over: Partial<ReceiptFacet> = {}): ReceiptFacet => ({
  payment_mode: 'cash',
  receipt_number: 'R1',
  payment_reference_number: null,
  payment_paid_date: '2026-09-01',
  amount_paid: 2500,
  ...over,
});

describe('normalizeMode', () => {
  it('accepts the six modes the accountants actually record', () => {
    for (const m of ['cash', 'online', 'dd', 'cheque', 'bank_transfer', 'combined']) {
      expect(normalizeMode(m)).toBe(m);
    }
  });

  it('is case- and whitespace-insensitive', () => {
    // payment_mode is a free-text varchar with NO check constraint, so casing
    // drift is a real possibility rather than a hypothetical one.
    expect(normalizeMode(' Cash ')).toBe('cash');
    expect(normalizeMode('ONLINE')).toBe('online');
  });

  it('buckets an unrecognised mode as "other" rather than inventing a label', () => {
    expect(normalizeMode('upi_qr')).toBe('other');
    expect(normalizeMode('')).toBe(null);
    expect(normalizeMode(null)).toBe(null);
  });

  it('has a label for every mode it can return', () => {
    for (const m of ['cash', 'online', 'dd', 'cheque', 'bank_transfer', 'combined', 'other', 'mixed'] as const) {
      expect(PAYMENT_MODE_LABELS[m]).toBeTruthy();
    }
  });
});

describe('collapseReceipts', () => {
  it('reports no mode when the bill has no receipt', () => {
    // Measured on this DB: exactly 1 of 2,385 paid/partial transport bills has no
    // receipt row. It must resolve to null, not to a wrong mode.
    const info = collapseReceipts([]);
    expect(info.mode).toBe(null);
    expect(info.receiptNumbers).toEqual([]);
    expect(info.lastPaidDate).toBe(null);
  });

  it('takes the single mode when one receipt settled the bill', () => {
    const info = collapseReceipts([rc({ payment_mode: 'online', receipt_number: 'R7' })]);
    expect(info.mode).toBe('online');
    expect(info.modes).toEqual(['online']);
    expect(info.receiptNumbers).toEqual(['R7']);
  });

  it('stays on one mode when several receipts share it (instalments)', () => {
    const info = collapseReceipts([
      rc({ receipt_number: 'R1', payment_paid_date: '2026-07-01' }),
      rc({ receipt_number: 'R2', payment_paid_date: '2026-08-01' }),
    ]);
    expect(info.mode).toBe('cash');
    expect(info.receiptNumbers).toEqual(['R1', 'R2']);
  });

  it('collapses genuinely different modes to "mixed"', () => {
    // Part cash, part online across two receipts. 'mixed' is OUR label for that;
    // it is distinct from the DB's own 'combined', which is one receipt the
    // accountant recorded as cash+online with no stored breakdown.
    const info = collapseReceipts([
      rc({ payment_mode: 'cash', receipt_number: 'R1' }),
      rc({ payment_mode: 'online', receipt_number: 'R2' }),
    ]);
    expect(info.mode).toBe('mixed');
    expect(info.modes).toEqual(['cash', 'online']);
  });

  it('keeps "combined" as itself — it is one receipt, not a mix of them', () => {
    const info = collapseReceipts([rc({ payment_mode: 'combined' })]);
    expect(info.mode).toBe('combined');
  });

  it('takes the reference and date from the LATEST payment', () => {
    const info = collapseReceipts([
      rc({ receipt_number: 'R1', payment_paid_date: '2026-07-01', payment_reference_number: 'old' }),
      rc({ receipt_number: 'R2', payment_paid_date: '2026-08-15', payment_reference_number: 'pay_abc' }),
    ]);
    expect(info.lastPaidDate).toBe('2026-08-15');
    expect(info.reference).toBe('pay_abc');
  });

  it('survives a receipt with no paid date', () => {
    const info = collapseReceipts([
      rc({ receipt_number: 'R1', payment_paid_date: null, payment_reference_number: 'ref1' }),
    ]);
    expect(info.mode).toBe('cash');
    expect(info.lastPaidDate).toBe(null);
    expect(info.reference).toBe('ref1');
  });

  it('sums what the receipts allocated to this bill', () => {
    const info = collapseReceipts([rc({ amount_paid: 1000 }), rc({ amount_paid: 1500 })]);
    expect(info.receiptedAmount).toBe(2500);
  });

  it('ignores a blank mode instead of counting it as a second mode', () => {
    const info = collapseReceipts([rc({ payment_mode: 'cash' }), rc({ payment_mode: null })]);
    expect(info.mode).toBe('cash');
  });
});
