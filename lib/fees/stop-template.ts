// lib/fees/stop-template.ts
// Shaping and validation for the stop-rate sheet.
//
// The template is generated FROM live tms_route_stop rows, so the college fills
// in amounts against stops that provably exist. Matching back is on stop_id —
// exact, never fuzzy. The visible route_number / stop_name columns exist so a
// human can read the sheet, and act as a TRIPWIRE: if rows get reordered or a
// column is pasted over, the names stop agreeing with the id and the row is
// rejected instead of quietly pricing the wrong stop.

export interface TemplateStop {
  stop_id: string;
  stop_name: string;
  sequence_order: number;
  route_number: string | null;
  route_name: string | null;
}

export interface ParsedRate {
  stop_id: string;
  annual_amount: number;
}

export interface ParseError {
  row: number; // 1-based sheet row, header included
  message: string;
}

export const TEMPLATE_HEADERS = [
  'route_number',
  'route_name',
  'sequence_order',
  'stop_name',
  'stop_id',
  'annual_amount',
] as const;

/** One row per stop, pre-filled with any already-configured amount. */
export function buildTemplateRows(
  stops: TemplateStop[],
  existing: Map<string, number>
): Record<string, string | number>[] {
  return stops.map((s) => ({
    route_number: s.route_number ?? '',
    route_name: s.route_name ?? '',
    sequence_order: s.sequence_order,
    stop_name: s.stop_name,
    stop_id: s.stop_id,
    annual_amount: existing.has(s.stop_id) ? (existing.get(s.stop_id) as number) : '',
  }));
}

function norm(v: unknown): string {
  return String(v ?? '').trim().toUpperCase();
}

/**
 * Validate a parsed sheet. Collects EVERY bad row so the operator can fix the
 * sheet in one pass; the caller writes nothing when `errors` is non-empty.
 */
export function parseImportRows(
  rows: Record<string, unknown>[],
  known: Map<string, TemplateStop>
): { rates: ParsedRate[]; errors: ParseError[] } {
  const rates: ParsedRate[] = [];
  const errors: ParseError[] = [];
  const seen = new Set<string>();

  rows.forEach((raw, i) => {
    const rowNo = i + 2; // sheet row: +1 for 0-index, +1 for the header row
    const stopId = String(raw.stop_id ?? '').trim();
    if (!stopId) {
      errors.push({ row: rowNo, message: 'Missing stop_id.' });
      return;
    }
    const stop = known.get(stopId);
    if (!stop) {
      errors.push({ row: rowNo, message: `Unknown stop_id "${stopId}" — not a current route stop.` });
      return;
    }
    if (seen.has(stopId)) {
      errors.push({ row: rowNo, message: `Duplicate row for stop "${stop.stop_name}".` });
      return;
    }
    seen.add(stopId);

    if (norm(raw.stop_name) !== norm(stop.stop_name)) {
      errors.push({
        row: rowNo,
        message: `stop_name "${String(raw.stop_name ?? '')}" does not match stop_id (expected "${stop.stop_name}"). Were rows reordered?`,
      });
      return;
    }
    if (norm(raw.route_number) !== norm(stop.route_number)) {
      errors.push({
        row: rowNo,
        message: `route_number "${String(raw.route_number ?? '')}" does not match stop_id (expected "${stop.route_number ?? ''}").`,
      });
      return;
    }

    const rawAmount = raw.annual_amount;
    if (rawAmount === null || rawAmount === undefined || String(rawAmount).trim() === '') {
      return; // blank = not yet priced; allowed
    }
    const amount = Number(String(rawAmount).replace(/,/g, '').trim());
    if (!Number.isFinite(amount)) {
      errors.push({ row: rowNo, message: `Amount "${String(rawAmount)}" is not a number.` });
      return;
    }
    if (amount < 0) {
      errors.push({ row: rowNo, message: 'Amount cannot be negative.' });
      return;
    }
    rates.push({ stop_id: stopId, annual_amount: amount });
  });

  return { rates, errors };
}
