import { describe, it, expect } from 'vitest';
import { summarizeMonth, monthDays, isMonthKey } from './month-summary';

const row = (tripDate: string, direction: string, status: string, method: string | null = 'manual') =>
  ({ tripDate, direction, status, method });

describe('summarizeMonth', () => {
  it('counts a day with both trips as ONE day present and one both-trip day', () => {
    const s = summarizeMonth([
      row('2026-10-01', 'onward', 'present'),
      row('2026-10-01', 'return', 'present'),
      row('2026-10-02', 'onward', 'present', 'id_card'),
    ]);
    expect(s.daysPresent).toBe(2);
    expect(s.onwardPresent).toBe(2);
    expect(s.returnPresent).toBe(1);
    expect(s.bothTripDays).toBe(1);
  });

  it('keeps auto absences apart from staff absences', () => {
    const s = summarizeMonth([
      row('2026-10-03', 'onward', 'absent', 'auto'),
      row('2026-10-03', 'return', 'absent', 'manual'),
      row('2026-10-04', 'onward', 'absent', 'auto'),
    ]);
    expect(s.autoAbsent).toBe(2);
    expect(s.staffAbsent).toBe(1);
    expect(s.daysPresent).toBe(0);
  });

  it('an empty month is all zeros', () => {
    expect(summarizeMonth([])).toEqual({
      daysPresent: 0, onwardPresent: 0, returnPresent: 0, bothTripDays: 0, staffAbsent: 0, autoAbsent: 0,
    });
  });
});

describe('monthDays / isMonthKey', () => {
  it('lists every date of the month', () => {
    expect(monthDays('2026-02')).toHaveLength(28);
    expect(monthDays('2028-02')).toHaveLength(29);
    expect(monthDays('2026-10')[0]).toBe('2026-10-01');
    expect(monthDays('2026-10').at(-1)).toBe('2026-10-31');
  });

  it('validates YYYY-MM', () => {
    expect(isMonthKey('2026-10')).toBe(true);
    expect(isMonthKey('2026-13')).toBe(false);
    expect(isMonthKey('2026-1')).toBe(false);
    expect(isMonthKey(null)).toBe(false);
  });
});
