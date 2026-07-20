import { describe, it, expect } from 'vitest';
import { learnerPaymentBreakdown, termBreakdown } from './bill-analytics';
import type { TransportBillRow } from './bills';

// Minimal row factory — only the fields the aggregators read matter.
function row(over: Partial<TransportBillRow> = {}): TransportBillRow {
  return {
    id: 'r', person_id: 'p', person_type: 'learner', person_name: '—', code: null,
    institution_id: null, institution_name: null, structure_id: 's', structure_name: null,
    transport_year_id: 'y', year_name: null, academic_year_id: null, academic_year_name: null,
    term_no: 1, amount: 0, due_date: '2026-12-31', paid_amount: 0, pending_amount: 0,
    status: 'unpaid', payment_date: null, billing_student_bill_id: null, ...over,
  };
}

describe('learnerPaymentBreakdown', () => {
  it('counts distinct learners, not bills, across their terms', () => {
    // One learner, two fully-paid term rows → 1 fully-paid learner, not 2.
    const b = learnerPaymentBreakdown([
      row({ person_id: 'a', term_no: 1, amount: 1000, paid_amount: 1000, pending_amount: 0, status: 'paid' }),
      row({ person_id: 'a', term_no: 2, amount: 1000, paid_amount: 1000, pending_amount: 0, status: 'paid' }),
    ]);
    expect(b.fullyPaid).toBe(1);
    expect(b.totalLearners).toBe(1);
  });

  it('classifies a learner with one paid + one pending term as partially paid', () => {
    const b = learnerPaymentBreakdown([
      row({ person_id: 'a', term_no: 1, paid_amount: 1000, pending_amount: 0, status: 'paid' }),
      row({ person_id: 'a', term_no: 2, paid_amount: 0, pending_amount: 1000, status: 'unpaid' }),
    ]);
    expect(b).toMatchObject({ fullyPaid: 0, partiallyPaid: 1, unpaid: 0 });
  });

  it('classifies a learner who has paid nothing as unpaid', () => {
    const b = learnerPaymentBreakdown([
      row({ person_id: 'a', paid_amount: 0, pending_amount: 2000, status: 'unpaid' }),
    ]);
    expect(b).toMatchObject({ fullyPaid: 0, partiallyPaid: 0, unpaid: 1 });
  });

  it('flags overdue as a subset — still counted in its money bucket', () => {
    const b = learnerPaymentBreakdown([
      row({ person_id: 'a', paid_amount: 0, pending_amount: 2000, status: 'overdue' }),
    ]);
    expect(b.overdue).toBe(1);
    expect(b.unpaid).toBe(1); // overdue learner still sits in the unpaid bar
  });

  it('excludes cancelled and staff rows', () => {
    const b = learnerPaymentBreakdown([
      row({ person_id: 'a', paid_amount: 1000, pending_amount: 0, status: 'paid' }),
      row({ person_id: 'b', status: 'cancelled', amount: 5500 }),
      row({ person_id: 'x', person_type: 'staff', status: 'staff_deferred', amount: 9999 }),
    ]);
    expect(b.totalLearners).toBe(1);
    expect(b.fullyPaid).toBe(1);
  });

  it('returns all-zero for empty input', () => {
    expect(learnerPaymentBreakdown([])).toEqual({
      fullyPaid: 0, partiallyPaid: 0, unpaid: 0, overdue: 0, totalLearners: 0,
    });
  });
});

describe('termBreakdown', () => {
  it('groups by term, sums money, counts paid/pending bills and distinct learners, sorted', () => {
    const stats = termBreakdown([
      row({ person_id: 'a', term_no: 2, amount: 1000, paid_amount: 1000, pending_amount: 0, status: 'paid' }),
      row({ person_id: 'a', term_no: 1, amount: 1000, paid_amount: 0, pending_amount: 1000, status: 'unpaid' }),
      row({ person_id: 'b', term_no: 1, amount: 1000, paid_amount: 1000, pending_amount: 0, status: 'paid' }),
    ]);
    expect(stats.map((s) => s.term_no)).toEqual([1, 2]); // ascending
    const t1 = stats[0];
    expect(t1).toMatchObject({
      term_no: 1, billed: 2000, collected: 1000, pending: 1000,
      paidBills: 1, pendingBills: 1, learners: 2,
    });
    const t2 = stats[1];
    expect(t2).toMatchObject({ term_no: 2, billed: 1000, collected: 1000, pending: 0, paidBills: 1, pendingBills: 0, learners: 1 });
  });

  it('excludes cancelled and staff rows', () => {
    const stats = termBreakdown([
      row({ person_id: 'a', term_no: 1, amount: 1000, paid_amount: 0, pending_amount: 1000, status: 'unpaid' }),
      row({ person_id: 'b', term_no: 1, amount: 5500, status: 'cancelled' }),
      row({ person_id: 'x', term_no: 1, person_type: 'staff', status: 'staff_deferred', amount: 9999 }),
    ]);
    expect(stats).toHaveLength(1);
    expect(stats[0].billed).toBe(1000);
    expect(stats[0].learners).toBe(1);
  });

  it('returns [] for empty input', () => {
    expect(termBreakdown([])).toEqual([]);
  });
});
