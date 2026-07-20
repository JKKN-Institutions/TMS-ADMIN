import { describe, it, expect } from 'vitest';
import { parseSchedulingConfig, DEFAULT_SCHEDULING_CONFIG } from './scheduling';

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

  it('clamps cutoffHour to 0..23 and daysAhead to 1..14', () => {
    expect(parseSchedulingConfig({ bookingWindowEndHour: 99 }).cutoffHour).toBe(23);
    expect(parseSchedulingConfig({ bookingWindowEndHour: -5 }).cutoffHour).toBe(0);
    expect(parseSchedulingConfig({ bookingDaysAhead: 99 }).daysAhead).toBe(14);
    expect(parseSchedulingConfig({ bookingDaysAhead: 0 }).daysAhead).toBe(1);
  });

  it('falls back to defaults for missing / non-numeric fields', () => {
    const cfg = parseSchedulingConfig({ enableBookingTimeWindow: true });
    expect(cfg.cutoffHour).toBe(20);
    expect(cfg.daysAhead).toBe(6);
    expect(cfg.autoNotifyPassengers).toBe(true);
  });
});
