// lib/fees/bill-analytics.ts
// Pure, React-free, DB-free aggregation for the Bill Management analytics tab.
// Operates on the same TransportBillRow[] the module already fetches. The active
// filter (learner && not cancelled) mirrors summarizeBills so charts and KPI
// tiles reconcile — staff are staff_deferred (no money), cancelled bills are void.

import { isActiveLearnerBill, type TransportBillRow } from './bills';

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
  fullyPaidLearners: number;
  partialLearners: number;
  unpaidLearners: number;
}

// One institution/department report row: distinct learners split into the three
// exclusive payment buckets, plus the money they account for.
export interface GroupStat {
  key: string; // institution_id / department_id, or the Unassigned sentinel
  label: string;
  learners: number;
  fullyPaid: number;
  partiallyPaid: number;
  unpaid: number;
  collected: number;
  pending: number;
}

const UNASSIGNED_KEY = '∅'; // ∅ — the "no institution / no department" group

const activeLearnerRows = (rows: TransportBillRow[]) => rows.filter(isActiveLearnerBill);

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

// Bucket a folded {paid, pending} into the three exclusive states. Shared by the
// per-learner, per-term, and per-group aggregations so the rule stays identical.
function bucketOf(paid: number, pending: number): 'fully' | 'partial' | 'unpaid' {
  if (pending <= 0) return 'fully';
  if (paid > 0) return 'partial';
  return 'unpaid';
}

// Per-term money + bill counts + distinct learners (total AND split into
// fully-paid / partial / unpaid), ascending by term. Learner buckets fold a
// learner's rows within the term first, so the split counts distinct learners.
export function termBreakdown(rows: TransportBillRow[]): TermStat[] {
  const byTerm = new Map<
    number,
    {
      billed: number; collected: number; pending: number; paidBills: number; pendingBills: number;
      byLearner: Map<string, { paid: number; pending: number }>;
    }
  >();
  for (const r of activeLearnerRows(rows)) {
    const t =
      byTerm.get(r.term_no) ??
      { billed: 0, collected: 0, pending: 0, paidBills: 0, pendingBills: 0, byLearner: new Map<string, { paid: number; pending: number }>() };
    t.billed += r.amount;
    t.collected += r.paid_amount;
    t.pending += r.pending_amount;
    if (r.pending_amount > 0) t.pendingBills++;
    else t.paidBills++;
    const l = t.byLearner.get(r.person_id) ?? { paid: 0, pending: 0 };
    l.paid += r.paid_amount;
    l.pending += r.pending_amount;
    t.byLearner.set(r.person_id, l);
    byTerm.set(r.term_no, t);
  }
  return [...byTerm.entries()]
    .map(([term_no, t]) => {
      let fullyPaidLearners = 0, partialLearners = 0, unpaidLearners = 0;
      for (const l of t.byLearner.values()) {
        const b = bucketOf(l.paid, l.pending);
        if (b === 'fully') fullyPaidLearners++;
        else if (b === 'partial') partialLearners++;
        else unpaidLearners++;
      }
      return {
        term_no,
        billed: t.billed,
        collected: t.collected,
        pending: t.pending,
        paidBills: t.paidBills,
        pendingBills: t.pendingBills,
        learners: t.byLearner.size,
        fullyPaidLearners,
        partialLearners,
        unpaidLearners,
      };
    })
    .sort((a, b) => a.term_no - b.term_no);
}

// Distinct-learner payment report grouped by an arbitrary dimension (institution
// or department). A learner belongs to exactly one institution and one
// department, so folding per (group, learner) can't double-count. Rows whose key
// is null fall into an "Unassigned" group. Sorted by learner count desc.
function groupLearnerPayments(
  rows: TransportBillRow[],
  pickKey: (r: TransportBillRow) => string | null,
  pickLabel: (r: TransportBillRow) => string | null
): GroupStat[] {
  const groups = new Map<string, { label: string; byLearner: Map<string, { paid: number; pending: number }> }>();
  for (const r of activeLearnerRows(rows)) {
    const rawKey = pickKey(r);
    const key = rawKey ?? UNASSIGNED_KEY;
    const label = (rawKey ? pickLabel(r) : null) ?? 'Unassigned';
    let g = groups.get(key);
    if (!g) {
      g = { label, byLearner: new Map<string, { paid: number; pending: number }>() };
      groups.set(key, g);
    }
    const l = g.byLearner.get(r.person_id) ?? { paid: 0, pending: 0 };
    l.paid += r.paid_amount;
    l.pending += r.pending_amount;
    g.byLearner.set(r.person_id, l);
  }

  const out: GroupStat[] = [];
  for (const [key, g] of groups) {
    let fullyPaid = 0, partiallyPaid = 0, unpaid = 0, collected = 0, pending = 0;
    for (const l of g.byLearner.values()) {
      collected += l.paid;
      pending += l.pending;
      const b = bucketOf(l.paid, l.pending);
      if (b === 'fully') fullyPaid++;
      else if (b === 'partial') partiallyPaid++;
      else unpaid++;
    }
    out.push({ key, label: g.label, learners: g.byLearner.size, fullyPaid, partiallyPaid, unpaid, collected, pending });
  }
  return out.sort((a, b) => b.learners - a.learners || a.label.localeCompare(b.label));
}

export const groupByInstitution = (rows: TransportBillRow[]): GroupStat[] =>
  groupLearnerPayments(rows, (r) => r.institution_id, (r) => r.institution_name);

export const groupByDepartment = (rows: TransportBillRow[]): GroupStat[] =>
  groupLearnerPayments(rows, (r) => r.department_id, (r) => r.department_name);
