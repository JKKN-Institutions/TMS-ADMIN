import { describe, it, expect } from 'vitest';
import { summarizeBills, stopWiseBillable, type TransportBillRow } from './bills';

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

  it('does not count staff (deferred) rows toward learner billed, but tallies them', () => {
    const s = summarizeBills([
      row({ person_id: 'a', amount: 2500, pending_amount: 2500, status: 'unpaid' }),
      row({ person_id: 'x', person_type: 'staff', amount: 9999, status: 'staff_deferred' }),
    ]);
    expect(s.totalBilledAmount).toBe(2500);
    expect(s.staffDeferred).toBe(1);
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
