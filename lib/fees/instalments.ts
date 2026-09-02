// lib/fees/instalments.ts
// Folding a fee structure's terms into ONE bill plus its instalment schedule.
//
// The shared billing platform holds a year's payment timeline as child rows of a
// single bill (billing_bill_instalments), not as separate bills. Two platform
// rules drive everything here:
//
//   1. trg_bbi_validate_sum requires sum(instalment.amount) == bill.final_amount
//      EXACTLY, so the last instalment absorbs rounding.
//   2. Payments are allocated by (due_date, sequence_no) — see
//      billing_bill_instalment_state — so sequence_no must follow due date, or
//      a payment settles the wrong instalment.
//
// Pure by design: no client, no clock. The generator supplies the terms.

import type { BillableTerm } from './resolve-terms';

export interface FoldedInstalment {
  sequence_no: number;
  amount: number;
  due_date: string;
  label: string | null;
}

export interface FoldedBill {
  /** The year total — billing_student_bills.final_amount. */
  total: number;
  /** The first instalment's date. The platform advances this as instalments settle. */
  dueDate: string;
  instalments: FoldedInstalment[];
}

/** Round to paise. Money arithmetic in JS floats drifts otherwise. */
const money = (n: number) => Math.round(n * 100) / 100;

/**
 * Fold a person's resolved terms into one bill.
 *
 * Returns null when there is nothing billable — no terms, or a total of zero or
 * less. A null result must never be written: `billing_bill_instalments` has
 * CHECK (amount > 0), and a zero bill is not a debt.
 */
export function foldTermsIntoBill(terms: BillableTerm[]): FoldedBill | null {
  if (!terms.length) return null;

  // Sort by due date so sequence_no and the platform's allocation order agree.
  // term_no breaks ties, keeping two same-day terms in their configured order.
  const ordered = [...terms].sort(
    (a, b) => (a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : a.term_no - b.term_no)
  );

  const total = money(ordered.reduce((s, t) => s + Number(t.amount), 0));
  if (total <= 0) return null;

  let allocated = 0;
  const instalments = ordered.map((t, i) => {
    // The last instalment takes the remainder, so the sum is exact by
    // construction rather than by luck of rounding.
    const amount = i === ordered.length - 1 ? money(total - allocated) : money(Number(t.amount));
    allocated = money(allocated + amount);
    return {
      sequence_no: i + 1,
      amount,
      due_date: t.due_date,
      label: t.term_label,
    };
  });

  return { total, dueDate: ordered[0].due_date, instalments };
}

/**
 * How a bill's single paid amount lands across its instalments: oldest first,
 * never more than an instalment is worth. Mirrors the database function
 * billing_bill_instalment_state so the UI and the gate agree with the platform.
 *
 * Callers must pass instalments already in (due_date, sequence_no) order.
 */
export function allocateWaterfall(
  paid: number,
  instalments: Array<{ amount: number }>
): number[] {
  let left = Math.max(0, Number(paid) || 0);
  return instalments.map((i) => {
    const take = money(Math.min(left, Number(i.amount) || 0));
    left = money(left - take);
    return take;
  });
}
