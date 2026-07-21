import { describe, it, expect } from 'vitest';
import { splitAnnual, validateShares } from './stop-rate';

describe('splitAnnual', () => {
  it('splits evenly when the maths is clean', () => {
    expect(splitAnnual(9900, [50, 50])).toEqual([4950, 4950]);
  });

  it('puts the rounding remainder on the LAST term so the total is exact', () => {
    // 9999 at 50/50 is 4999.5 each. Naive rounding gives 5000+5000 = 10000,
    // over-charging by 1 rupee — a balance nobody can ever clear.
    const terms = splitAnnual(9999, [50, 50]);
    expect(terms).toEqual([5000, 4999]);
    expect(terms.reduce((a, b) => a + b, 0)).toBe(9999);
  });

  it('handles uneven shares', () => {
    expect(splitAnnual(10000, [60, 40])).toEqual([6000, 4000]);
  });

  it('handles three-way shares that do not divide cleanly', () => {
    const terms = splitAnnual(10000, [33.33, 33.33, 33.34]);
    expect(terms).toEqual([3333, 3333, 3334]);
    expect(terms.reduce((a, b) => a + b, 0)).toBe(10000);
  });

  it('returns the whole amount for a single 100% term', () => {
    expect(splitAnnual(18400, [100])).toEqual([18400]);
  });

  it('handles a zero annual amount', () => {
    expect(splitAnnual(0, [50, 50])).toEqual([0, 0]);
  });

  it('throws on an empty share list rather than silently billing nothing', () => {
    expect(() => splitAnnual(1000, [])).toThrow(/at least one term/i);
  });
});

describe('validateShares', () => {
  it('accepts shares summing to exactly 100', () => {
    expect(validateShares([50, 50])).toBeNull();
    expect(validateShares([33.33, 33.33, 33.34])).toBeNull();
  });

  it('rejects shares that do not sum to 100', () => {
    expect(validateShares([50, 40])).toMatch(/must sum to 100/i);
  });

  it('rejects an empty schedule', () => {
    expect(validateShares([])).toMatch(/at least one term/i);
  });

  it('rejects a non-positive share', () => {
    expect(validateShares([100, 0])).toMatch(/greater than 0/i);
  });
});
