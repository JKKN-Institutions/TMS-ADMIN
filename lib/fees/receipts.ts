// lib/fees/receipts.ts
// HOW transport money arrived — cash, online, DD, cheque, bank transfer.
//
// TMS owns the LIABILITY (tms_fee_bill: who owes what for transport). MyJKKN's
// billing module owns the CASH EVENT: billing_receipts is the row an accountant
// writes when money changes hands, and `payment_mode` on it is the only record of
// the form it took. The two are joined through the money row:
//
//   tms_fee_bill.billing_student_bill_id
//     -> billing_receipt_items.bill_id   (amount_paid — this bill's slice)
//          -> billing_receipts.id        (payment_mode, receipt_number, reference)
//
// Do NOT source "online" from payment_transactions (the Razorpay table): measured
// on this database, ZERO transport bills are reachable through its bill_ids array,
// and only 133 of 898 `online` receipts even carry a pay_… reference.
// billing_receipts.payment_mode is the single authority.

import type { SupabaseClient } from '@supabase/supabase-js';
import { selectByIds } from './select-by-ids';
import { normalizeMode, type PaymentMode } from './payment-mode';

// Re-exported so callers that already speak "receipts" need not know the
// vocabulary lives in its own client-safe module.
export { normalizeMode, NO_PAYMENT_MODE, PAYMENT_MODE_LABELS, type PaymentMode } from './payment-mode';

/** One receipt as it touches ONE bill (receipt fields + that bill's slice). */
export interface ReceiptFacet {
  payment_mode: string | null;
  receipt_number: string | null;
  payment_reference_number: string | null;
  payment_paid_date: string | null;
  amount_paid: number;
}

export interface BillPaymentInfo {
  /** The single mode, or 'mixed' across modes, or null when nothing was receipted. */
  mode: PaymentMode | null;
  /** Every distinct mode, sorted — so 'mixed' can be explained in a tooltip. */
  modes: PaymentMode[];
  receiptNumbers: string[];
  /** Reference from the LATEST payment (a pay_… id, DD number, …). */
  reference: string | null;
  /** payment_paid_date of the latest receipt. */
  lastPaidDate: string | null;
  /** Sum of amount_paid allocated to this bill. */
  receiptedAmount: number;
}

const EMPTY: BillPaymentInfo = {
  mode: null, modes: [], receiptNumbers: [], reference: null, lastPaidDate: null, receiptedAmount: 0,
};

/**
 * Fold every receipt that touched one bill into a single filterable facet.
 *
 * Pure and separately tested: one bill CAN be settled by several receipts (5 of
 * 2,384 receipted transport bills are, 1 of them across different modes), so the
 * per-row mode is a derived aggregate — never a column.
 */
export function collapseReceipts(facets: ReceiptFacet[]): BillPaymentInfo {
  if (!facets.length) return { ...EMPTY };

  const modes = [...new Set(facets.map((f) => normalizeMode(f.payment_mode)).filter((m): m is PaymentMode => m !== null))].sort();

  // Latest payment wins the reference/date. A receipt with no paid date sorts
  // first so a dated one always beats it; all-undated falls back to the last.
  const latest = facets.reduce((a, b) => ((b.payment_paid_date ?? '') >= (a.payment_paid_date ?? '') ? b : a));

  return {
    mode: modes.length === 0 ? null : modes.length === 1 ? modes[0] : 'mixed',
    modes,
    receiptNumbers: facets.map((f) => f.receipt_number).filter((n): n is string => !!n),
    reference: latest.payment_reference_number ?? null,
    lastPaidDate: latest.payment_paid_date ?? null,
    receiptedAmount: facets.reduce((s, f) => s + Number(f.amount_paid ?? 0), 0),
  };
}

/**
 * Resolve payment mode for many bills, keyed by billing_student_bill_id.
 *
 * Two chunked round trips (items by bill id, then receipts by receipt id) via
 * selectByIds — whose 150-id chunking is load-bearing here: a full transport year
 * is ~2,400 bills, and a single .in() that long overflows the Supabase gateway's
 * request-size limit and returns HTTP 400, which unchecked would quietly mislabel
 * every row as "not recorded". selectByIds throws instead.
 *
 * Voided receipts need no exclusion: billing_receipts_voided is a true move-out
 * (0 of its 23 rows are still present in billing_receipts).
 */
export async function loadPaymentModeMap(
  supabase: SupabaseClient,
  billIds: string[]
): Promise<Map<string, BillPaymentInfo>> {
  const out = new Map<string, BillPaymentInfo>();
  if (!billIds.length) return out;

  const items = await selectByIds<{
    bill_id: string;
    receipt_id: string | null;
    amount_paid: number | string | null;
  }>(supabase, 'billing_receipt_items', 'bill_id, receipt_id, amount_paid', billIds, 'bill_id');
  if (!items.length) return out;

  const receiptIds = [...new Set(items.map((i) => i.receipt_id).filter((id): id is string => !!id))];
  const receipts = await selectByIds<{
    id: string;
    payment_mode: string | null;
    receipt_number: string | null;
    payment_reference_number: string | null;
    payment_paid_date: string | null;
  }>(
    supabase,
    'billing_receipts',
    'id, payment_mode, receipt_number, payment_reference_number, payment_paid_date',
    receiptIds
  );
  const byReceipt = new Map(receipts.map((r) => [r.id, r]));

  const grouped = new Map<string, ReceiptFacet[]>();
  for (const it of items) {
    const r = it.receipt_id ? byReceipt.get(it.receipt_id) : undefined;
    if (!r) continue; // item whose receipt was voided/cancelled → not money today
    const list = grouped.get(it.bill_id) ?? [];
    list.push({
      payment_mode: r.payment_mode,
      receipt_number: r.receipt_number,
      payment_reference_number: r.payment_reference_number,
      payment_paid_date: r.payment_paid_date,
      amount_paid: Number(it.amount_paid ?? 0),
    });
    grouped.set(it.bill_id, list);
  }

  for (const [billId, facets] of grouped) out.set(billId, collapseReceipts(facets));
  return out;
}
