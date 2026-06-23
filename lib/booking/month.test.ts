import { describe, it, expect } from 'vitest';
import { monthGrid, addMonth, istMonth } from './month';
import { monthDays } from './calendar';

describe('monthGrid', () => {
  it('lays a month into whole weeks of 7, in order', () => {
    const weeks = monthGrid('2026-06');
    for (const w of weeks) expect(w).toHaveLength(7);
    expect(weeks.flat().filter(Boolean)).toEqual(monthDays('2026-06'));
  });
  it('pads only with nulls before day 1', () => {
    const weeks = monthGrid('2026-06');
    const flat = weeks.flat();
    const firstIdx = flat.indexOf('2026-06-01');
    expect(flat.slice(0, firstIdx).every((c) => c === null)).toBe(true);
  });
});

describe('addMonth', () => {
  it('rolls forward over a year boundary', () => expect(addMonth('2026-12', 1)).toBe('2027-01'));
  it('rolls backward over a year boundary', () => expect(addMonth('2026-01', -1)).toBe('2025-12'));
});

describe('istMonth', () => {
  it('uses the IST calendar month', () => {
    // 2026-06-30T20:00Z == 2026-07-01T01:30 IST
    expect(istMonth(new Date('2026-06-30T20:00:00Z'))).toBe('2026-07');
  });
});
