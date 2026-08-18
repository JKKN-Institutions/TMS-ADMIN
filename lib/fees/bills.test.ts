import { describe, it, expect } from 'vitest';
import { summarizeBills, stopWiseBillable, scoreStaffLedgerRow, type TransportBillRow } from './bills';

// Minimal row factory — only the fields summarizeBills reads matter; the rest are
// filled with harmless defaults so tests read as just the money/status shape.
function row(over: Partial<TransportBillRow> = {}): TransportBillRow {
  return {
    id: 'r',
    person_id: 'p',
    person_type: 'learner',
    person_name: '—',
    code: null,
    institution_id: null,
    institution_name: null,
    department_id: null,
    department_name: null,
    structure_id: 's',
    structure_name: null,
    transport_year_id: 'y',
    year_name: null,
    academic_year_id: null,
    academic_year_name: null,
    term_no: 1,
    amount: 0,
    due_date: '2026-12-31',
    paid_amount: 0,
    pending_amount: 0,
    status: 'unpaid',
    payment_date: null,
    billing_student_bill_id: null,
    ...over,
  };
}

describe('summarizeBills', () => {
  it('excludes cancelled (vacated) bills from Billed — the MyJKKN discrepancy', () => {
    // One live unpaid bill + one cancelled bill. Billed must be 2500, not 8000:
    // the cancelled ₹5500 is voided, exactly the ₹5,500 gap seen against MyJKKN.
    const s = summarizeBills([
      row({ person_id: 'a', amount: 2500, pending_amount: 2500, status: 'unpaid' }),
      row({ person_id: 'b', amount: 5500, pending_amount: 0, paid_amount: 0, status: 'cancelled' }),
    ]);
    expect(s.totalBilledAmount).toBe(2500);
  });

  it('keeps the invariant Billed === Collected + Pending even with cancellations', () => {
    const s = summarizeBills([
      row({ person_id: 'a', amount: 3000, paid_amount: 3000, pending_amount: 0, status: 'paid' }),
      row({ person_id: 'b', amount: 2500, paid_amount: 0, pending_amount: 2500, status: 'unpaid' }),
      row({ person_id: 'c', amount: 5500, paid_amount: 0, pending_amount: 0, status: 'cancelled' }),
    ]);
    expect(s.totalBilledAmount).toBe(s.collectedAmount + s.pendingAmount);
    expect(s.totalBilledAmount).toBe(5500);
    expect(s.collectedAmount).toBe(3000);
    expect(s.pendingAmount).toBe(2500);
  });

  // CHANGED 2026-08-17: staff bills used to be excluded from the money KPIs because
  // they were coverage records with no real money behind them. They are real now —
  // the in-charge enforcement path raises payable staff bills — and MyJKKN's
  // Transport Fees screen counts them, so excluding them here made the two apps
  // disagree by exactly the staff total.
  it('counts staff bills toward Billed, so TMS reconciles with MyJKKN', () => {
    const s = summarizeBills([
      row({ person_id: 'a', amount: 2500, pending_amount: 2500, status: 'unpaid' }),
      row({ person_id: 'x', person_type: 'staff', amount: 9999, pending_amount: 9999, status: 'staff_deferred' }),
    ]);
    expect(s.totalBilledAmount).toBe(12499);
    expect(s.staffDeferred).toBe(1);
  });

  it('keeps Billed === Collected + Pending once staff are included', () => {
    const s = summarizeBills([
      row({ person_id: 'a', amount: 2500, paid_amount: 2500, pending_amount: 0, status: 'paid' }),
      row({ person_id: 'x', person_type: 'staff', amount: 9999, pending_amount: 9999, status: 'staff_deferred' }),
    ]);
    expect(s.totalBilledAmount).toBe(s.collectedAmount + s.pendingAmount);
    expect(s.pendingAmount).toBe(9999);
    expect(s.collectedAmount).toBe(2500);
  });

  it('excludes a cancelled staff bill from Billed, exactly as it does a learner one', () => {
    const s = summarizeBills([
      row({ person_id: 'x', person_type: 'staff', amount: 9999, pending_amount: 0, status: 'cancelled' }),
    ]);
    expect(s.totalBilledAmount).toBe(0);
  });

  it('counts a paid staff bill as collected, not as outstanding', () => {
    const s = summarizeBills([
      row({ person_id: 'x', person_type: 'staff', amount: 8800, paid_amount: 8800, pending_amount: 0, status: 'paid' }),
    ]);
    expect(s.collectedAmount).toBe(8800);
    expect(s.pendingAmount).toBe(0);
    expect(s.totalBilledAmount).toBe(8800);
  });

  it('sums overdue pending from rows flagged overdue', () => {
    const s = summarizeBills([
      row({ person_id: 'a', amount: 3000, pending_amount: 3000, status: 'overdue' }),
      row({ person_id: 'b', amount: 2500, pending_amount: 2500, status: 'unpaid' }),
    ]);
    expect(s.overdueAmount).toBe(3000);
    expect(s.overdueCount).toBe(1);
  });
});

describe('scoreStaffLedgerRow', () => {
  const TODAY = '2026-08-17';

  // A staff bill has no billing_student_bills row to read money from, so its
  // paid/pending come from the tms_fee_bill ledger itself. Before this existed,
  // staff rows were scored pending=0 — which would have made them add to Billed
  // without adding to Pending, breaking Billed === Collected + Pending.
  it('treats an unpaid staff bill as fully outstanding, not as nothing owed', () => {
    expect(scoreStaffLedgerRow({ status: 'staff_deferred', amount: 8800, paidAmount: null, dueDate: '2026-08-31' }, TODAY))
      .toEqual({ status: 'staff_deferred', paid: 0, pending: 8800 });
  });

  it('scores a generated staff bill the same as a deferred one — both are owed', () => {
    expect(scoreStaffLedgerRow({ status: 'generated', amount: 8800, paidAmount: null, dueDate: '2026-08-31' }, TODAY).pending)
      .toBe(8800);
  });

  it('moves a staff bill to overdue once its due date has passed', () => {
    const r = scoreStaffLedgerRow({ status: 'staff_deferred', amount: 8800, paidAmount: null, dueDate: '2026-08-01' }, TODAY);
    expect(r.status).toBe('overdue');
    expect(r.pending).toBe(8800);
  });

  it('does not mark a bill overdue on its due date itself', () => {
    expect(scoreStaffLedgerRow({ status: 'staff_deferred', amount: 8800, paidAmount: null, dueDate: TODAY }, TODAY).status)
      .toBe('staff_deferred');
  });

  it('scores a paid staff bill as collected and owing nothing', () => {
    expect(scoreStaffLedgerRow({ status: 'paid', amount: 8800, paidAmount: 8800, dueDate: '2026-08-01' }, TODAY))
      .toEqual({ status: 'paid', paid: 8800, pending: 0 });
  });

  // mark-paid defaults paid_amount to the bill amount, but a row written before
  // that column existed can be paid with a null amount; falling back to the bill
  // amount keeps Collected honest rather than silently dropping the money.
  it('falls back to the bill amount when a paid row has no recorded paid_amount', () => {
    expect(scoreStaffLedgerRow({ status: 'paid', amount: 8800, paidAmount: null, dueDate: '2026-08-01' }, TODAY).paid)
      .toBe(8800);
  });

  // Cancelled MUST be tested before staff-ness. The old code branched on
  // person_type first, so a cancelled staff bill would have been scored as owed.
  it('scores a cancelled staff bill as owing nothing and never overdue', () => {
    expect(scoreStaffLedgerRow({ status: 'cancelled', amount: 8800, paidAmount: null, dueDate: '2026-08-01' }, TODAY))
      .toEqual({ status: 'cancelled', paid: 0, pending: 0 });
  });
});

describe('stopWiseBillable', () => {
  // Used by loadUnbilledPeople to narrow a stop_wise structure's "expected to
  // be billed" population — mirrors the tiered narrowing (people whose derived
  // year matches no band aren't "expected" either). Without this, people the
  // generator will always skip (no_stop / no_stop_rate) sat in Bill
  // Management's Unbilled list forever with no possible remedy (review I4).
  const priced = new Set(['stop-a', 'stop-b']);

  it('is billable when the person has a stop and that stop is priced', () => {
    expect(stopWiseBillable('stop-a', priced)).toBe(true);
  });

  it('is not billable with no boarding stop assigned', () => {
    expect(stopWiseBillable(null, priced)).toBe(false);
    expect(stopWiseBillable(undefined, priced)).toBe(false);
  });

  it('is not billable when the assigned stop has no configured rate', () => {
    expect(stopWiseBillable('stop-unpriced', priced)).toBe(false);
  });
});
