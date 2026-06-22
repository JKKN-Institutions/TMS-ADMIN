import { describe, it, expect } from 'vitest';
import { monthDays, cellStatus, buildMonthCells } from './calendar';

// Frozen clock: now + 5:30 IST => IST today = 2026-06-22, so bookable = 06-23..06-29.
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
  it('out-of-horizon future => out_of_horizon; past booking => locked', () => {
    expect(cellStatus('2026-06-30', { hasBooking: false, now: NOW })).toBe('out_of_horizon');
    expect(cellStatus('2026-06-10', { hasBooking: true, now: NOW })).toBe('locked');
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
    expect(by('2026-06-24').status).toBe('booked');
    expect(by('2026-06-25').status).toBe('holiday');
    expect(by('2026-06-25').note).toBe('Test');
    expect(by('2026-06-22').status).toBe('out_of_horizon'); // today
  });
});
