import { describe, it, expect } from 'vitest';
import { isInServiceRegion, parseLocationChanges } from './locations';

const IDS = new Set(['a', 'b', 'c']);

describe('isInServiceRegion', () => {
  it('accepts places the fleet actually serves', () => {
    expect(isInServiceRegion(11.4444567, 77.730258)).toBe(true); // campus
    expect(isInServiceRegion(11.38267, 77.89601)).toBe(true); // Tiruchengode
    expect(isInServiceRegion(11.1085, 77.3411)).toBe(true); // Tiruppur
  });

  it('rejects the stored mistakes: Chennai, and non-numbers', () => {
    expect(isInServiceRegion(13.066849, 80.251308)).toBe(false); // "COLLEGE" in Chennai
    expect(isInServiceRegion(Number.NaN, 77.7)).toBe(false);
    expect(isInServiceRegion(0, 0)).toBe(false);
    expect(isInServiceRegion(95, 77.7)).toBe(false);
  });
});

describe('parseLocationChanges', () => {
  it('accepts placements and removals for stops on the route', () => {
    const r = parseLocationChanges(
      { set: [{ stopId: 'a', lat: 11.3826712345, lng: 77.8960123456 }], clear: ['b'] },
      IDS,
    );
    expect(r).toEqual({
      ok: true,
      value: { set: [{ stopId: 'a', lat: 11.382671, lng: 77.896012 }], clear: ['b'] },
    });
  });

  it('treats a missing list as empty', () => {
    const r = parseLocationChanges({ clear: ['c'] }, IDS);
    expect(r.ok && r.value).toEqual({ set: [], clear: ['c'] });
  });

  it('refuses an empty or malformed body', () => {
    expect(parseLocationChanges(null, IDS).ok).toBe(false);
    expect(parseLocationChanges({}, IDS).ok).toBe(false);
    expect(parseLocationChanges({ set: 'a' }, IDS).ok).toBe(false);
    expect(parseLocationChanges({ set: [], clear: [] }, IDS).ok).toBe(false);
  });

  it("refuses a stop that is not on this route", () => {
    expect(parseLocationChanges({ set: [{ stopId: 'zzz', lat: 11.4, lng: 77.8 }] }, IDS).ok).toBe(false);
    expect(parseLocationChanges({ clear: ['zzz'] }, IDS).ok).toBe(false);
    expect(parseLocationChanges({ set: [{ lat: 11.4, lng: 77.8 }] }, IDS).ok).toBe(false);
  });

  it('refuses a pin dropped far from campus, and says why', () => {
    const r = parseLocationChanges({ set: [{ stopId: 'a', lat: 13.066849, lng: 80.251308 }] }, IDS);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/km from campus/);
  });

  it('refuses coordinates sent as text', () => {
    expect(parseLocationChanges({ set: [{ stopId: 'a', lat: '11.4', lng: '77.8' }] }, IDS).ok).toBe(false);
  });

  it('refuses the same stop twice, including set + clear together', () => {
    const p = { stopId: 'a', lat: 11.4, lng: 77.8 };
    expect(parseLocationChanges({ set: [p, p] }, IDS).ok).toBe(false);
    expect(parseLocationChanges({ set: [p], clear: ['a'] }, IDS).ok).toBe(false);
    expect(parseLocationChanges({ clear: ['b', 'b'] }, IDS).ok).toBe(false);
  });
});
