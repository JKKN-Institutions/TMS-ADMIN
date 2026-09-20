// lib/fees/payment-mode.ts
// The payment-mode vocabulary and the pure aggregations over it. Deliberately
// free of any Supabase import so the table, the filter and the charts can use it
// without pulling the receipt loader (receipts.ts) into the client bundle.

import type { TransportBillRow } from './bills';

/**
 * The modes the accountants record, plus two of our own:
 *  - `other`  — an unrecognised string. billing_receipts.payment_mode is a
 *               free-text varchar with no check constraint, so a new value can
 *               appear at any time and must not fall through as `undefined`.
 *  - `mixed`  — several receipts in DIFFERENT modes settled one bill. Distinct
 *               from the DB's own `combined`, which is ONE receipt the accountant
 *               recorded as cash+online; that split is not stored anywhere (no
 *               receipt-split table exists), so `combined` can only be labelled,
 *               never apportioned.
 */
export type PaymentMode =
  | 'cash' | 'online' | 'dd' | 'cheque' | 'bank_transfer' | 'combined' | 'other' | 'mixed';

/** Filter value for a bill with no receipt at all (nothing collected yet). */
export const NO_PAYMENT_MODE = 'none';

export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  cash: 'Cash',
  online: 'Online',
  dd: 'DD',
  cheque: 'Cheque',
  bank_transfer: 'Bank Transfer',
  combined: 'Combined',
  other: 'Other',
  mixed: 'Mixed',
};

const KNOWN: readonly string[] = ['cash', 'online', 'dd', 'cheque', 'bank_transfer', 'combined'];

/** Normalise one stored payment_mode. Returns null for blank/absent. */
export function normalizeMode(raw: string | null | undefined): PaymentMode | null {
  const v = (raw ?? '').trim().toLowerCase();
  if (!v) return null;
  return (KNOWN.includes(v) ? v : 'other') as PaymentMode;
}

// Display order: cash first because it IS the default here (~95% of transport
// collection by value), then the electronic modes, then the ambiguous ones.
const ORDER: PaymentMode[] = ['cash', 'online', 'dd', 'cheque', 'bank_transfer', 'combined', 'mixed', 'other'];

/**
 * Filter options for the modes PRESENT in these rows, in display order, with the
 * "Not recorded" bucket last when any row lacks a receipt.
 *
 * Derived from the data rather than hard-coded so a year in which nobody paid by
 * cheque doesn't offer a Cheque option that filters to an empty table.
 */
export function paymentModeFilterOptions(
  rows: Array<Pick<TransportBillRow, 'payment_mode'>>
): { label: string; value: string }[] {
  const present = new Set(rows.map((r) => r.payment_mode));
  const opts: { label: string; value: string }[] = ORDER.filter((m) => present.has(m)).map((m) => ({
    label: PAYMENT_MODE_LABELS[m],
    value: m as string,
  }));
  if (present.has(null)) opts.push({ label: 'Not recorded', value: NO_PAYMENT_MODE });
  return opts;
}

export interface ModeCollection {
  mode: PaymentMode;
  label: string;
  collected: number;
  bills: number;
  people: number;
}

/**
 * Collection split by how the money arrived.
 *
 * Counts COLLECTED money only — `paid_amount`, never `amount` — so the tiles sum
 * to the Collected KPI and not to Billed. Cancelled bills are excluded for the
 * same reason summarizeBills excludes them: they are void. Rows with no receipt
 * contribute nothing and are simply absent, which is why this reconciles against
 * Collected rather than against Billed.
 */
export function collectionByMode(rows: TransportBillRow[]): ModeCollection[] {
  const acc = new Map<PaymentMode, { collected: number; bills: number; people: Set<string> }>();
  for (const r of rows) {
    if (r.status === 'cancelled' || !r.payment_mode || r.paid_amount <= 0) continue;
    const cur = acc.get(r.payment_mode) ?? { collected: 0, bills: 0, people: new Set<string>() };
    cur.collected += r.paid_amount;
    cur.bills += 1;
    cur.people.add(r.person_id);
    acc.set(r.payment_mode, cur);
  }
  return ORDER.filter((m) => acc.has(m)).map((m) => {
    const a = acc.get(m)!;
    return { mode: m, label: PAYMENT_MODE_LABELS[m], collected: a.collected, bills: a.bills, people: a.people.size };
  });
}
