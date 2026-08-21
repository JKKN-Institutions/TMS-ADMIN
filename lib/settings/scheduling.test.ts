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
      allowSameDayBooking: false,
      sameDayCutoffHour: 6,
      autoNotifyPassengers: false,
      autoGenerateBills: false,
      inchargeEnforcementMode: 'shadow',
      inchargeShareScoringEnabled: false,
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

describe('autoGenerateBills', () => {
  it('defaults to false when the key is absent — automation is opt-in', () => {
    // This is the LIVE blob shape as of 2026-08-11; the key is not in it.
    const cfg = parseSchedulingConfig({
      bookingDaysAhead: 1,
      autoNotifyPassengers: true,
      bookingWindowEndHour: 19,
      enableBookingTimeWindow: true,
    });
    expect(cfg.autoGenerateBills).toBe(false);
  });

  it('reads a stored true', () => {
    expect(parseSchedulingConfig({ autoGenerateBills: true }).autoGenerateBills).toBe(true);
  });

  it('ignores a non-boolean and falls back to false', () => {
    expect(parseSchedulingConfig({ autoGenerateBills: 'yes' }).autoGenerateBills).toBe(false);
  });

  it('defaults to false for a malformed blob', () => {
    expect(parseSchedulingConfig(null).autoGenerateBills).toBe(false);
  });
});

/** A full config with the given overrides — keeps these cases readable. */
const cfgWith = (over: Partial<typeof DEFAULT_SCHEDULING_CONFIG> = {}) => ({
  ...DEFAULT_SCHEDULING_CONFIG,
  ...over,
});

describe('toWindowOpts', () => {
  it('enabled: passes cutoffHour and daysAhead through unchanged', () => {
    expect(toWindowOpts(cfgWith({ enableBookingTimeWindow: true, cutoffHour: 18, daysAhead: 4 })))
      .toEqual({ cutoffHour: 18, daysAhead: 4, allowSameDay: false, sameDayCutoffHour: 6 });
  });

  it('disabled: cutoffHour becomes the 24 sentinel, but daysAhead is STILL passed through unchanged', () => {
    expect(toWindowOpts(cfgWith({ enableBookingTimeWindow: false, cutoffHour: 18, daysAhead: 4 })))
      .toEqual({ cutoffHour: 24, daysAhead: 4, allowSameDay: false, sameDayCutoffHour: 24 });
  });

  it('disabling the time window never widens or narrows the horizon, whatever daysAhead is set to', () => {
    for (const daysAhead of [1, 5, 10]) {
      const enabled = toWindowOpts(cfgWith({ enableBookingTimeWindow: true, daysAhead }));
      const disabled = toWindowOpts(cfgWith({ enableBookingTimeWindow: false, daysAhead }));
      expect(disabled.daysAhead).toBe(enabled.daysAhead);
      expect(disabled.daysAhead).toBe(daysAhead);
    }
  });

  it('carries the same-day flag and hour through when enabled', () => {
    expect(toWindowOpts(cfgWith({ allowSameDayBooking: true, sameDayCutoffHour: 11 })))
      .toMatchObject({ allowSameDay: true, sameDayCutoffHour: 11 });
  });

  it('applies the 24 sentinel to the same-day hour when the daily window is off', () => {
    // The admin disabled deadlines entirely — today must not still be clipped
    // at an hour they turned off.
    expect(toWindowOpts(cfgWith({ allowSameDayBooking: true, sameDayCutoffHour: 6, enableBookingTimeWindow: false })))
      .toMatchObject({ allowSameDay: true, sameDayCutoffHour: 24 });
  });
});

describe('allowSameDayBooking', () => {
  it('defaults to false — same-day booking is opt-in', () => {
    expect(DEFAULT_SCHEDULING_CONFIG.allowSameDayBooking).toBe(false);
    expect(parseSchedulingConfig({}).allowSameDayBooking).toBe(false);
    expect(parseSchedulingConfig(null).allowSameDayBooking).toBe(false);
  });

  it('is false for the LIVE blob shape, which predates the key', () => {
    const cfg = parseSchedulingConfig({
      bookingDaysAhead: 1,
      autoNotifyPassengers: true,
      bookingWindowEndHour: 19,
      enableBookingTimeWindow: true,
    });
    expect(cfg.allowSameDayBooking).toBe(false);
    expect(cfg.sameDayCutoffHour).toBe(6);
  });

  it('reads a stored true', () => {
    expect(parseSchedulingConfig({ allowSameDayBooking: true }).allowSameDayBooking).toBe(true);
  });

  it('ignores a non-boolean rather than switching the feature on', () => {
    expect(parseSchedulingConfig({ allowSameDayBooking: 'yes' }).allowSameDayBooking).toBe(false);
    expect(parseSchedulingConfig({ allowSameDayBooking: 1 }).allowSameDayBooking).toBe(false);
  });

  it('clamps the same-day cutoff hour to 0..23', () => {
    expect(parseSchedulingConfig({ sameDayBookingCutoffHour: 99 }).sameDayCutoffHour).toBe(23);
    expect(parseSchedulingConfig({ sameDayBookingCutoffHour: -1 }).sameDayCutoffHour).toBe(0);
    expect(parseSchedulingConfig({ sameDayBookingCutoffHour: 11 }).sameDayCutoffHour).toBe(11);
  });

  it('falls back to 6 for a malformed same-day cutoff hour', () => {
    expect(parseSchedulingConfig({ sameDayBookingCutoffHour: 'dawn' }).sameDayCutoffHour).toBe(6);
    expect(parseSchedulingConfig({ sameDayBookingCutoffHour: NaN }).sameDayCutoffHour).toBe(6);
  });
});

describe('inchargeEnforcementMode', () => {
  it('defaults to shadow when absent', () => {
    expect(parseSchedulingConfig({}).inchargeEnforcementMode).toBe('shadow');
    expect(DEFAULT_SCHEDULING_CONFIG.inchargeEnforcementMode).toBe('shadow');
  });

  it('defaults to shadow for a null or malformed blob', () => {
    expect(parseSchedulingConfig(null).inchargeEnforcementMode).toBe('shadow');
    expect(parseSchedulingConfig('nonsense').inchargeEnforcementMode).toBe('shadow');
  });

  it('accepts each valid mode', () => {
    for (const mode of ['off', 'shadow', 'enforce'] as const) {
      expect(parseSchedulingConfig({ inchargeEnforcementMode: mode }).inchargeEnforcementMode).toBe(mode);
    }
  });

  it('falls back to shadow for an unknown value rather than enforcing', () => {
    expect(parseSchedulingConfig({ inchargeEnforcementMode: 'ENFORCE' }).inchargeEnforcementMode).toBe('shadow');
    expect(parseSchedulingConfig({ inchargeEnforcementMode: 42 }).inchargeEnforcementMode).toBe('shadow');
  });
});

describe('inchargeShareScoringEnabled', () => {
  it('defaults to false', () => {
    // Per-share scoring is strictly stricter than the route-level rule it
    // replaces, so turning it on bills MORE people. It must never arrive by
    // default.
    expect(DEFAULT_SCHEDULING_CONFIG.inchargeShareScoringEnabled).toBe(false);
    expect(parseSchedulingConfig({}).inchargeShareScoringEnabled).toBe(false);
  });

  it('reads a stored true', () => {
    expect(parseSchedulingConfig({ inchargeShareScoringEnabled: true }).inchargeShareScoringEnabled).toBe(true);
  });

  it('falls back to false for a non-boolean value', () => {
    expect(parseSchedulingConfig({ inchargeShareScoringEnabled: 'yes' }).inchargeShareScoringEnabled).toBe(false);
  });
});
