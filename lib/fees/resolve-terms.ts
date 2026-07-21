// lib/fees/resolve-terms.ts
// The single decision point for "which terms and amounts apply to this person?"
//
// Extracted from app/api/admin/fees/[id]/generate/route.ts so all three fee
// modes can be unit-tested without a database. The flat and tiered branches are
// the original logic verbatim and are pinned by characterization tests — the
// generator's behaviour for existing structures must not drift.
//
// An unresolvable person is NEVER given a guessed amount. They are reported.

import { deriveStudyYear, bandForYear } from './year-of-study';
import type { FeeMode } from './types';

export interface BillableTerm {
  term_no: number;
  term_label: string | null;
  amount: number;
  due_date: string;
}

export interface ResolveBand {
  id: string;
  label: string | null;
  study_years: number[];
  terms: BillableTerm[];
}

/** One instalment of a stop_wise schedule: a share, not an amount. */
export interface StopScheduleTerm {
  term_no: number;
  term_label: string | null;
  due_date: string;
  share_percent: number;
}

export interface ResolvePerson {
  admission_year: number | null;
  transport_stop_id: string | null;
}

export interface ResolveContext {
  feeMode: FeeMode;
  currentYear: number | null;
  flatTerms: BillableTerm[];
  bands: ResolveBand[];
  // Only read when feeMode === 'stop_wise'. Optional so the flat/tiered call
  // sites need not pass empty placeholders they would never use.
  stopTerms?: StopScheduleTerm[];
  stopRateByStopId?: Map<string, number>;
}

export type UnresolvedReason = 'no_matching_band' | 'no_stop' | 'no_stop_rate';

export type ResolveOutcome =
  | { ok: true; terms: BillableTerm[]; band: ResolveBand | null }
  | { ok: false; reason: UnresolvedReason };

/** Human-readable text for a generation-run note / dry-run report. */
export const UNRESOLVED_LABEL: Record<UnresolvedReason, string> = {
  no_matching_band: 'no admission year / no matching band',
  no_stop: 'no boarding stop assigned',
  no_stop_rate: 'no fee configured for their boarding stop',
};

export function resolvePersonTerms(
  person: ResolvePerson,
  ctx: ResolveContext
): ResolveOutcome {
  if (ctx.feeMode === 'tiered') {
    const year = deriveStudyYear(ctx.currentYear, person.admission_year);
    const band = bandForYear(ctx.bands, year);
    if (!band) return { ok: false, reason: 'no_matching_band' };
    return { ok: true, terms: band.terms, band };
  }

  // 'flat' — everyone matched gets the structure terms verbatim.
  return { ok: true, terms: ctx.flatTerms, band: null };
}
