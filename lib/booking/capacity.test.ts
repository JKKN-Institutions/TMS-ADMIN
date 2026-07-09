import { describe, it, expect } from 'vitest';
import { isOverCapacity } from './capacity';

describe('isOverCapacity', () => {
  it('is false when booked is below capacity', () => {
    expect(isOverCapacity(59, 60)).toBe(false);
  });
  it('is true when booked equals capacity (the next seat overflows)', () => {
    expect(isOverCapacity(60, 60)).toBe(true);
  });
  it('is true when booked exceeds capacity', () => {
    expect(isOverCapacity(61, 60)).toBe(true);
  });
  it('treats capacity 0 / unknown as no limit (never over capacity)', () => {
    expect(isOverCapacity(100, 0)).toBe(false);
  });
  it('treats negative capacity as no limit', () => {
    expect(isOverCapacity(5, -1)).toBe(false);
  });
});
