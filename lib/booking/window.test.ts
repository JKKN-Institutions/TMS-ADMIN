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
  it('is 20:00 IST on the prior day (== 14:30 UTC)', () => {
    expect(cutoffFor('2026-06-22').toISOString()).toBe('2026-06-21T14:30:00.000Z');
  });
});

describe('bookableDates', () => {
  it('returns this week Tue..Sat when today is Monday (IST)', () => {
    // 2026-06-22 is a Monday; the service week closes on Saturday 2026-06-27
    const dates = bookableDates(new Date('2026-06-22T03:00:00Z')); // istToday == 2026-06-22
    expect(dates).toEqual(['2026-06-23', '2026-06-24', '2026-06-25', '2026-06-26', '2026-06-27']);
  });
  it('rolls to next week once today is Saturday', () => {
    // 2026-06-27 is a Saturday — nothing bookable left this week, so open Sun..next Sat
    const dates = bookableDates(new Date('2026-06-27T03:00:00Z')); // istToday == 2026-06-27
    expect(dates[0]).toBe('2026-06-28');                 // the (non-bookable) Sunday
    expect(dates[dates.length - 1]).toBe('2026-07-04');  // next Saturday closes the window
  });
  it('shows the coming week on Sunday (no service today)', () => {
    // 2026-06-28 is a Sunday; the window is the next Mon..Sat
    const dates = bookableDates(new Date('2026-06-28T03:00:00Z')); // istToday == 2026-06-28
    expect(dates).toEqual(['2026-06-29', '2026-06-30', '2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04']);
  });
});

describe('isBookingOpen', () => {
  it('is open just before the cutoff', () => {
    expect(isBookingOpen('2026-06-22', new Date('2026-06-21T14:29:00Z'))).toBe(true);
  });
  it('is closed just after the cutoff', () => {
    expect(isBookingOpen('2026-06-22', new Date('2026-06-21T14:31:00Z'))).toBe(false);
  });
  it('opens next week from Saturday (Monday reservable across the weekend)', () => {
    // 2026-06-20 is a Saturday; 2026-06-22 is the coming Monday, before its Sun-20:00 cutoff
    expect(isBookingOpen('2026-06-22', new Date('2026-06-20T06:00:00Z'))).toBe(true);
  });
  it('rejects a date beyond the current week window', () => {
    // From Saturday 2026-06-20 the window is Sun..Sat 06-27; 06-29 (next Monday) is out
    expect(isBookingOpen('2026-06-29', new Date('2026-06-20T06:00:00Z'))).toBe(false);
  });
  it('rejects today and past dates', () => {
    expect(isBookingOpen('2026-06-20', new Date('2026-06-20T06:00:00Z'))).toBe(false);
  });
  it('rejects a Sunday even when it is otherwise within the open window', () => {
    // 2026-06-27 is a Saturday → window 06-28..07-04, so the Sunday 06-28 is inside the
    // window yet still blocked by the weekly-holiday rule.
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
  it('still allows cancelling a Sunday (legacy bookings) within the window', () => {
    // booking is blocked on Sundays, but a pre-existing one must remain cancelable.
    // 2026-06-27 is a Saturday → window 06-28..07-04 includes the Sunday 06-28.
    expect(isBookingOpen('2026-06-28', new Date('2026-06-27T06:00:00Z'))).toBe(false);
    expect(isCancelable('2026-06-28', new Date('2026-06-27T06:00:00Z'))).toBe(true);
  });
});

describe('dayStatus', () => {
  const before = new Date('2026-06-21T14:29:00Z'); // before 2026-06-22 cutoff
  const after = new Date('2026-06-21T14:31:00Z');  // after  2026-06-22 cutoff
  it('booked + open => booked', () => expect(dayStatus(true, '2026-06-22', before)).toBe('booked'));
  it('booked + closed => locked', () => expect(dayStatus(true, '2026-06-22', after)).toBe('locked'));
  it('no booking + open => not_booked', () => expect(dayStatus(false, '2026-06-22', before)).toBe('not_booked'));
  it('no booking + closed => closed', () => expect(dayStatus(false, '2026-06-22', after)).toBe('closed'));
});
