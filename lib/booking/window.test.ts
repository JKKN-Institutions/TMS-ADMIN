import { describe, it, expect } from 'vitest';
import {
  istToday,
  addDays,
  cutoffFor,
  sameDayCutoffFor,
  deadlineFor,
  bookableDates,
  horizonDates,
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

// Reference dates used below (all IST):
//   2026-06-22 Mon, 06-23 Tue, 06-24 Wed, 06-25 Thu, 06-26 Fri,
//   2026-06-27 Sat, 06-28 Sun, 06-29 Mon
describe('bookableDates', () => {
  it('defaults to the SINGLE next working day', () => {
    expect(bookableDates(new Date('2026-06-22T03:00:00Z'))).toEqual(['2026-06-23']);
  });

  it('skips a Sunday to reach Monday', () => {
    // Saturday 2026-06-27, 06:00 IST -> Sunday 28th is skipped
    expect(bookableDates(new Date('2026-06-27T00:30:00Z'))).toEqual(['2026-06-29']);
  });

  it('skips a service-calendar off Saturday and lands on Monday', () => {
    // Friday 2026-06-26 morning, Saturday marked off
    const offDates = new Set(['2026-06-27']);
    expect(bookableDates(new Date('2026-06-26T03:00:00Z'), { offDates })).toEqual(['2026-06-29']);
  });

  it('returns a WORKING Saturday from Friday', () => {
    expect(bookableDates(new Date('2026-06-26T03:00:00Z'))).toEqual(['2026-06-27']);
  });

  it('advances past a day whose cutoff has already passed', () => {
    // Monday 2026-06-22 20:01 IST == 14:31 UTC. Tuesday's 20:00 cutoff has passed,
    // so the window moves to Wednesday instead of leaving a nightly dead zone.
    expect(bookableDates(new Date('2026-06-22T14:31:00Z'))).toEqual(['2026-06-24']);
  });

  it('counts WORKING days, not calendar days', () => {
    // Friday 2026-06-26, 3 working days ahead: Sat 27, (Sun 28 skipped), Mon 29, Tue 30
    expect(bookableDates(new Date('2026-06-26T03:00:00Z'), { daysAhead: 3 })).toEqual([
      '2026-06-27', '2026-06-29', '2026-06-30',
    ]);
  });

  it('returns [] when the 21-day cap is exhausted by a long holiday block', () => {
    const now = new Date('2026-06-22T03:00:00Z');
    const offDates = new Set<string>();
    for (let i = 1; i <= 21; i++) {
      offDates.add(addDays(istToday(now), i));
    }
    expect(bookableDates(now, { offDates })).toEqual([]);
  });

  it('honors a configured cutoff hour', () => {
    // 13:31 UTC == 19:01 IST; with cutoffHour 19, tomorrow has closed
    expect(bookableDates(new Date('2026-06-22T13:31:00Z'), { cutoffHour: 19 })).toEqual(['2026-06-24']);
  });
});

describe('horizonDates', () => {
  it('matches bookableDates when no cutoff has passed', () => {
    const now = new Date('2026-06-22T03:00:00Z');
    expect(horizonDates(now)).toEqual(bookableDates(now));
  });

  it('keeps a cutoff-passed day that bookableDates drops', () => {
    // Monday 20:01 IST: Tuesday is still the labelled horizon day (renders
    // 'closed'), while bookableDates has already advanced to Wednesday.
    const now = new Date('2026-06-22T14:31:00Z');
    expect(horizonDates(now)).toEqual(['2026-06-23']);
    expect(bookableDates(now)).toEqual(['2026-06-24']);
  });

  it('still skips Sundays and off days', () => {
    expect(horizonDates(new Date('2026-06-27T00:30:00Z'))).toEqual(['2026-06-29']);
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

describe('isBookingOpen', () => {
  it('is open just before the default cutoff', () => {
    expect(isBookingOpen('2026-06-23', new Date('2026-06-22T14:29:00Z'))).toBe(true);
  });
  it('is closed just after the default cutoff', () => {
    expect(isBookingOpen('2026-06-23', new Date('2026-06-22T14:31:00Z'))).toBe(false);
  });
  it('rejects a date beyond the single-working-day horizon', () => {
    expect(isBookingOpen('2026-06-24', new Date('2026-06-22T03:00:00Z'))).toBe(false);
  });
  it('rejects today and past dates', () => {
    expect(isBookingOpen('2026-06-22', new Date('2026-06-22T06:00:00Z'))).toBe(false);
  });
  it('rejects a Sunday', () => {
    expect(isBookingOpen('2026-06-28', new Date('2026-06-27T00:30:00Z'))).toBe(false);
  });
  it('rejects a service-calendar off day', () => {
    expect(
      isBookingOpen('2026-06-27', new Date('2026-06-26T03:00:00Z'), { offDates: new Set(['2026-06-27']) })
    ).toBe(false);
  });
});

describe('isCancelable', () => {
  it('mirrors the cutoff for the next working day', () => {
    expect(isCancelable('2026-06-23', new Date('2026-06-22T14:29:00Z'))).toBe(true);
    expect(isCancelable('2026-06-23', new Date('2026-06-22T14:31:00Z'))).toBe(false);
  });

  it('still allows cancelling a Sunday booking before its cutoff', () => {
    expect(isCancelable('2026-06-28', new Date('2026-06-27T00:30:00Z'))).toBe(true);
  });

  // Regression: shrinking the horizon to one working day must NOT strand the
  // forward bookings learners already hold (seats exist through 2026-10-08).
  it('allows cancelling a booking far OUTSIDE the booking horizon', () => {
    const now = new Date('2026-06-22T03:00:00Z');
    expect(isBookingOpen('2026-07-15', now)).toBe(false); // not bookable
    expect(isCancelable('2026-07-15', now)).toBe(true);   // but still releasable
  });

  it('rejects a past date and today', () => {
    expect(isCancelable('2026-06-21', new Date('2026-06-22T03:00:00Z'))).toBe(false);
    expect(isCancelable('2026-06-22', new Date('2026-06-22T03:00:00Z'))).toBe(false);
  });
});

describe('dayStatus', () => {
  const before = new Date('2026-06-22T14:29:00Z');
  const after = new Date('2026-06-22T14:31:00Z');
  it('booked + open => booked', () => expect(dayStatus(true, '2026-06-23', before)).toBe('booked'));
  it('booked + closed => locked', () => expect(dayStatus(true, '2026-06-23', after)).toBe('locked'));
  it('no booking + open => not_booked', () => expect(dayStatus(false, '2026-06-23', before)).toBe('not_booked'));
  it('no booking + closed => closed', () => expect(dayStatus(false, '2026-06-23', after)).toBe('closed'));
});

// ─────────────────────────────────────────────────────────────────────────────
// Same-day booking (opt-in). Reference: 2026-06-22 is a Monday.
// ─────────────────────────────────────────────────────────────────────────────
describe('sameDayCutoffFor', () => {
  it('lands on the given hour IST of the travel date ITSELF', () => {
    // 06:00 IST on 2026-06-22 == 00:30 UTC the same day
    expect(sameDayCutoffFor('2026-06-22', 6).toISOString()).toBe('2026-06-22T00:30:00.000Z');
  });
  it('defaults to 06:00 IST', () => {
    expect(sameDayCutoffFor('2026-06-22').toISOString()).toBe('2026-06-22T00:30:00.000Z');
  });
  it('treats hour 24 as the end of the travel day (open all day)', () => {
    // 24:00 IST on the 22nd == 18:30 UTC on the 22nd
    expect(sameDayCutoffFor('2026-06-22', 24).toISOString()).toBe('2026-06-22T18:30:00.000Z');
  });
  it('is strictly later than the prior-day cutoff for the same date', () => {
    expect(sameDayCutoffFor('2026-06-22', 6).getTime()).toBeGreaterThan(cutoffFor('2026-06-22', 20).getTime());
  });
});

describe('deadlineFor', () => {
  const now = new Date('2026-06-22T00:00:00Z'); // 05:30 IST Mon 22nd

  it('uses the prior-day cutoff for a future date', () => {
    expect(deadlineFor('2026-06-23', now).toISOString()).toBe(cutoffFor('2026-06-23', 20).toISOString());
  });

  it('uses the prior-day cutoff for TODAY when same-day is off', () => {
    expect(deadlineFor('2026-06-22', now).toISOString()).toBe(cutoffFor('2026-06-22', 20).toISOString());
  });

  it('uses the same-day cutoff for TODAY when same-day is on', () => {
    expect(deadlineFor('2026-06-22', now, { allowSameDay: true, sameDayCutoffHour: 6 }).toISOString())
      .toBe('2026-06-22T00:30:00.000Z');
  });

  it('does NOT apply the same-day cutoff to tomorrow', () => {
    expect(deadlineFor('2026-06-23', now, { allowSameDay: true, sameDayCutoffHour: 6 }).toISOString())
      .toBe(cutoffFor('2026-06-23', 20).toISOString());
  });
});

describe('bookableDates with same-day enabled', () => {
  const sameDay = { allowSameDay: true, sameDayCutoffHour: 6 };

  it('is unchanged when the flag is off (default)', () => {
    expect(bookableDates(new Date('2026-06-22T00:00:00Z'))).toEqual(['2026-06-23']);
  });

  it('offers TODAY as well as tomorrow before the same-day cutoff', () => {
    // Mon 2026-06-22, 05:30 IST — before the 06:00 same-day cutoff
    expect(bookableDates(new Date('2026-06-22T00:00:00Z'), sameDay)).toEqual([
      '2026-06-22', '2026-06-23',
    ]);
  });

  it('drops TODAY once the same-day cutoff passes, keeping tomorrow', () => {
    // Mon 2026-06-22, 10:33 IST — the screenshot's moment
    expect(bookableDates(new Date('2026-06-22T05:03:00Z'), sameDay)).toEqual(['2026-06-23']);
  });

  // Regression: same-day must be ADDITIVE. If today consumed the single
  // daysAhead slot, switching the feature on would silently REMOVE tomorrow
  // from every learner's window — a worse outage than the feature is a win.
  it('does not consume a daysAhead slot', () => {
    const now = new Date('2026-06-22T00:00:00Z');
    expect(bookableDates(now, { ...sameDay, daysAhead: 1 })).toHaveLength(2);
    expect(bookableDates(now, { ...sameDay, daysAhead: 2 })).toEqual([
      '2026-06-22', '2026-06-23', '2026-06-24',
    ]);
  });

  it('never offers today when today is a Sunday', () => {
    // Sunday 2026-06-28, 05:30 IST
    expect(bookableDates(new Date('2026-06-28T00:00:00Z'), sameDay)).toEqual(['2026-06-29']);
  });

  it('never offers today when today is a service-calendar off day', () => {
    const opts = { ...sameDay, offDates: new Set(['2026-06-22']) };
    expect(bookableDates(new Date('2026-06-22T00:00:00Z'), opts)).toEqual(['2026-06-23']);
  });

  it('honors a later same-day cutoff hour', () => {
    // 10:33 IST with an 11:00 same-day cutoff — today is still open
    expect(
      bookableDates(new Date('2026-06-22T05:03:00Z'), { allowSameDay: true, sameDayCutoffHour: 11 })
    ).toEqual(['2026-06-22', '2026-06-23']);
  });

  it('stays open all day when the same-day hour is the 24 sentinel', () => {
    // 23:00 IST == 17:30 UTC
    expect(
      bookableDates(new Date('2026-06-22T17:30:00Z'), { allowSameDay: true, sameDayCutoffHour: 24 })
    ).toContain('2026-06-22');
  });
});

describe('horizonDates with same-day enabled', () => {
  it('keeps today after its cutoff so the cell reads closed, not out_of_horizon', () => {
    const now = new Date('2026-06-22T05:03:00Z'); // 10:33 IST, past the 06:00 cutoff
    const opts = { allowSameDay: true, sameDayCutoffHour: 6 };
    expect(horizonDates(now, opts)).toContain('2026-06-22');
    expect(bookableDates(now, opts)).not.toContain('2026-06-22');
  });
});

describe('isBookingOpen / isCancelable with same-day enabled', () => {
  const sameDay = { allowSameDay: true, sameDayCutoffHour: 6 };

  it('opens today before the same-day cutoff', () => {
    expect(isBookingOpen('2026-06-22', new Date('2026-06-22T00:00:00Z'), sameDay)).toBe(true);
  });

  it('closes today after the same-day cutoff', () => {
    expect(isBookingOpen('2026-06-22', new Date('2026-06-22T05:03:00Z'), sameDay)).toBe(false);
  });

  // A seat you can book must be a seat you can release.
  it('allows cancelling today before the same-day cutoff', () => {
    expect(isCancelable('2026-06-22', new Date('2026-06-22T00:00:00Z'), sameDay)).toBe(true);
  });

  it('rejects cancelling today after the same-day cutoff', () => {
    expect(isCancelable('2026-06-22', new Date('2026-06-22T05:03:00Z'), sameDay)).toBe(false);
  });

  it('still rejects cancelling today when same-day is off', () => {
    expect(isCancelable('2026-06-22', new Date('2026-06-22T00:00:00Z'))).toBe(false);
  });

  it('still rejects a past date even with same-day on', () => {
    expect(isCancelable('2026-06-21', new Date('2026-06-22T00:00:00Z'), sameDay)).toBe(false);
  });
});
