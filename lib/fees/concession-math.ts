// Pure decisions for the Fee Concession tab: who a rule covers, what they should
// be charged, and whether their overrides + bills already say so. The apply
// function (tms_apply_fee_concession) re-checks bill state itself; this module
// only decides what the list SHOWS and which rows are selectable.

import type { BillableTerm } from './resolve-terms';
import type { TermOverride } from './overrides';

export type ConcessionKind = 'final_year' | 'scheme_75';
export type ConcessionStatus = 'applied' | 'needs_fix' | 'review' | 'unresolved';

export const SCHEME_75_SCHOLARSHIP = '7.5% SCHOLARSHIP';
export const FINAL_YEAR_BATCH_CLOSURE_PREFIX = 'FINAL-YEAR BATCH CLOSURE';
/** Reason prefixes a concession apply writes. Any other reason on an override
 * with no concession_rule_id is a MANUAL exception, not a stale concession run. */
export const CONCESSION_REASON_PREFIXES = [FINAL_YEAR_BATCH_CLOSURE_PREFIX, SCHEME_75_SCHOLARSHIP] as const;

export interface ConcessionRule {
  id: string;
  transport_year_id: string;
  kind: ConcessionKind;
  institution_id: string | null;
  admission_year: number | null;
  program_id: string | null;
  percent: number | null;
  annual_amount: number | null;
  is_active: boolean;
  label: string;
  created_at: string;
}

export interface RuleSubject {
  institution_id: string | null;
  admission_year: number | null;
  program_id: string | null;
  scholarship_type: string | null;
}

/** An override row as it exists in tms_fee_override, with the fields needed
 * to tell a manual fee exception apart from a stale/matching concession run. */
export interface ExistingOverride extends TermOverride {
  reason: string | null;
  concession_rule_id: string | null;
}

export interface LedgerState {
  feeBillId: string;
  termNo: number;
  ledgerAmount: number;
  ledgerStatus: string;
  moneyBillId: string | null;
  moneyFinal: number | null;
  moneyStatus: string | null;
  paid: number;
  pendingPayment: boolean;
}

export function matchRule(
  rules: ConcessionRule[],
  kind: ConcessionKind,
  s: RuleSubject
): ConcessionRule | null {
  const hits = rules
    .filter((r) => r.is_active && r.kind === kind)
    .filter((r) =>
      kind === 'scheme_75'
        ? s.scholarship_type === SCHEME_75_SCHOLARSHIP
        : r.institution_id === s.institution_id &&
          r.admission_year === s.admission_year &&
          (r.program_id === null || r.program_id === s.program_id)
    )
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  return hits[0] ?? null;
}

export function targetTerms(rule: ConcessionRule, full: BillableTerm[]): TermOverride[] {
  const ordered = [...full].sort((a, b) => a.term_no - b.term_no);
  if (rule.kind === 'scheme_75') {
    return ordered.map((t, i) =>
      i === 0
        ? { term_no: t.term_no, billable: true, amount: Number(rule.annual_amount) }
        : { term_no: t.term_no, billable: false, amount: null }
    );
  }
  const pct = Number(rule.percent);
  return ordered.map((t) => ({
    term_no: t.term_no,
    billable: true,
    amount: Math.round((Number(t.amount) * pct) / 100),
  }));
}

export function targetTotal(terms: TermOverride[]): number {
  return terms.reduce((s, t) => s + (t.billable && t.amount !== null ? t.amount : 0), 0);
}

/**
 * What each EXISTING ledger row should carry, keyed by fee bill id. Newer
 * learners have one folded bill holding the whole year; ~900 learners billed
 * before the fold still hold one row per term (3000 + 2500) under structures
 * that are now single-term, so targets follow the rows, not the structure.
 *   final_year: split in proportion to the rows' ledger amounts (last row takes
 *               the remainder) — proportions survive an apply, so it is stable.
 *   scheme_75:  the lowest term keeps the whole amount; other rows → null (delete).
 * Returns null when a split is impossible (legacy rows summing to 0).
 */
export function rowTargets(
  kind: ConcessionKind,
  total: number,
  ledger: LedgerState[]
): Map<string, number | null> | null {
  const rows = [...ledger].sort((a, b) => a.termNo - b.termNo);
  const out = new Map<string, number | null>();
  if (rows.length <= 1) {
    for (const r of rows) out.set(r.feeBillId, total);
    return out;
  }
  if (kind === 'scheme_75') {
    rows.forEach((r, i) => out.set(r.feeBillId, i === 0 ? total : null));
    return out;
  }
  const sum = rows.reduce((s, r) => s + r.ledgerAmount, 0);
  if (sum <= 0) return null;
  let assigned = 0;
  rows.forEach((r, i) => {
    const part = i === rows.length - 1 ? total - assigned : Math.round((total * r.ledgerAmount) / sum);
    assigned += part;
    out.set(r.feeBillId, part);
  });
  return out;
}

/** Any sign money has moved (or is moving) on the row's money bill. */
export function hasPaymentActivity(row: LedgerState): boolean {
  return row.paid > 0 || row.pendingPayment || row.moneyStatus !== 'unpaid';
}

function overridesMatch(target: TermOverride[], existing: TermOverride[]): boolean {
  return target.every((t) => {
    const o = existing.find((e) => e.term_no === t.term_no);
    if (!o || o.billable !== t.billable) return false;
    return t.billable ? Number(o.amount) === t.amount : true;
  });
}

/** True when an override is a manual fee exception (e.g. "ZERO FEE - …"), not a
 * concession this tab wrote or would overwrite: no rule id, and a reason that
 * doesn't start with a known concession run's prefix. */
function isManualException(o: ExistingOverride): boolean {
  return o.concession_rule_id === null && !CONCESSION_REASON_PREFIXES.some((p) => o.reason?.startsWith(p));
}

/** review reason when the target amount itself is unusable — before any
 * ledger/override comparison. */
export function guardTarget(kind: ConcessionKind, total: number, fullTotal: number): string | null {
  if (total <= 0) return 'Concession amount is Rs 0 — handle manually';
  if (kind === 'scheme_75' && total > fullTotal) {
    return `Scheme amount Rs ${total} is more than the full fee Rs ${fullTotal}`;
  }
  return null;
}

export function classifyConcession(input: {
  kind: ConcessionKind;
  terms: TermOverride[];
  total: number;
  overrides: ExistingOverride[];
  ledger: LedgerState[];
}): { status: Exclude<ConcessionStatus, 'unresolved'>; reason: string | null } {
  for (const o of input.overrides) {
    const target = input.terms.find((t) => t.term_no === o.term_no);
    if (!target || !isManualException(o)) continue;
    const matches = target.billable === o.billable && (target.billable ? Number(o.amount) === target.amount : true);
    if (!matches) {
      const reason = (o.reason ?? '').slice(0, 120);
      return { status: 'review', reason: `Has a manual fee exception: ${reason}` };
    }
  }
  const targets = rowTargets(input.kind, input.total, input.ledger);
  if (!targets) {
    return { status: 'review', reason: 'Existing term bills have no amount to split the concession across' };
  }
  let needsFix = false;
  for (const row of input.ledger) {
    if (row.ledgerStatus === 'cancelled' || row.ledgerStatus === 'error') {
      return { status: 'review', reason: `Term ${row.termNo} bill is ${row.ledgerStatus}` };
    }
    if (!row.moneyBillId || row.moneyFinal === null) {
      return { status: 'review', reason: `Term ${row.termNo} bill has no money row` };
    }
    if (row.moneyStatus === 'cancelled') {
      return { status: 'review', reason: `Term ${row.termNo} money bill is cancelled` };
    }
    const target = targets.get(row.feeBillId) ?? null;
    if (target === null) {
      if (hasPaymentActivity(row)) {
        return { status: 'review', reason: `Term ${row.termNo} is not charged under the concession but Rs ${row.paid} is already paid` };
      }
      needsFix = true;
    } else if (row.moneyFinal === target) {
      if (row.ledgerAmount !== target) needsFix = true;
    } else if (hasPaymentActivity(row)) {
      return {
        status: 'review',
        reason: `Rs ${row.paid} paid against a Rs ${row.moneyFinal} ${row.moneyStatus} bill; concession is Rs ${target} — accounts decision`,
      };
    } else {
      needsFix = true;
    }
  }
  if (needsFix || !overridesMatch(input.terms, input.overrides)) {
    return { status: 'needs_fix', reason: null };
  }
  return { status: 'applied', reason: null };
}
