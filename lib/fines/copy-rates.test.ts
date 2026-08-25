import { describe, it, expect } from 'vitest';
import { planFineRateCopy, type SourceStopRate } from './copy-rates';

const src = (rows: Array<[string, number]>): SourceStopRate[] =>
  rows.map(([stop_id, annual_amount]) => ({ stop_id, annual_amount }));

describe('planFineRateCopy', () => {
  it('inserts every priced stop when the fine sheet is empty', () => {
    const plan = planFineRateCopy(src([['a', 12900], ['b', 4400]]), new Map(), { overwrite: true });
    expect(plan.insert).toHaveLength(2);
    expect(plan.overwrite).toHaveLength(0);
    expect(plan.rows).toEqual([
      { stop_id: 'a', fine_amount: 12900 },
      { stop_id: 'b', fine_amount: 4400 },
    ]);
  });

  it('classifies an existing DIFFERENT amount as an overwrite and reports the old value', () => {
    const plan = planFineRateCopy(src([['a', 12900]]), new Map([['a', 12500]]), { overwrite: true });
    expect(plan.insert).toHaveLength(0);
    expect(plan.overwrite).toEqual([{ stop_id: 'a', fine_amount: 12900, previous: 12500 }]);
    expect(plan.rows).toEqual([{ stop_id: 'a', fine_amount: 12900 }]);
  });

  it('counts an identical existing amount as unchanged and writes nothing for it', () => {
    const plan = planFineRateCopy(src([['a', 12900]]), new Map([['a', 12900]]), { overwrite: true });
    expect(plan.unchanged).toBe(1);
    expect(plan.rows).toHaveLength(0);
  });

  it('treats amounts equal within a rupee fraction as unchanged (numeric arrives as text)', () => {
    const plan = planFineRateCopy(src([['a', 12900]]), new Map([['a', 12900.001]]), { overwrite: true });
    expect(plan.unchanged).toBe(1);
    expect(plan.overwrite).toHaveLength(0);
  });

  it('leaves already-priced stops alone when overwrite is off', () => {
    const plan = planFineRateCopy(
      src([['a', 12900], ['b', 4400]]),
      new Map([['a', 12500]]),
      { overwrite: false }
    );
    // The overwrite is still REPORTED so the dialog can show what it is skipping…
    expect(plan.overwrite).toHaveLength(1);
    // …but only the new stop is actually written.
    expect(plan.rows).toEqual([{ stop_id: 'b', fine_amount: 4400 }]);
  });

  it('never writes a zero or negative source amount — resolveFine reads 0 as unpriced', () => {
    const plan = planFineRateCopy(src([['a', 0], ['b', -50], ['c', 4400]]), new Map(), {
      overwrite: true,
    });
    expect(plan.skippedZero).toBe(2);
    expect(plan.rows).toEqual([{ stop_id: 'c', fine_amount: 4400 }]);
  });

  it('skips a non-numeric source amount rather than writing NaN', () => {
    const plan = planFineRateCopy(
      [{ stop_id: 'a', annual_amount: Number.NaN }],
      new Map(),
      { overwrite: true }
    );
    expect(plan.skippedZero).toBe(1);
    expect(plan.rows).toHaveLength(0);
  });

  it('deduplicates repeated source stops, keeping the first', () => {
    const plan = planFineRateCopy(src([['a', 12900], ['a', 999]]), new Map(), { overwrite: true });
    expect(plan.rows).toEqual([{ stop_id: 'a', fine_amount: 12900 }]);
  });

  it('ignores fine rates for stops the source structure does not price', () => {
    const plan = planFineRateCopy(src([['a', 4400]]), new Map([['zz', 7000]]), { overwrite: true });
    expect(plan.rows).toEqual([{ stop_id: 'a', fine_amount: 4400 }]);
    expect(plan.overwrite).toHaveLength(0);
  });
});
