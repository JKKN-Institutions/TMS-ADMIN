import { describe, it, expect } from 'vitest';
import {
  parseRateInput,
  effectiveAmount,
  dirtyStopIds,
  buildRatePayload,
  type StopRateLike,
} from './stop-rate-draft';

const rows: StopRateLike[] = [
  { stop_id: 'a', annual_amount: 9600 },
  { stop_id: 'b', annual_amount: null },
  { stop_id: 'c', annual_amount: 0 },
];

describe('parseRateInput', () => {
  it('reads a plain number', () => {
    expect(parseRateInput('9600')).toEqual({ ok: true, amount: 9600 });
  });

  it('treats a blank (or whitespace) box as CLEAR, not as zero', () => {
    // A blank amount deletes the stop's rate server-side, which makes the stop
    // unbillable. Silently coercing it to 0 would instead bill everyone on that
    // stop nothing while reporting them as "priced".
    expect(parseRateInput('')).toEqual({ ok: true, amount: null });
    expect(parseRateInput('   ')).toEqual({ ok: true, amount: null });
  });

  it('keeps a literal 0 as a real rate', () => {
    // '0' is falsy in JS — the classic bug in exactly this shape is treating it
    // as empty and deleting a deliberately free stop.
    expect(parseRateInput('0')).toEqual({ ok: true, amount: 0 });
  });

  it('accepts decimals and strips surrounding spaces', () => {
    expect(parseRateInput(' 4400.5 ')).toEqual({ ok: true, amount: 4400.5 });
  });

  it('rejects non-numeric text', () => {
    expect(parseRateInput('abc')).toEqual({ ok: false, reason: 'not a number' });
  });

  it('rejects negatives', () => {
    expect(parseRateInput('-1')).toEqual({ ok: false, reason: 'cannot be negative' });
  });

  it('rejects Infinity', () => {
    expect(parseRateInput('Infinity').ok).toBe(false);
  });
});

describe('effectiveAmount', () => {
  it('falls back to the saved amount when the row is untouched', () => {
    expect(effectiveAmount(rows[0], {})).toBe(9600);
    expect(effectiveAmount(rows[1], {})).toBeNull();
  });

  it('prefers a valid draft over the saved amount', () => {
    expect(effectiveAmount(rows[0], { a: '12000' })).toBe(12000);
    expect(effectiveAmount(rows[1], { b: '0' })).toBe(0);
  });

  it('reads a blanked draft as unpriced', () => {
    expect(effectiveAmount(rows[0], { a: '' })).toBeNull();
  });

  it('holds the saved amount while the draft is mid-typing garbage', () => {
    // Keeps the "N of M priced" counter from flickering on a stray keystroke.
    expect(effectiveAmount(rows[0], { a: '-' })).toBe(9600);
  });
});

describe('dirtyStopIds', () => {
  it('is empty when nothing was typed', () => {
    expect(dirtyStopIds(rows, {})).toEqual([]);
  });

  it('ignores a draft that types the saved value back in', () => {
    expect(dirtyStopIds(rows, { a: '9600' })).toEqual([]);
    expect(dirtyStopIds(rows, { b: '' })).toEqual([]);
    expect(dirtyStopIds(rows, { c: '0' })).toEqual([]);
  });

  it('counts a real change', () => {
    expect(dirtyStopIds(rows, { a: '12000', b: '4400' }).sort()).toEqual(['a', 'b']);
  });

  it('counts clearing a priced stop', () => {
    expect(dirtyStopIds(rows, { a: '' })).toEqual(['a']);
  });

  it('counts an invalid entry as dirty so Save cannot silently drop it', () => {
    expect(dirtyStopIds(rows, { a: 'abc' })).toEqual(['a']);
  });

  it('ignores draft keys for stops that are not on screen', () => {
    expect(dirtyStopIds(rows, { zzz: '500' })).toEqual([]);
  });
});

describe('buildRatePayload', () => {
  it('sends ONLY the changed stops, not the whole sheet', () => {
    const out = buildRatePayload(rows, { a: '12000' });
    expect(out.invalid).toEqual([]);
    expect(out.rates).toEqual([{ stop_id: 'a', annual_amount: 12000 }]);
  });

  it('sends null for a cleared stop', () => {
    const out = buildRatePayload(rows, { a: '' });
    expect(out.rates).toEqual([{ stop_id: 'a', annual_amount: null }]);
  });

  it('reports invalid rows and sends nothing when any row is bad', () => {
    // All-or-nothing on the client mirrors the import route: a half-applied
    // price list is worse than a rejected one.
    const out = buildRatePayload(rows, { a: '12000', b: 'abc' });
    expect(out.rates).toEqual([]);
    expect(out.invalid).toEqual([{ stop_id: 'b', reason: 'not a number' }]);
  });

  it('is empty when the draft only restates saved values', () => {
    expect(buildRatePayload(rows, { a: '9600' }).rates).toEqual([]);
  });
});
