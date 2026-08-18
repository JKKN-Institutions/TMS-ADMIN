import { describe, it, expect } from 'vitest';
import { serviceDays, evaluateMonth, monthWindow, probationWindow } from './incharge-month';

describe('serviceDays', () => {
  it('keeps only weekdays inside the window that carried bookings', () => {
    // 2026-08-15 is a Saturday, 2026-08-16 a Sunday.
    expect(serviceDays(
      ['2026-08-13', '2026-08-14', '2026-08-15', '2026-08-16', '2026-08-17'],
      '2026-08-13', '2026-08-17',
    )).toEqual(['2026-08-13', '2026-08-14', '2026-08-17']);
  });

  it('excludes dates outside the window', () => {
    expect(serviceDays(
      ['2026-08-10', '2026-08-13', '2026-08-20'],
      '2026-08-12', '2026-08-18',
    )).toEqual(['2026-08-13']);
  });

  it('deduplicates repeated booking dates', () => {
    // tms_booking has one row per rider, so a 40-seat bus yields 40 rows
    // for the same date. Counting them as 40 service days would make the
    // denominator meaningless.
    expect(serviceDays(
      ['2026-08-13', '2026-08-13', '2026-08-13'],
      '2026-08-01', '2026-08-31',
    )).toEqual(['2026-08-13']);
  });

  it('returns a sorted list regardless of input order', () => {
    expect(serviceDays(
      ['2026-08-17', '2026-08-13', '2026-08-14'],
      '2026-08-01', '2026-08-31',
    )).toEqual(['2026-08-13', '2026-08-14', '2026-08-17']);
  });

  it('returns nothing when the route never ran', () => {
    expect(serviceDays([], '2026-08-01', '2026-08-31')).toEqual([]);
  });
});

describe('evaluateMonth', () => {
  it('passes when every service day was marked', () => {
    expect(evaluateMonth({
      serviceDays: ['2026-08-13', '2026-08-14'],
      markedDates: ['2026-08-13', '2026-08-14'],
    })).toEqual({ outcome: 'passed', requiredDays: 2, markedDays: 2, missedDates: [] });
  });

  it('fails on a single missed service day (zero-miss rule)', () => {
    expect(evaluateMonth({
      serviceDays: ['2026-08-13', '2026-08-14', '2026-08-17'],
      markedDates: ['2026-08-13', '2026-08-17'],
    })).toEqual({
      outcome: 'failed', requiredDays: 3, markedDays: 2, missedDates: ['2026-08-14'],
    });
  });

  it('ignores marks on days that were not service days', () => {
    // A mark on a Saturday is real work but cannot create credit that the
    // denominator does not contain, or markedDays would exceed requiredDays.
    expect(evaluateMonth({
      serviceDays: ['2026-08-13'],
      markedDates: ['2026-08-13', '2026-08-15'],
    })).toEqual({ outcome: 'passed', requiredDays: 1, markedDays: 1, missedDates: [] });
  });

  it('passes a route that never ran', () => {
    // No service days means no duty was possible, so there is nothing to
    // punish. Deliberate: the alternative bills someone for a bus that the
    // college did not run.
    expect(evaluateMonth({ serviceDays: [], markedDates: [] })).toEqual({
      outcome: 'passed', requiredDays: 0, markedDays: 0, missedDates: [],
    });
  });

  it('reports every missed date, in order', () => {
    const v = evaluateMonth({
      serviceDays: ['2026-08-13', '2026-08-14', '2026-08-17', '2026-08-18'],
      markedDates: ['2026-08-17'],
    });
    expect(v.missedDates).toEqual(['2026-08-13', '2026-08-14', '2026-08-18']);
    expect(v.outcome).toBe('failed');
  });
});

describe('monthWindow', () => {
  it('spans a 31-day month', () => {
    expect(monthWindow('2026-08-18')).toEqual({ start: '2026-08-01', end: '2026-08-31' });
  });

  it('spans a 30-day month', () => {
    expect(monthWindow('2026-09-05')).toEqual({ start: '2026-09-01', end: '2026-09-30' });
  });

  it('spans February in a non-leap year', () => {
    expect(monthWindow('2026-02-10')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
  });

  it('spans February in a leap year', () => {
    expect(monthWindow('2028-02-10')).toEqual({ start: '2028-02-01', end: '2028-02-29' });
  });
});

describe('probationWindow', () => {
  it('runs from the accept date to the end of that month', () => {
    expect(probationWindow('2026-08-18')).toEqual({ start: '2026-08-18', end: '2026-08-31' });
  });

  it('is a single day when accepted on the last day of the month', () => {
    expect(probationWindow('2026-08-31')).toEqual({ start: '2026-08-31', end: '2026-08-31' });
  });

  it('rejects a malformed date rather than guessing', () => {
    expect(() => probationWindow('18-08-2026')).toThrow();
  });
});
