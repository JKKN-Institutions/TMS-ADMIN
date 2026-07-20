// lib/fees/bill-analytics.ts
// Pure, React-free, DB-free aggregation for the Bill Management analytics tab.
// Operates on the same TransportBillRow[] the module already fetches. The active
// filter (learner && not cancelled) mirrors summarizeBills so charts and KPI
// tiles reconcile — staff are staff_deferred (no money), cancelled bills are void.

import type { TransportBillRow } from './bills';

export interface LearnerPaymentBreakdown {
  fullyPaid: number;
  partiallyPaid: number;
  unpaid: number;
  overdue: number; // distinct learners with any overdue row (subset of the above)
  totalLearners: number;
}

export interface TermStat {
  term_no: number;
  billed: number;
  collected: number;
  pending: number;
  paidBills: number;
  pendingBills: number;
  learners: number;
}

const activeLearnerRows = (rows: TransportBillRow[]) =>
  rows.filter((r) => r.person_type === 'learner' && r.status !== 'cancelled');

// Distinct-learner payment status. A learner spans several term rows, so we fold
// their terms together first, then bucket once.
export function learnerPaymentBreakdown(rows: TransportBillRow[]): LearnerPaymentBreakdown {
  const byLearner = new Map<string, { paid: number; pending: number; overdue: boolean }>();
  for (const r of activeLearnerRows(rows)) {
    const cur = byLearner.get(r.person_id) ?? { paid: 0, pending: 0, overdue: false };
    cur.paid += r.paid_amount;
    cur.pending += r.pending_amount;
    if (r.status === 'overdue') cur.overdue = true;
    byLearner.set(r.person_id, cur);
  }

  let fullyPaid = 0;
  let partiallyPaid = 0;
  let unpaid = 0;
  let overdue = 0;
  for (const l of byLearner.values()) {
    if (l.overdue) overdue++;
    if (l.pending <= 0) fullyPaid++;
    else if (l.paid > 0) partiallyPaid++;
    else unpaid++;
  }
  return { fullyPaid, partiallyPaid, unpaid, overdue, totalLearners: byLearner.size };
}

// Per-term money + bill counts + distinct learners, ascending by term.
export function termBreakdown(rows: TransportBillRow[]): TermStat[] {
  const byTerm = new Map<
    number,
    { billed: number; collected: number; pending: number; paidBills: number; pendingBills: number; learners: Set<string> }
  >();
  for (const r of activeLearnerRows(rows)) {
    const t =
      byTerm.get(r.term_no) ??
      { billed: 0, collected: 0, pending: 0, paidBills: 0, pendingBills: 0, learners: new Set<string>() };
    t.billed += r.amount;
    t.collected += r.paid_amount;
    t.pending += r.pending_amount;
    if (r.pending_amount > 0) t.pendingBills++;
    else t.paidBills++;
    t.learners.add(r.person_id);
    byTerm.set(r.term_no, t);
  }
  return [...byTerm.entries()]
    .map(([term_no, t]) => ({
      term_no,
      billed: t.billed,
      collected: t.collected,
      pending: t.pending,
      paidBills: t.paidBills,
      pendingBills: t.pendingBills,
      learners: t.learners.size,
    }))
    .sort((a, b) => a.term_no - b.term_no);
}
