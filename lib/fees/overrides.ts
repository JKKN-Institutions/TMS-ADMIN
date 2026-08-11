// lib/fees/overrides.ts
// Per-person exceptions to a fee structure's amounts.
//
// A fee structure prices a COHORT. Some individuals owe something else -- a
// scholarship, a negotiated concession. tms_fee_override records that exception
// per (person, transport year, term); this module applies it.
//
// Applied AFTER a fee mode has produced its terms, never inside a mode branch, so
// flat / tiered / stop_wise all honour overrides through this one implementation
// and none of their existing logic changes.

import type { BillableTerm } from './resolve-terms';

export interface TermOverride {
  term_no: number;
  /** false = this term is not charged at all and is dropped from the bill run. */
  billable: boolean;
  /** Rupees for this one term. NULL exactly when `billable` is false. */
  amount: number | null;
}

/**
 * Apply per-person overrides to the terms a fee structure produced.
 *
 * Iterating `terms` (not `overrides`) is what makes an override for a term the
 * structure does not have a no-op: a term cannot be invented, because there is no
 * due date to give it.
 *
 * Never mutates its arguments. Returns `terms` itself when there is nothing to do.
 */
export function applyOverrides(
  terms: BillableTerm[],
  overrides: TermOverride[]
): BillableTerm[] {
  if (!overrides.length) return terms;

  const byTerm = new Map<number, TermOverride>();
  for (const o of overrides) byTerm.set(o.term_no, o);

  const out: BillableTerm[] = [];
  for (const t of terms) {
    const o = byTerm.get(t.term_no);
    if (!o) {
      out.push(t);
      continue;
    }
    if (!o.billable) continue; // term dropped entirely
    if (o.amount === null) {
      // Unreachable while the DB check constraint holds. If it is ever reached,
      // keep the structure amount: over-billing is visible and correctable,
      // whereas billing 0 silently loses the fee.
      out.push(t);
      continue;
    }
    out.push({ ...t, amount: o.amount });
  }
  return out;
}
