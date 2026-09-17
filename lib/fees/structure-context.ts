// lib/fees/structure-context.ts
// Everything resolvePersonTerms needs for ONE fee structure: its terms / bands /
// stop schedule + rates, and the transport year's start (for year of study).
// Extracted from generate.ts so the Fee Concession tab prices people exactly as
// the generator does. Error strings are the generator's, unchanged.

import type { SupabaseClient } from '@supabase/supabase-js';
import { currentYearOf } from './year-of-study';
import type { FeeMode } from './types';
import type { BillableTerm, ResolveBand, ResolveContext, StopScheduleTerm } from './resolve-terms';

export interface StructureContext {
  ctx: ResolveContext;
  tyStart: string | null;
  tyName: string | null;
}

type Fail = { ok: false; status: number; error: string };

export async function loadResolveContext(
  svc: SupabaseClient,
  fs: { id: string; fee_mode: FeeMode; transport_year_id: string }
): Promise<{ ok: true; value: StructureContext } | Fail> {
  const id = fs.id;
  const isTiered = fs.fee_mode === 'tiered';
  const isStopWise = fs.fee_mode === 'stop_wise';

  // Transport year start → the calendar year used to derive year of study, and
  // the date used to resolve each learner's academic_year. Needed for dry-run too.
  const { data: ty } = await svc
    .from('tms_transport_year')
    .select('start_date, name')
    .eq('id', fs.transport_year_id)
    .maybeSingle();
  const tyStart: string | null = ty?.start_date ?? null;
  // Carried into bill_description: term_number is NULL on transport bills and
  // transport_year_id is unreliable there, so the description text is the only
  // dependable record of which year a bill belongs to.
  const tyName: string | null = (ty as { name?: string } | null)?.name ?? null;
  const currentYear = currentYearOf(tyStart);

  // Load the terms that drive billing: flat = structure terms; tiered = bands+terms.
  let flatTerms: BillableTerm[] = [];
  let bands: ResolveBand[] = [];
  if (isTiered) {
    const { data: bandRows } = await svc
      .from('tms_fee_structure_year_band')
      .select('*')
      .eq('fee_structure_id', id)
      .order('band_order', { ascending: true });
    const bandList = (bandRows ?? []) as Array<Omit<ResolveBand, 'terms'>>;
    if (bandList.length === 0) {
      return { ok: false, status: 400, error: 'This tiered fee structure has no year bands defined.' };
    }
    const bandIds = bandList.map((b) => b.id);
    const { data: bandTermRows } = await svc
      .from('tms_fee_structure_term')
      .select('*')
      .in('year_band_id', bandIds)
      .order('term_no', { ascending: true });
    const byBand = new Map<string, BillableTerm[]>();
    for (const t of (bandTermRows ?? []) as Array<BillableTerm & { year_band_id: string }>) {
      const arr = byBand.get(t.year_band_id) ?? [];
      arr.push({ term_no: t.term_no, term_label: t.term_label, amount: Number(t.amount), due_date: t.due_date });
      byBand.set(t.year_band_id, arr);
    }
    bands = bandList.map((b) => ({ ...b, terms: byBand.get(b.id) ?? [] }));
    const emptyBand = bands.find((b) => b.terms.length === 0);
    if (emptyBand) {
      return {
        ok: false,
        status: 400,
        error: `Year band "${emptyBand.label || emptyBand.study_years.join(', ')}" has no terms defined.`,
      };
    }
  } else if (!isStopWise) {
    const { data: termsData } = await svc
      .from('tms_fee_structure_term')
      .select('*')
      .eq('fee_structure_id', id)
      .is('year_band_id', null)
      .order('term_no', { ascending: true });
    flatTerms = (termsData ?? []) as BillableTerm[];
    if (flatTerms.length === 0) {
      return { ok: false, status: 400, error: 'This fee structure has no terms defined.' };
    }
  }
  // stop_wise deliberately has NO tms_fee_structure_term rows (POST never
  // inserts them, PUT deletes them) — its schedule lives entirely in
  // tms_fee_structure_stop_term, loaded by the isStopWise block below. Do
  // NOT fall into the flat-terms branch above for stop_wise: it would always
  // find zero rows and 400 before ever reaching its own schedule.

  // stop_wise: the shared share-based schedule + every configured stop rate.
  const stopTerms: StopScheduleTerm[] = [];
  const stopRateByStopId = new Map<string, number>();
  if (isStopWise) {
    const { data: stRows, error: stErr } = await svc
      .from('tms_fee_structure_stop_term')
      .select('term_no, term_label, due_date, share_percent')
      .eq('fee_structure_id', id)
      .order('term_no', { ascending: true });
    if (stErr) {
      return { ok: false, status: 500, error: 'Failed to load the instalment schedule.' };
    }
    for (const t of (stRows ?? []) as Array<{
      term_no: number; term_label: string | null; due_date: string; share_percent: number;
    }>) {
      stopTerms.push({
        term_no: t.term_no,
        term_label: t.term_label,
        due_date: t.due_date,
        share_percent: Number(t.share_percent),
      });
    }
    if (stopTerms.length === 0) {
      return {
        ok: false,
        status: 400,
        error: 'This stop-wise fee structure has no instalment terms defined.',
      };
    }

    const { data: rateRows, error: rateErr } = await svc
      .from('tms_fee_structure_stop_rate')
      .select('stop_id, annual_amount')
      .eq('fee_structure_id', id);
    if (rateErr) {
      return { ok: false, status: 500, error: 'Failed to load stop rates.' };
    }
    for (const r of (rateRows ?? []) as Array<{ stop_id: string; annual_amount: number }>) {
      stopRateByStopId.set(r.stop_id, Number(r.annual_amount));
    }
    if (stopRateByStopId.size === 0) {
      return {
        ok: false,
        status: 400,
        error: 'This stop-wise fee structure has no stop rates. Upload the rate sheet first.',
      };
    }
  }

  return {
    ok: true,
    value: {
      tyStart,
      tyName,
      ctx: {
        feeMode: fs.fee_mode,
        currentYear,
        flatTerms,
        bands,
        stopTerms: isStopWise ? stopTerms : undefined,
        stopRateByStopId: isStopWise ? stopRateByStopId : undefined,
      },
    },
  };
}
