// lib/fines/fields.ts
// Request-body whitelists for the fine endpoints. Mirrors lib/fees/fields.ts:
// only listed keys survive, so no client can smuggle an audit column — or, on
// the create path, an AMOUNT. Fine amounts are resolved server-side from the
// year's stop sheet and are never accepted from the caller.

export interface FineRateInput {
  stop_id: string;
  /** null means "clear this stop's fine", NOT "fine of zero". */
  fine_amount: number | null;
}

export interface CreateFineBody {
  transport_year_id: string;
  person_ids: string[];
  due_date: string; // yyyy-mm-dd
  reason: string;
  notify: boolean;
  idempotency_key: string;
}

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseFineRatesBody(
  raw: unknown
): { ok: true; year: string; rates: FineRateInput[] } | { ok: false; error: string } {
  const body = (raw ?? {}) as Record<string, unknown>;
  if (!isNonEmptyString(body.year)) return { ok: false, error: 'A transport year is required.' };
  if (!Array.isArray(body.rates)) return { ok: false, error: 'rates[] is required.' };

  const rates: FineRateInput[] = [];
  for (const r of body.rates as Array<Record<string, unknown>>) {
    if (!r || !isNonEmptyString(r.stop_id)) return { ok: false, error: 'Every rate row needs a stop_id.' };
    const rawAmount = r.fine_amount;
    if (rawAmount === null || rawAmount === undefined || String(rawAmount).trim() === '') {
      rates.push({ stop_id: r.stop_id, fine_amount: null });
      continue;
    }
    const amount = Number(String(rawAmount).replace(/,/g, '').trim());
    if (!Number.isFinite(amount) || amount < 0) {
      return { ok: false, error: `Invalid fine amount for stop ${r.stop_id}.` };
    }
    rates.push({ stop_id: r.stop_id, fine_amount: amount });
  }
  return { ok: true, year: body.year, rates };
}

export function parseCreateFineBody(raw: unknown): Parsed<CreateFineBody> {
  const body = (raw ?? {}) as Record<string, unknown>;

  if (!isNonEmptyString(body.transport_year_id)) {
    return { ok: false, error: 'A transport year is required.' };
  }
  if (!Array.isArray(body.person_ids) || body.person_ids.length === 0) {
    return { ok: false, error: 'Select at least one learner to fine.' };
  }
  const person_ids = [...new Set((body.person_ids as unknown[]).filter(isNonEmptyString))];
  if (person_ids.length === 0) return { ok: false, error: 'Select at least one learner to fine.' };

  if (!isNonEmptyString(body.due_date) || !DATE_RE.test(body.due_date)) {
    return { ok: false, error: 'A due date (yyyy-mm-dd) is required.' };
  }
  if (!isNonEmptyString(body.reason)) {
    return { ok: false, error: 'A reason is required — it appears on the learner’s bill.' };
  }
  if (!isNonEmptyString(body.idempotency_key)) {
    return { ok: false, error: 'idempotency_key is required.' };
  }

  return {
    ok: true,
    value: {
      transport_year_id: body.transport_year_id,
      person_ids,
      due_date: body.due_date,
      reason: body.reason.trim(),
      notify: body.notify === true,
      idempotency_key: body.idempotency_key,
    },
  };
}
