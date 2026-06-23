import { describe, it, expect } from 'vitest';
import {
  istToday,
  addDays,
  cutoffFor,
  bookableDates,
  isBookingOpen,
  isCancelable,
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
  it('is 18:00 IST on the prior day (== 12:30 UTC)', () => {
    expect(cutoffFor('2026-06-22').toISOString()).toBe('2026-06-21T12:30:00.000Z');
  });
});

describe('bookableDates', () => {
  it('returns tomorrow..+6 in IST', () => {
    // istToday == 2026-06-20
    const dates = bookableDates(new Date('2026-06-20T06:00:00Z'));
    expect(dates).toEqual([
      '2026-06-21', '2026-06-22', '2026-06-23', '2026-06-24',
      '2026-06-25', '2026-06-26', '2026-06-27',
    ]);
  });
});

describe('isBookingOpen', () => {
  it('is open just before the cutoff', () => {
    expect(isBookingOpen('2026-06-22', new Date('2026-06-21T12:29:00Z'))).toBe(true);
  });
  it('is closed just after the cutoff', () => {
    expect(isBookingOpen('2026-06-22', new Date('2026-06-21T12:31:00Z'))).toBe(false);
  });
  it('rejects a date beyond the 7-day horizon', () => {
    expect(isBookingOpen('2026-06-28', new Date('2026-06-20T06:00:00Z'))).toBe(false);
  });
  it('rejects today and past dates', () => {
    expect(isBookingOpen('2026-06-20', new Date('2026-06-20T06:00:00Z'))).toBe(false);
  });
});

describe('isCancelable', () => {
  it('mirrors isBookingOpen', () => {
    expect(isCancelable('2026-06-22', new Date('2026-06-21T12:29:00Z'))).toBe(true);
    expect(isCancelable('2026-06-22', new Date('2026-06-21T12:31:00Z'))).toBe(false);
  });
});

describe('dayStatus', () => {
  const before = new Date('2026-06-21T12:29:00Z'); // before 2026-06-22 cutoff
  const after = new Date('2026-06-21T12:31:00Z');  // after  2026-06-22 cutoff
  it('booked + open => booked', () => expect(dayStatus(true, '2026-06-22', before)).toBe('booked'));
  it('booked + closed => locked', () => expect(dayStatus(true, '2026-06-22', after)).toBe('locked'));
  it('no booking + open => not_booked', () => expect(dayStatus(false, '2026-06-22', before)).toBe('not_booked'));
  it('no booking + closed => closed', () => expect(dayStatus(false, '2026-06-22', after)).toBe('closed'));
});
