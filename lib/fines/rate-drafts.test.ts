import { describe, it, expect } from 'vitest';
import { priceableStops, draftsToRates } from './rate-drafts';
import type { FineCandidate } from './create';

/** A preview candidate, defaulted to the "unpriced stop" shape the dialog fixes. */
function candidate(over: Partial<FineCandidate> = {}): FineCandidate {
  return {
    person_id: 'p1',
    person_name: 'Learner One',
    code: null,
    institution_id: null,
    stop_id: 'stop-a',
    stop_name: 'AVATHIPALAYAM',
    route_id: 'r1',
    route_number: '34',
    academic_year_id: null,
    amount: null,
    skip_reason: 'no_stop_rate',
    ...over,
  };
}

describe('priceableStops', () => {
  it('offers a stop that is skipped only because it has no rate', () => {
    expect(priceableStops([candidate()])).toEqual([
      { stop_id: 'stop-a', stop_name: 'AVATHIPALAYAM', route_number: '34', learner_count: 1 },
    ]);
  });

  it('collapses several learners at one stop into a single editable row', () => {
    const rows = priceableStops([
      candidate({ person_id: 'p1' }),
      candidate({ person_id: 'p2' }),
      candidate({ person_id: 'p3' }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].learner_count).toBe(3);
  });

  it('keeps distinct unpriced stops separate', () => {
    const rows = priceableStops([
      candidate({ stop_id: 'stop-a', stop_name: 'A' }),
      candidate({ person_id: 'p2', stop_id: 'stop-b', stop_name: 'B' }),
    ]);
    expect(rows.map((r) => r.stop_id)).toEqual(['stop-a', 'stop-b']);
  });

  it('excludes a learner with no boarding stop — there is nothing to price', () => {
    expect(priceableStops([candidate({ stop_id: null, skip_reason: 'no_stop' })])).toEqual([]);
  });

  it('excludes an already-priced stop so raising a fine cannot re-price the year', () => {
    expect(priceableStops([candidate({ amount: 500, skip_reason: null })])).toEqual([]);
  });
});

describe('draftsToRates', () => {
  it('builds the rate payload from the amounts that were filled in', () => {
    expect(draftsToRates({ 'stop-a': '500', 'stop-b': '250.50' })).toEqual([
      { stop_id: 'stop-a', fine_amount: 500 },
      { stop_id: 'stop-b', fine_amount: 250.5 },
    ]);
  });

  it('ignores a blank or whitespace draft rather than clearing that stop', () => {
    expect(draftsToRates({ 'stop-a': '', 'stop-b': '   ', 'stop-c': '100' })).toEqual([
      { stop_id: 'stop-c', fine_amount: 100 },
    ]);
  });

  it('strips thousands separators the way the sheet importer does', () => {
    expect(draftsToRates({ 'stop-a': '1,500' })).toEqual([{ stop_id: 'stop-a', fine_amount: 1500 }]);
  });

  it('rejects zero — a zero rate reads as "priced" but can never raise a fine', () => {
    expect(() => draftsToRates({ 'stop-a': '0' })).toThrow(/greater than zero/i);
  });

  it('rejects a negative amount', () => {
    expect(() => draftsToRates({ 'stop-a': '-50' })).toThrow(/greater than zero/i);
  });

  it('rejects text that is not a number', () => {
    expect(() => draftsToRates({ 'stop-a': 'five hundred' })).toThrow(/valid amount/i);
  });
});
