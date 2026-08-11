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
      expect(r.terms).toEqual([
        { term_no: 1, term_label: 'Term 1', amount: 2500, due_date: '2026-06-15' },
        { term_no: 2, term_label: 'Term 2', amount: 2500, due_date: '2026-11-15' },
      ]);
    }
  });

  it('picks the first-year band for a current-year admission', () => {
    const r = resolvePersonTerms(
      { admission_year: 2026, transport_stop_id: null },
      ctx({ feeMode: 'tiered' })
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.band?.id).toBe('band-1');
      expect(r.terms).toEqual([
        { term_no: 1, term_label: 'Term 1', amount: 500, due_date: '2026-06-15' },
      ]);
    }
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

// ── NEW: stop_wise ──────────────────────────────────────────────────────────
describe('resolvePersonTerms — stop_wise', () => {
  const rates = new Map<string, number>([
    ['stop-kachu-palli', 9900],
    ['stop-pillukurichi', 18400],
  ]);

  it('splits the stop annual amount across the shared schedule', () => {
    const r = resolvePersonTerms(
      { admission_year: 2024, transport_stop_id: 'stop-kachu-palli' },
      ctx({ feeMode: 'stop_wise', stopRateByStopId: rates })
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.terms).toEqual([
        { term_no: 1, term_label: 'Term 1', amount: 4950, due_date: '2026-06-15' },
        { term_no: 2, term_label: 'Term 2', amount: 4950, due_date: '2026-11-15' },
      ]);
      expect(r.band).toBeNull();
    }
  });

  it('prices a different stop differently', () => {
    const r = resolvePersonTerms(
      { admission_year: 2024, transport_stop_id: 'stop-pillukurichi' },
      ctx({ feeMode: 'stop_wise', stopRateByStopId: rates })
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.terms.reduce((s, t) => s + t.amount, 0)).toBe(18400);
  });

  it('ignores year of study entirely', () => {
    const a = resolvePersonTerms(
      { admission_year: 2020, transport_stop_id: 'stop-kachu-palli' },
      ctx({ feeMode: 'stop_wise', stopRateByStopId: rates })
    );
    const b = resolvePersonTerms(
      { admission_year: null, transport_stop_id: 'stop-kachu-palli' },
      ctx({ feeMode: 'stop_wise', stopRateByStopId: rates })
    );
    expect(a).toEqual({
      ok: true,
      band: null,
      terms: [
        { term_no: 1, term_label: 'Term 1', amount: 4950, due_date: '2026-06-15' },
        { term_no: 2, term_label: 'Term 2', amount: 4950, due_date: '2026-11-15' },
      ],
    });
    expect(b).toEqual(a);
  });

  it('maps each amount to its own term — uneven shares catch an index swap', () => {
    // 60/40 on 10000 => 6000 then 4000. With symmetric shares an index swap is
    // invisible; uneven shares make the mapping observable.
    const unevenTerms = [
      { term_no: 1, term_label: 'First', due_date: '2026-06-15', share_percent: 60 },
      { term_no: 2, term_label: 'Second', due_date: '2026-11-15', share_percent: 40 },
    ];
    const r = resolvePersonTerms(
      { admission_year: 2024, transport_stop_id: 'stop-uneven' },
      ctx({
        feeMode: 'stop_wise',
        stopTerms: unevenTerms,
        stopRateByStopId: new Map<string, number>([['stop-uneven', 10000]]),
      })
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.terms).toEqual([
        { term_no: 1, term_label: 'First', amount: 6000, due_date: '2026-06-15' },
        { term_no: 2, term_label: 'Second', amount: 4000, due_date: '2026-11-15' },
      ]);
    }
  });

  it('is UNRESOLVED when the student has no boarding stop', () => {
    const r = resolvePersonTerms(
      { admission_year: 2024, transport_stop_id: null },
      ctx({ feeMode: 'stop_wise', stopRateByStopId: rates })
    );
    expect(r).toEqual({ ok: false, reason: 'no_stop' });
  });

  it('is UNRESOLVED when the stop has no configured rate — never billed as 0', () => {
    const r = resolvePersonTerms(
      { admission_year: 2024, transport_stop_id: 'stop-with-no-rate' },
      ctx({ feeMode: 'stop_wise', stopRateByStopId: rates })
    );
    expect(r).toEqual({ ok: false, reason: 'no_stop_rate' });
  });

  it('bills a genuine zero rate rather than calling it unresolved', () => {
    const free = new Map<string, number>([['stop-free', 0]]);
    const r = resolvePersonTerms(
      { admission_year: 2024, transport_stop_id: 'stop-free' },
      ctx({ feeMode: 'stop_wise', stopRateByStopId: free })
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.terms.map((t) => t.amount)).toEqual([0, 0]);
  });

  it('throws when the schedule is missing — a bug affecting everyone, not a per-student gap', () => {
    expect(() =>
      resolvePersonTerms(
        { admission_year: 2024, transport_stop_id: 'stop-kachu-palli' },
        ctx({ feeMode: 'stop_wise', stopRateByStopId: rates, stopTerms: [] })
      )
    ).toThrow(/non-empty stopTerms/i);
  });
});

// ── NEW: per-person overrides ───────────────────────────────────────────────
describe('resolvePersonTerms — per-person overrides', () => {
  it('flat: replaces one amount and drops another', () => {
    const r = resolvePersonTerms(
      {
        admission_year: 2024,
        transport_stop_id: null,
        overrides: [
          { term_no: 1, billable: true, amount: 500 },
          { term_no: 2, billable: false, amount: null },
        ],
      },
      ctx()
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.terms).toEqual([
        { term_no: 1, term_label: 'Term 1', amount: 500, due_date: '2026-06-15' },
      ]);
    }
  });

  it('flat: leaves the structure terms untouched for everyone else', () => {
    const r = resolvePersonTerms(
      { admission_year: 2024, transport_stop_id: null, overrides: [] },
      ctx()
    );
    expect(r).toEqual({ ok: true, terms: FLAT_TERMS, band: null });
  });

  it('flat: an override does NOT leak into the shared structure terms', () => {
    // FLAT_TERMS is a module-level array reused by every person in a run. If
    // applyOverrides mutated it, the next learner would inherit this discount.
    resolvePersonTerms(
      {
        admission_year: 2024,
        transport_stop_id: null,
        overrides: [{ term_no: 1, billable: true, amount: 1 }],
      },
      ctx()
    );
    expect(FLAT_TERMS[0].amount).toBe(2750);
  });

  it('tiered: overrides apply on top of the matched band', () => {
    const r = resolvePersonTerms(
      {
        admission_year: 2024, // => year 3 => band-2 (2500 + 2500)
        transport_stop_id: null,
        overrides: [{ term_no: 2, billable: false, amount: null }],
      },
      ctx({ feeMode: 'tiered' })
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.band?.id).toBe('band-2');
      expect(r.terms).toEqual([
        { term_no: 1, term_label: 'Term 1', amount: 2500, due_date: '2026-06-15' },
      ]);
    }
  });

  it('stop_wise: an override beats the stop rate split', () => {
    const r = resolvePersonTerms(
      {
        admission_year: 2024,
        transport_stop_id: 'stop-kachu-palli',
        overrides: [{ term_no: 1, billable: true, amount: 500 }],
      },
      ctx({
        feeMode: 'stop_wise',
        stopRateByStopId: new Map<string, number>([['stop-kachu-palli', 9900]]),
      })
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.terms).toEqual([
        { term_no: 1, term_label: 'Term 1', amount: 500, due_date: '2026-06-15' },
        { term_no: 2, term_label: 'Term 2', amount: 4950, due_date: '2026-11-15' },
      ]);
    }
  });

  it('an override never rescues an UNRESOLVED person', () => {
    // No matching band means we do not know which terms exist at all. An override
    // supplies an amount, not a schedule -- it must not manufacture a bill.
    const r = resolvePersonTerms(
      {
        admission_year: null,
        transport_stop_id: null,
        overrides: [{ term_no: 1, billable: true, amount: 500 }],
      },
      ctx({ feeMode: 'tiered' })
    );
    expect(r).toEqual({ ok: false, reason: 'no_matching_band' });
  });
});
