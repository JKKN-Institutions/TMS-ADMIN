import { describe, it, expect } from 'vitest';
import {
  resolvePersonTerms,
  type BillableTerm,
  type ResolveBand,
  type ResolveContext,
  type StopScheduleTerm,
} from './resolve-terms';

const FLAT_TERMS: BillableTerm[] = [
  { term_no: 1, term_label: 'Term 1', amount: 2750, due_date: '2026-06-15' },
  { term_no: 2, term_label: 'Term 2', amount: 2750, due_date: '2026-11-15' },
];

const BANDS: ResolveBand[] = [
  {
    id: 'band-1',
    label: 'First year',
    study_years: [1],
    terms: [{ term_no: 1, term_label: 'Term 1', amount: 500, due_date: '2026-06-15' }],
  },
  {
    id: 'band-2',
    label: 'Years 2-3',
    study_years: [2, 3],
    terms: [
      { term_no: 1, term_label: 'Term 1', amount: 2500, due_date: '2026-06-15' },
      { term_no: 2, term_label: 'Term 2', amount: 2500, due_date: '2026-11-15' },
    ],
  },
];

const STOP_TERMS: StopScheduleTerm[] = [
  { term_no: 1, term_label: 'Term 1', due_date: '2026-06-15', share_percent: 50 },
  { term_no: 2, term_label: 'Term 2', due_date: '2026-11-15', share_percent: 50 },
];

function ctx(over: Partial<ResolveContext> = {}): ResolveContext {
  return {
    feeMode: 'flat',
    currentYear: 2026,
    flatTerms: FLAT_TERMS,
    bands: BANDS,
    stopTerms: STOP_TERMS,
    stopRateByStopId: new Map<string, number>(),
    ...over,
  };
}

// ── CHARACTERIZATION: flat ──────────────────────────────────────────────────
describe('resolvePersonTerms — flat (existing behaviour)', () => {
  it('gives every person the structure terms verbatim', () => {
    const r = resolvePersonTerms({ admission_year: 2024, transport_stop_id: null }, ctx());
    expect(r).toEqual({ ok: true, terms: FLAT_TERMS, band: null });
  });

  it('ignores a missing admission year — flat never tiers', () => {
    const r = resolvePersonTerms({ admission_year: null, transport_stop_id: null }, ctx());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.terms).toEqual(FLAT_TERMS);
  });
});

// ── CHARACTERIZATION: tiered ────────────────────────────────────────────────
describe('resolvePersonTerms — tiered (existing behaviour)', () => {
  it('picks the band matching the derived year of study', () => {
    // admitted 2024, transport year 2026 => year 3 => band-2
    const r = resolvePersonTerms(
      { admission_year: 2024, transport_stop_id: null },
      ctx({ feeMode: 'tiered' })
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.band?.id).toBe('band-2');
      expect(r.terms).toHaveLength(2);
    }
  });

  it('picks the first-year band for a current-year admission', () => {
    const r = resolvePersonTerms(
      { admission_year: 2026, transport_stop_id: null },
      ctx({ feeMode: 'tiered' })
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.band?.id).toBe('band-1');
  });

  it('is UNRESOLVED when the admission year is missing (never guessed)', () => {
    const r = resolvePersonTerms(
      { admission_year: null, transport_stop_id: null },
      ctx({ feeMode: 'tiered' })
    );
    expect(r).toEqual({ ok: false, reason: 'no_matching_band' });
  });

  it('is UNRESOLVED when the derived year matches no band', () => {
    // admitted 2020 => year 7 => no band
    const r = resolvePersonTerms(
      { admission_year: 2020, transport_stop_id: null },
      ctx({ feeMode: 'tiered' })
    );
    expect(r).toEqual({ ok: false, reason: 'no_matching_band' });
  });

  it('is UNRESOLVED when the transport year start is unknown', () => {
    const r = resolvePersonTerms(
      { admission_year: 2024, transport_stop_id: null },
      ctx({ feeMode: 'tiered', currentYear: null })
    );
    expect(r).toEqual({ ok: false, reason: 'no_matching_band' });
  });
});
