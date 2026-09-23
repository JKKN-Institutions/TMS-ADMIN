import { describe, it, expect } from 'vitest';
import { feeMark, bookingMark, countableFeeState } from './marks';

describe('feeMark', () => {
  it.each([
    [{ known: false, paid: false, overridden: false, hasBill: true }, 'unknown'],
    [{ known: true, paid: false, overridden: true, hasBill: true }, 'override'],
    [{ known: true, paid: true, overridden: false, hasBill: true }, 'paid'],
    [{ known: true, paid: false, overridden: false, hasBill: false }, 'none'],
    [{ known: true, paid: false, overridden: false, hasBill: true }, 'unpaid'],
  ] as const)('%o → %s', (i, want) => expect(feeMark(i)).toBe(want));
});

describe('bookingMark', () => {
  it('this route wins, then other route, else none', () => {
    expect(bookingMark(['R1', 'R2'], 'R1')).toBe('this_route');
    expect(bookingMark(['R2'], 'R1')).toBe('other_route');
    expect(bookingMark([], 'R1')).toBe('none');
  });
});

describe('countableFeeState', () => {
  it('counts override as paid', () => expect(countableFeeState('override')).toBe('paid'));
});
