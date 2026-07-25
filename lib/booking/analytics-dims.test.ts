// lib/booking/analytics-dims.test.ts
import { describe, it, expect } from 'vitest';
import {
  daysBetween, istDateOf, leadTimeBucket, leadDays, weekdayOf, bookedByLabel, pct,
  LEAD_BUCKETS, WEEKDAY_LABELS,
} from './analytics-dims';

describe('daysBetween', () => {
  it('counts whole days forward and backward across a month boundary', () => {
    expect(daysBetween('2026-07-01', '2026-07-10')).toBe(9);
    expect(daysBetween('2026-06-28', '2026-07-01')).toBe(3);
    expect(daysBetween('2026-07-10', '2026-07-01')).toBe(-9);
    expect(daysBetween('2026-07-05', '2026-07-05')).toBe(0);
  });
});

describe('istDateOf', () => {
  it('rolls a late-evening UTC instant into the next IST day', () => {
    // 19:00 UTC on 2026-07-09 is 00:30 IST on 2026-07-10.
    expect(istDateOf('2026-07-09T19:00:00Z')).toBe('2026-07-10');
    expect(istDateOf('2026-07-09T10:00:00Z')).toBe('2026-07-09');
  });
});

describe('leadTimeBucket', () => {
  it('buckets each boundary value', () => {
    expect(leadTimeBucket(0)).toBe('same_day');
    expect(leadTimeBucket(1)).toBe('d1');
    expect(leadTimeBucket(2)).toBe('d2_3');
    expect(leadTimeBucket(3)).toBe('d2_3');
    expect(leadTimeBucket(4)).toBe('d4_7');
    expect(leadTimeBucket(7)).toBe('d4_7');
    expect(leadTimeBucket(8)).toBe('d8_plus');
  });

  it('clamps a negative lead time into same_day', () => {
    expect(leadTimeBucket(-3)).toBe('same_day');
  });

  it('exposes every bucket key exactly once, in ascending order', () => {
    expect(LEAD_BUCKETS.map((b) => b.key)).toEqual(['same_day', 'd1', 'd2_3', 'd4_7', 'd8_plus']);
  });
});

describe('leadDays', () => {
  it('measures from the IST date of booked_at to the travel date', () => {
    expect(leadDays('2026-07-08T10:00:00Z', '2026-07-10')).toBe(2);
    // 19:00 UTC 2026-07-09 is already 2026-07-10 in IST -> same day.
    expect(leadDays('2026-07-09T19:00:00Z', '2026-07-10')).toBe(0);
  });
});

describe('weekdayOf', () => {
  it('maps 0 to Monday and 6 to Sunday', () => {
    expect(weekdayOf('2026-07-20')).toBe(0); // Monday
    expect(weekdayOf('2026-07-25')).toBe(5); // Saturday
    expect(weekdayOf('2026-07-26')).toBe(6); // Sunday
    expect(WEEKDAY_LABELS[weekdayOf('2026-07-26')]).toBe('Sun');
  });
});

describe('bookedByLabel', () => {
  it('classifies self, admin and unknown', () => {
    expect(bookedByLabel('P1', 'P1')).toBe('self');
    expect(bookedByLabel('ADMIN9', 'P1')).toBe('admin');
    expect(bookedByLabel(null, 'P1')).toBe('unknown');
  });

  it('treats a booker as admin when the learner has no profile id', () => {
    expect(bookedByLabel('P1', null)).toBe('admin');
    expect(bookedByLabel('P1', undefined)).toBe('admin');
  });
});

describe('pct', () => {
  it('rounds to one decimal and returns 0 for a zero denominator', () => {
    expect(pct(1, 3)).toBe(33.3);
    expect(pct(178, 500)).toBe(35.6);
    expect(pct(0, 0)).toBe(0);
    expect(pct(5, 0)).toBe(0);
  });
});
