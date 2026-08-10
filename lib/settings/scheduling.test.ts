import { describe, it, expect } from 'vitest';
import { parseSchedulingConfig, toWindowOpts, DEFAULT_SCHEDULING_CONFIG } from './scheduling';

describe('parseSchedulingConfig', () => {
  it('returns defaults for null / non-object input', () => {
    expect(parseSchedulingConfig(null)).toEqual(DEFAULT_SCHEDULING_CONFIG);
    expect(parseSchedulingConfig('nope')).toEqual(DEFAULT_SCHEDULING_CONFIG);
  });

  it('maps stored blob keys to config fields', () => {
    const cfg = parseSchedulingConfig({
      enableBookingTimeWindow: false,
      bookingWindowEndHour: 19,
      bookingDaysAhead: 3,
      autoNotifyPassengers: false,
    });
    expect(cfg).toEqual({
      enableBookingTimeWindow: false,
      cutoffHour: 19,
      daysAhead: 3,
      autoNotifyPassengers: false,
    });
  });

  it('clamps cutoffHour to 0..23 and daysAhead to 1..10', () => {
    expect(parseSchedulingConfig({ bookingWindowEndHour: 99 }).cutoffHour).toBe(23);
    expect(parseSchedulingConfig({ bookingWindowEndHour: -5 }).cutoffHour).toBe(0);
    expect(parseSchedulingConfig({ bookingDaysAhead: 99 }).daysAhead).toBe(10);
    expect(parseSchedulingConfig({ bookingDaysAhead: 0 }).daysAhead).toBe(1);
  });

  it('falls back to defaults for missing / non-numeric fields', () => {
    const cfg = parseSchedulingConfig({ enableBookingTimeWindow: true });
    expect(cfg.cutoffHour).toBe(20);
    expect(cfg.daysAhead).toBe(1);
    expect(cfg.autoNotifyPassengers).toBe(true);
  });

  it('falls back to defaults for wrong-typed values', () => {
    // Non-numeric string for bookingWindowEndHour → cutoffHour falls back to 20
    let cfg = parseSchedulingConfig({ bookingWindowEndHour: 'late' });
    expect(cfg.cutoffHour).toBe(20);

    // null for bookingDaysAhead → daysAhead falls back to 1
    cfg = parseSchedulingConfig({ bookingDaysAhead: null });
    expect(cfg.daysAhead).toBe(1);

    // String for autoNotifyPassengers → falls back to true
    cfg = parseSchedulingConfig({ autoNotifyPassengers: 'true' });
    expect(cfg.autoNotifyPassengers).toBe(true);

    // NaN for bookingWindowEndHour → cutoffHour falls back to 20
    cfg = parseSchedulingConfig({ bookingWindowEndHour: NaN });
    expect(cfg.cutoffHour).toBe(20);

    // Array for bookingDaysAhead → daysAhead falls back to 1
    cfg = parseSchedulingConfig({ bookingDaysAhead: [5] as unknown });
    expect(cfg.daysAhead).toBe(1);

    // Object for autoNotifyPassengers → falls back to true
    cfg = parseSchedulingConfig({ autoNotifyPassengers: {} as unknown });
    expect(cfg.autoNotifyPassengers).toBe(true);

    // Infinity for bookingWindowEndHour → cutoffHour falls back to 20
    cfg = parseSchedulingConfig({ bookingWindowEndHour: Infinity });
    expect(cfg.cutoffHour).toBe(20);

    // -Infinity for bookingDaysAhead → daysAhead falls back to 1
    cfg = parseSchedulingConfig({ bookingDaysAhead: -Infinity });
    expect(cfg.daysAhead).toBe(1);
  });

  it('accepts the top of the working-day range', () => {
    expect(parseSchedulingConfig({ bookingDaysAhead: 10 }).daysAhead).toBe(10);
    expect(parseSchedulingConfig({ bookingDaysAhead: 11 }).daysAhead).toBe(10);
  });
});

describe('toWindowOpts', () => {
  it('enabled: passes cutoffHour and daysAhead through unchanged', () => {
    const cfg = { enableBookingTimeWindow: true, cutoffHour: 18, daysAhead: 4, autoNotifyPassengers: true };
    expect(toWindowOpts(cfg)).toEqual({ cutoffHour: 18, daysAhead: 4 });
  });

  it('disabled: cutoffHour becomes the 24 sentinel, but daysAhead is STILL passed through unchanged', () => {
    const cfg = { enableBookingTimeWindow: false, cutoffHour: 18, daysAhead: 4, autoNotifyPassengers: true };
    expect(toWindowOpts(cfg)).toEqual({ cutoffHour: 24, daysAhead: 4 });
  });

  it('disabling the time window never widens or narrows the horizon, whatever daysAhead is set to', () => {
    for (const daysAhead of [1, 5, 10]) {
      const enabled = toWindowOpts({ enableBookingTimeWindow: true, cutoffHour: 20, daysAhead, autoNotifyPassengers: false });
      const disabled = toWindowOpts({ enableBookingTimeWindow: false, cutoffHour: 20, daysAhead, autoNotifyPassengers: false });
      expect(disabled.daysAhead).toBe(enabled.daysAhead);
      expect(disabled.daysAhead).toBe(daysAhead);
    }
  });
});
