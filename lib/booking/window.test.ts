import { describe, it, expect } from 'vitest';
import {
  istToday,
  addDays,
  cutoffFor,
  bookableDates,
  isBookingOpen,
  isCancelable,
  isSunday,
  dayStatus,
} from './window';

describe('istToday', () => {
  it('rolls to the next IST day late in UTC evening', () => {
    // 2026-06-20T20:00Z == 2026-06-21T01:30 IST
    expect(istToday(new Date('2026-06-20T20:00:00Z'))).toBe('2026-06-21');
  });
  it('stays on the same IST day mid-morning UTC', () => {
    expect(istToday(new Date('2026-06-20T06:00:00Z'))).toBe('2026-06-20');
  });
});

describe('addDays', () => {
  it('rolls over a month boundary', () => {
    expect(addDays('2026-06-30', 1)).toBe('2026-07-01');
  });
  it('adds within a month', () => {
    expect(addDays('2026-06-20', 7)).toBe('2026-06-27');
  });
});

describe('cutoffFor', () => {
  it('defaults to 20:00 IST on the prior day (== 14:30 UTC)', () => {
    expect(cutoffFor('2026-06-22').toISOString()).toBe('2026-06-21T14:30:00.000Z');
  });
  it('honors a configured cutoff hour (19:00 IST == 13:30 UTC prior day)', () => {
    expect(cutoffFor('2026-06-22', 19).toISOString()).toBe('2026-06-21T13:30:00.000Z');
  });
});

describe('bookableDates', () => {
  it('defaults to the next 6 days ahead (tomorrow inclusive)', () => {
    // 2026-06-22 is a Monday (IST)
    const dates = bookableDates(new Date('2026-06-22T03:00:00Z'));
    expect(dates).toEqual([
      '2026-06-23', '2026-06-24', '2026-06-25', '2026-06-26', '2026-06-27', '2026-06-28',
    ]);
  });
  it('honors a shorter horizon (daysAhead = 1 => tomorrow only)', () => {
    const dates = bookableDates(new Date('2026-06-22T03:00:00Z'), 1);
    expect(dates).toEqual(['2026-06-23']);
  });
  it('keeps a Sunday in the list (booking gate blocks it separately)', () => {
    const dates = bookableDates(new Date('2026-06-22T03:00:00Z'), 6);
    expect(dates).toContain('2026-06-28'); // Sunday, present but non-bookable
  });
});

describe('isBookingOpen', () => {
  it('is open just before the default cutoff', () => {
    expect(isBookingOpen('2026-06-22', new Date('2026-06-21T14:29:00Z'))).toBe(true);
  });
  it('is closed just after the default cutoff', () => {
    expect(isBookingOpen('2026-06-22', new Date('2026-06-21T14:31:00Z'))).toBe(false);
  });
  it('respects a configured earlier cutoff (19:00 IST)', () => {
    // 13:29 UTC prior day = 18:59 IST => open; 13:31 UTC = 19:01 IST => closed
    expect(isBookingOpen('2026-06-22', new Date('2026-06-21T13:29:00Z'), { cutoffHour: 19 })).toBe(true);
    expect(isBookingOpen('2026-06-22', new Date('2026-06-21T13:31:00Z'), { cutoffHour: 19 })).toBe(false);
  });
  it('respects a configured horizon (date beyond daysAhead is closed)', () => {
    // From Monday 2026-06-22, daysAhead=1 makes only 2026-06-23 open
    expect(isBookingOpen('2026-06-24', new Date('2026-06-22T03:00:00Z'), { daysAhead: 1 })).toBe(false);
    expect(isBookingOpen('2026-06-23', new Date('2026-06-22T03:00:00Z'), { daysAhead: 1 })).toBe(true);
  });
  it('rejects today and past dates', () => {
    expect(isBookingOpen('2026-06-22', new Date('2026-06-22T06:00:00Z'))).toBe(false);
  });
  it('rejects a Sunday inside the window', () => {
    expect(isBookingOpen('2026-06-28', new Date('2026-06-27T06:00:00Z'))).toBe(false);
  });
});

describe('isSunday', () => {
  it('detects Sundays', () => {
    expect(isSunday('2026-06-28')).toBe(true); // Sunday
    expect(isSunday('2026-06-21')).toBe(true); // Sunday
  });
  it('returns false for other weekdays', () => {
    expect(isSunday('2026-06-29')).toBe(false); // Monday
    expect(isSunday('2026-06-27')).toBe(false); // Saturday
  });
});

describe('isCancelable', () => {
  it('mirrors the booking window on weekdays', () => {
    expect(isCancelable('2026-06-22', new Date('2026-06-21T14:29:00Z'))).toBe(true);
    expect(isCancelable('2026-06-22', new Date('2026-06-21T14:31:00Z'))).toBe(false);
  });
  it('still allows cancelling a Sunday within the window', () => {
    expect(isBookingOpen('2026-06-28', new Date('2026-06-27T06:00:00Z'))).toBe(false);
    expect(isCancelable('2026-06-28', new Date('2026-06-27T06:00:00Z'))).toBe(true);
  });
});

describe('dayStatus', () => {
  const before = new Date('2026-06-21T14:29:00Z');
  const after = new Date('2026-06-21T14:31:00Z');
  it('booked + open => booked', () => expect(dayStatus(true, '2026-06-22', before)).toBe('booked'));
  it('booked + closed => locked', () => expect(dayStatus(true, '2026-06-22', after)).toBe('locked'));
  it('no booking + open => not_booked', () => expect(dayStatus(false, '2026-06-22', before)).toBe('not_booked'));
  it('no booking + closed => closed', () => expect(dayStatus(false, '2026-06-22', after)).toBe('closed'));
});
