import { describe, it, expect } from 'vitest';
import { learnerPaymentBreakdown, termBreakdown, groupByInstitution, groupByDepartment } from './bill-analytics';
import type { TransportBillRow } from './bills';

// Minimal row factory — only the fields the aggregators read matter.
function row(over: Partial<TransportBillRow> = {}): TransportBillRow {
  return {
    id: 'r', person_id: 'p', person_type: 'learner', person_name: '—', code: null,
    institution_id: null, institution_name: null, department_id: null, department_name: null,
    structure_id: 's', structure_name: null,
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

  it('counts distinct fully-paid / partial / unpaid learners per term', () => {
    const stats = termBreakdown([
      row({ person_id: 'a', term_no: 1, paid_amount: 1000, pending_amount: 0, status: 'paid' }),
      row({ person_id: 'b', term_no: 1, paid_amount: 400, pending_amount: 600, status: 'partially_paid' }),
      row({ person_id: 'c', term_no: 1, paid_amount: 0, pending_amount: 1000, status: 'unpaid' }),
    ]);
    expect(stats[0]).toMatchObject({
      fullyPaidLearners: 1, partialLearners: 1, unpaidLearners: 1, learners: 3,
    });
  });

  it('returns [] for empty input', () => {
    expect(termBreakdown([])).toEqual([]);
  });
});

describe('groupByInstitution', () => {
  it('groups distinct learners by institution, folds their terms, buckets once, sums money, sorted by learners desc', () => {
    const stats = groupByInstitution([
      // inst A / learner a: fully paid across two terms → ONE fully-paid learner
      row({ person_id: 'a', institution_id: 'A', institution_name: 'Alpha', term_no: 1, paid_amount: 500, pending_amount: 0, status: 'paid' }),
      row({ person_id: 'a', institution_id: 'A', institution_name: 'Alpha', term_no: 2, paid_amount: 500, pending_amount: 0, status: 'paid' }),
      // inst A / learner b: partial
      row({ person_id: 'b', institution_id: 'A', institution_name: 'Alpha', term_no: 1, paid_amount: 300, pending_amount: 700, status: 'partially_paid' }),
      // inst B / learner c: unpaid
      row({ person_id: 'c', institution_id: 'B', institution_name: 'Beta', term_no: 1, paid_amount: 0, pending_amount: 1000, status: 'unpaid' }),
    ]);
    expect(stats.map((s) => s.label)).toEqual(['Alpha', 'Beta']); // A has 2 learners, B has 1
    expect(stats[0]).toMatchObject({
      key: 'A', label: 'Alpha', learners: 2, fullyPaid: 1, partiallyPaid: 1, unpaid: 0, collected: 1300, pending: 700,
    });
    expect(stats[1]).toMatchObject({
      key: 'B', label: 'Beta', learners: 1, fullyPaid: 0, partiallyPaid: 0, unpaid: 1, collected: 0, pending: 1000,
    });
  });

  it('buckets rows with no institution under Unassigned', () => {
    const stats = groupByInstitution([
      row({ person_id: 'a', institution_id: null, institution_name: null, paid_amount: 0, pending_amount: 500, status: 'unpaid' }),
    ]);
    expect(stats).toHaveLength(1);
    expect(stats[0]).toMatchObject({ label: 'Unassigned', learners: 1, unpaid: 1, pending: 500 });
  });

  it('excludes staff and cancelled rows', () => {
    const stats = groupByInstitution([
      row({ person_id: 'a', institution_id: 'A', institution_name: 'Alpha', paid_amount: 100, pending_amount: 0, status: 'paid' }),
      row({ person_id: 'b', institution_id: 'A', institution_name: 'Alpha', status: 'cancelled', amount: 5500 }),
      row({ person_id: 'x', institution_id: 'A', institution_name: 'Alpha', person_type: 'staff', status: 'staff_deferred', amount: 9999 }),
    ]);
    expect(stats).toHaveLength(1);
    expect(stats[0]).toMatchObject({ learners: 1, fullyPaid: 1 });
  });

  it('returns [] for empty input', () => {
    expect(groupByInstitution([])).toEqual([]);
  });
});

describe('groupByDepartment', () => {
  it('groups by the department fields, folds terms, and buckets an Unassigned group', () => {
    const stats = groupByDepartment([
      row({ person_id: 'a', department_id: 'D1', department_name: 'Mech', paid_amount: 500, pending_amount: 500, status: 'partially_paid' }),
      row({ person_id: 'b', department_id: 'D1', department_name: 'Mech', paid_amount: 1000, pending_amount: 0, status: 'paid' }),
      row({ person_id: 'c', department_id: null, department_name: null, paid_amount: 0, pending_amount: 200, status: 'unpaid' }),
    ]);
    const mech = stats.find((s) => s.key === 'D1');
    expect(mech).toMatchObject({ label: 'Mech', learners: 2, fullyPaid: 1, partiallyPaid: 1, unpaid: 0, collected: 1500, pending: 500 });
    const un = stats.find((s) => s.label === 'Unassigned');
    expect(un).toMatchObject({ learners: 1, unpaid: 1, pending: 200 });
  });
});
