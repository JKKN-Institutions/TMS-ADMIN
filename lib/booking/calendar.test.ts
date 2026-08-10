import { describe, it, expect } from 'vitest';
import { monthDays, cellStatus, buildMonthCells, effectiveOpen } from './calendar';

// Frozen clock: now + 5:30 IST => IST today = 2026-06-22 (Monday). With the
// default 1-working-day horizon, the only bookable date is Tuesday 06-23.
const NOW = new Date('2026-06-22T03:00:00Z');

describe('monthDays', () => {
  it('lists every day of a 30-day month', () => {
    const d = monthDays('2026-06');
    expect(d).toHaveLength(30);
    expect(d[0]).toBe('2026-06-01');
    expect(d[29]).toBe('2026-06-30');
  });
  it('handles February (non-leap 2026)', () => {
    expect(monthDays('2026-02')).toHaveLength(28);
  });
});

describe('cellStatus', () => {
  it('an exception wins over everything (even a booking)', () => {
    expect(cellStatus('2026-06-24', { hasBooking: true, exception: { kind: 'no_service', note: 'strike' }, now: NOW })).toBe('no_service');
    expect(cellStatus('2026-06-25', { hasBooking: false, exception: { kind: 'holiday', note: null }, now: NOW })).toBe('holiday');
  });
  it('in-horizon, no booking => open; booked => booked', () => {
    expect(cellStatus('2026-06-23', { hasBooking: false, now: NOW })).toBe('open');
    expect(cellStatus('2026-06-23', { hasBooking: true, now: NOW })).toBe('booked');
  });
  it('the single working day ahead is open; everything beyond is out_of_horizon', () => {
    // NOW is Monday 2026-06-22; the horizon is exactly 06-23 (Tue)
    expect(cellStatus('2026-06-26', { hasBooking: false, now: NOW })).toBe('out_of_horizon'); // Fri, beyond the 1-day horizon
    expect(cellStatus('2026-06-30', { hasBooking: false, now: NOW })).toBe('out_of_horizon'); // next week
    expect(cellStatus('2026-12-01', { hasBooking: false, now: NOW })).toBe('out_of_horizon'); // far future
    expect(cellStatus('2026-06-10', { hasBooking: true, now: NOW })).toBe('locked');          // past booking
  });
});

describe('buildMonthCells', () => {
  it('merges bookings + exceptions across the month', () => {
    const cells = buildMonthCells('2026-06', {
      bookedDates: new Set(['2026-06-24']),
      exceptions: new Map([['2026-06-25', { kind: 'holiday', note: 'Test' }]]),
      now: NOW,
    });
    const by = (d: string) => cells.find((c) => c.date === d)!;
    expect(by('2026-06-23').status).toBe('open');
    expect(by('2026-06-24').status).toBe('locked'); // booked, but past the 1-day horizon
    expect(by('2026-06-25').status).toBe('holiday');
    expect(by('2026-06-25').note).toBe('Test');
    expect(by('2026-06-22').status).toBe('out_of_horizon'); // today
  });
});

describe('booking-window overrides', () => {
  const NOW2 = new Date('2026-06-22T03:00:00Z'); // IST today 2026-06-22 (Mon) => bookable 06-23 only
  it('a disabled window closes an otherwise-open date', () => {
    expect(cellStatus('2026-06-23', { hasBooking: false, window: { enabled: false, deadline: null, capacityOverride: null }, now: NOW2 })).toBe('closed');
  });
  it('an earlier custom deadline can close a date before the default cutoff', () => {
    // default cutoff for 06-23 is 20:00 IST on 06-22; a deadline already in the past => closed
    expect(effectiveOpen('2026-06-23', { window: { enabled: true, deadline: '2026-06-22T00:00:00Z', capacityOverride: null }, now: NOW2 })).toBe(false);
  });
  it('a later custom deadline keeps a date open past the default', () => {
    expect(effectiveOpen('2026-06-23', { window: { enabled: true, deadline: '2026-06-23T18:00:00+05:30', capacityOverride: null }, now: NOW2 })).toBe(true);
  });
  it('an exception still wins over an (enabled) window', () => {
    expect(cellStatus('2026-06-23', { hasBooking: false, exception: { kind: 'holiday', note: null }, window: { enabled: true, deadline: null, capacityOverride: null }, now: NOW2 })).toBe('holiday');
  });
});

describe('Sunday weekly holiday', () => {
  // 2026-06-28 is a Sunday — never bookable, whatever the horizon
  it('marks an unbooked Sunday as weekly_off', () => {
    expect(cellStatus('2026-06-28', { hasBooking: false, now: NOW })).toBe('weekly_off');
  });
  it('shows a legacy booked Sunday as locked, not actionable', () => {
    expect(cellStatus('2026-06-28', { hasBooking: true, now: NOW })).toBe('locked');
  });
  it('lets a real admin exception override the weekly-off label', () => {
    expect(cellStatus('2026-06-28', { hasBooking: false, exception: { kind: 'holiday', note: 'Pongal' }, now: NOW })).toBe('holiday');
  });
  it('keeps booking closed on a Sunday even with an enabled window', () => {
    expect(effectiveOpen('2026-06-28', { window: { enabled: true, deadline: null, capacityOverride: null }, now: NOW })).toBe(false);
  });
});

describe('offDates threading', () => {
  it('effectiveOpen rejects a service-calendar off day', () => {
    const now = new Date('2026-06-26T03:00:00Z'); // Friday
    expect(effectiveOpen('2026-06-27', { now })).toBe(true); // working Saturday
    expect(effectiveOpen('2026-06-27', { now, offDates: new Set(['2026-06-27']) })).toBe(false);
  });

  it('effectiveOpen opens the Monday once Saturday is marked off', () => {
    const now = new Date('2026-06-26T03:00:00Z');
    expect(effectiveOpen('2026-06-29', { now, offDates: new Set(['2026-06-27']) })).toBe(true);
  });

  it('cellStatus labels a cutoff-passed horizon day "closed", not "out_of_horizon"', () => {
    // Monday 20:01 IST: Tuesday closed, Wednesday now open
    const now = new Date('2026-06-22T14:31:00Z');
    expect(cellStatus('2026-06-23', { hasBooking: false, now })).toBe('closed');
    expect(cellStatus('2026-06-24', { hasBooking: false, now })).toBe('open');
  });

  it('cellStatus marks a far-future day out_of_horizon, and locked if booked', () => {
    const now = new Date('2026-06-22T03:00:00Z');
    expect(cellStatus('2026-07-15', { hasBooking: false, now })).toBe('out_of_horizon');
    expect(cellStatus('2026-07-15', { hasBooking: true, now })).toBe('locked');
  });

  it('buildMonthCells forwards offDates to the gate', () => {
    const cells = buildMonthCells('2026-06', {
      bookedDates: new Set<string>(),
      exceptions: new Map(),
      offDates: new Set(['2026-06-27']),
      now: new Date('2026-06-26T03:00:00Z'),
    });
    const sat = cells.find((c) => c.date === '2026-06-27');
    const mon = cells.find((c) => c.date === '2026-06-29');
    expect(sat?.status).toBe('out_of_horizon');
    expect(mon?.status).toBe('open');
  });
});

describe('effectiveOpen with injected config', () => {
  it('closes a date that is outside the configured daysAhead horizon', () => {
    // Monday 2026-06-22; daysAhead=1 => only 2026-06-23 is in the horizon
    const now = new Date('2026-06-22T03:00:00Z');
    expect(effectiveOpen('2026-06-23', { now, daysAhead: 1 })).toBe(true);
    expect(effectiveOpen('2026-06-24', { now, daysAhead: 1 })).toBe(false);
  });
  it('applies a configured cutoff hour to the fallback deadline', () => {
    // 19:00 IST cutoff: 13:29 UTC prior day open, 13:31 closed
    expect(effectiveOpen('2026-06-23', { now: new Date('2026-06-22T13:29:00Z'), cutoffHour: 19 })).toBe(true);
    expect(effectiveOpen('2026-06-23', { now: new Date('2026-06-22T13:31:00Z'), cutoffHour: 19 })).toBe(false);
  });
});
