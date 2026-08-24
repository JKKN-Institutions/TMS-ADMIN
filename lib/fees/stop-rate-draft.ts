// lib/fees/stop-rate-draft.ts
// Pure draft <-> payload maths for editing stop_wise rates inline.
//
// The Stop rates card keeps edits in a `Record<stopId, rawInputString>` draft
// until Save. Everything that turns those raw strings into money lives here so
// it can be tested without a DOM — these are the rules that decide what a
// learner is billed.

export interface StopRateLike {
  stop_id: string;
  annual_amount: number | null;
}

export type ParsedRate =
  | { ok: true; amount: number | null }
  | { ok: false; reason: string };

/**
 * Turn one input box's raw value into the amount the API expects.
 *
 * A blank box means CLEAR (delete the rate), which is not the same as 0: a
 * cleared stop is unbillable and shows as "Needs rate", while 0 is a real,
 * deliberately-free rate. `'0'` is falsy in JS, so the blank check must be on
 * the trimmed string, never on the number.
 */
export function parseRateInput(raw: string): ParsedRate {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: true, amount: null };
  const amount = Number(trimmed);
  if (!Number.isFinite(amount)) return { ok: false, reason: 'not a number' };
  if (amount < 0) return { ok: false, reason: 'cannot be negative' };
  return { ok: true, amount };
}

/**
 * What this stop is worth right now on screen: the draft if it parses, else the
 * saved value. Mid-typing garbage ("-", "1e") falls back rather than flickering
 * the priced counter and the status badge.
 */
export function effectiveAmount(row: StopRateLike, draft: Record<string, string>): number | null {
  const raw = draft[row.stop_id];
  if (raw === undefined) return row.annual_amount;
  const parsed = parseRateInput(raw);
  return parsed.ok ? parsed.amount : row.annual_amount;
}

/**
 * Stops whose draft genuinely differs from what is saved. Typing a value and
 * undoing it back to the saved figure is NOT dirty, so Save stays disabled and
 * no pointless write reaches the money tables. An unparseable draft counts as
 * dirty so Save reports it instead of silently dropping it.
 */
export function dirtyStopIds(rows: StopRateLike[], draft: Record<string, string>): string[] {
  const out: string[] = [];
  for (const row of rows) {
    const raw = draft[row.stop_id];
    if (raw === undefined) continue;
    const parsed = parseRateInput(raw);
    if (!parsed.ok) {
      out.push(row.stop_id);
      continue;
    }
    if (parsed.amount !== row.annual_amount) out.push(row.stop_id);
  }
  return out;
}

export interface RatePayload {
  rates: Array<{ stop_id: string; annual_amount: number | null }>;
  invalid: Array<{ stop_id: string; reason: string }>;
}

/**
 * Build the PUT body from the draft. Only CHANGED stops are sent — the sheet is
 * ~479 rows and re-sending untouched ones would rewrite `updated_at` across the
 * whole price list for a one-stop correction.
 *
 * All-or-nothing: if any edited row is invalid, `rates` comes back empty so the
 * caller can refuse to save. A partially-applied price list is harder to spot
 * and to undo than a rejected one.
 */
export function buildRatePayload(rows: StopRateLike[], draft: Record<string, string>): RatePayload {
  const rates: RatePayload['rates'] = [];
  const invalid: RatePayload['invalid'] = [];

  for (const stop_id of dirtyStopIds(rows, draft)) {
    const parsed = parseRateInput(draft[stop_id]);
    if (!parsed.ok) {
      invalid.push({ stop_id, reason: parsed.reason });
      continue;
    }
    rates.push({ stop_id, annual_amount: parsed.amount });
  }

  return invalid.length ? { rates: [], invalid } : { rates, invalid };
}
