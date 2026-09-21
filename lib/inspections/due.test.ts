import { describe, it, expect } from 'vitest';
import { parseIntervalDays, addDays, daysBetween, dueInfo } from './due';

describe('parseIntervalDays', () => {
  it('reads interval_days', () => expect(parseIntervalDays({ interval_days: 14 })).toBe(14));
  it('defaults to 30 on missing/invalid', () => {
    expect(parseIntervalDays(null)).toBe(30);
    expect(parseIntervalDays({ interval_days: 'x' })).toBe(30);
    expect(parseIntervalDays({ interval_days: 0 })).toBe(30);
    expect(parseIntervalDays({ interval_days: 999 })).toBe(30);
  });
});

describe('date helpers', () => {
  it('addDays crosses month ends', () => expect(addDays('2026-09-25', 10)).toBe('2026-10-05'));
  it('daysBetween', () => expect(daysBetween('2026-09-21', '2026-10-01')).toBe(10));
});

describe('dueInfo', () => {
  const today = '2026-09-21';
  it('never inspected', () => expect(dueInfo(null, 30, today)).toEqual({ state: 'never', dueOn: null, daysLeft: null }));
  it('ok when more than 7 days left', () => expect(dueInfo('2026-09-10', 30, today)).toEqual({ state: 'ok', dueOn: '2026-10-10', daysLeft: 19 }));
  it('due_soon within 7 days', () => expect(dueInfo('2026-08-25', 30, today)).toEqual({ state: 'due_soon', dueOn: '2026-09-24', daysLeft: 3 }));
  it('due_soon on the due day itself', () => expect(dueInfo('2026-08-22', 30, today).state).toBe('due_soon'));
  it('overdue after the due day', () => expect(dueInfo('2026-08-01', 30, today)).toEqual({ state: 'overdue', dueOn: '2026-08-31', daysLeft: -21 }));
});
