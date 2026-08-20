// lib/fines/rate-drafts.ts
// Pure helpers for pricing an unpriced stop from inside the Generate Fine
// dialog. The dialog never sends an amount to the fine engine — it writes the
// amount to the YEAR'S STOP SHEET first, then re-prices. That keeps the sheet
// the single source of truth for money (see the note in ./fields.ts).

import type { FineCandidate } from './create';
import type { FineRateInput } from './fields';

export interface PriceableStop {
  stop_id: string;
  stop_name: string | null;
  route_number: string | null;
  /** How many of the SELECTED learners board here — one rate prices them all. */
  learner_count: number;
}

/**
 * The stops the operator can fix without leaving the dialog: those skipped
 * purely for want of a rate. Learners with no boarding stop are excluded —
 * there is no stop to price, so that is a passenger-record fix, not a rate fix.
 * Already-priced stops are excluded too, so raising one fine can never re-price
 * a stop for the rest of the year.
 */
export function priceableStops(candidates: FineCandidate[]): PriceableStop[] {
  const byStop = new Map<string, PriceableStop>();
  for (const c of candidates) {
    if (c.skip_reason !== 'no_stop_rate' || !c.stop_id) continue;
    const seen = byStop.get(c.stop_id);
    if (seen) {
      seen.learner_count++;
      continue;
    }
    byStop.set(c.stop_id, {
      stop_id: c.stop_id,
      stop_name: c.stop_name,
      route_number: c.route_number,
      learner_count: 1,
    });
  }
  return [...byStop.values()];
}

/**
 * Turn the dialog's draft inputs into the fine-rates payload. A blank draft is
 * DROPPED, never sent: the rates endpoint reads null as "clear this stop", so
 * sending blanks would delete rates the operator never touched.
 */
export function draftsToRates(drafts: Record<string, string>): FineRateInput[] {
  const rates: FineRateInput[] = [];
  for (const [stop_id, raw] of Object.entries(drafts)) {
    const text = String(raw ?? '').trim();
    if (text === '') continue;

    const amount = Number(text.replace(/,/g, ''));
    if (!Number.isFinite(amount)) {
      throw new Error(`Enter a valid amount for this stop.`);
    }
    // resolveFine() treats 0 as unpriced, so a 0 rate would look configured in
    // the sheet yet still refuse to raise a fine — a confusing dead end.
    if (amount <= 0) {
      throw new Error(`A fine must be greater than zero.`);
    }
    rates.push({ stop_id, fine_amount: amount });
  }
  return rates;
}
