// lib/fines/fine-template.ts
// The fine sheet is shaped exactly like the fee stop-rate sheet — same stop
// identity, same reorder tripwire, same blank-means-clear rule — differing only
// in the amount column's NAME. Rather than fork ~100 lines of validated parsing
// (and its tests), this adapts the header on the way in and out.

import {
  buildTemplateRows,
  parseImportRows,
  TEMPLATE_HEADERS,
  type TemplateStop,
  type ParseError,
} from '@/lib/fees/stop-template';

export const FINE_TEMPLATE_HEADERS: readonly string[] = TEMPLATE_HEADERS.map((h) =>
  h === 'annual_amount' ? 'fine_amount' : h
);

export interface ParsedFineRate {
  stop_id: string;
  fine_amount: number;
}

export function buildFineTemplateRows(
  stops: TemplateStop[],
  existing: Map<string, number>
): Record<string, string | number>[] {
  return buildTemplateRows(stops, existing).map(({ annual_amount, ...rest }) => ({
    ...rest,
    fine_amount: annual_amount,
  }));
}

export function parseFineImportRows(
  rows: Record<string, unknown>[],
  known: Map<string, TemplateStop>
): { rates: ParsedFineRate[]; clears: string[]; errors: ParseError[] } {
  // Rename fine_amount -> annual_amount so the proven parser sees the shape it
  // expects; everything else (stop identity, name/route tripwires, duplicate
  // detection, blank-is-clear) is reused untouched.
  const renamed = rows.map(({ fine_amount, ...rest }) => ({ ...rest, annual_amount: fine_amount }));
  const out = parseImportRows(renamed, known);
  return {
    rates: out.rates.map((r) => ({ stop_id: r.stop_id, fine_amount: r.annual_amount })),
    clears: out.clears,
    errors: out.errors,
  };
}
