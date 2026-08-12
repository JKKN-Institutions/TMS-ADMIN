import { describe, it, expect } from 'vitest';
import { DEFAULT_TRACKING_SETTINGS, parseTrackingSettings } from './settings';

describe('parseTrackingSettings', () => {
  it('returns the defaults for null, undefined, and non-objects', () => {
    expect(parseTrackingSettings(null)).toEqual(DEFAULT_TRACKING_SETTINGS);
    expect(parseTrackingSettings(undefined)).toEqual(DEFAULT_TRACKING_SETTINGS);
    expect(parseTrackingSettings('nope')).toEqual(DEFAULT_TRACKING_SETTINGS);
    expect(parseTrackingSettings(42)).toEqual(DEFAULT_TRACKING_SETTINGS);
  });

  it('overrides only the keys supplied', () => {
    const s = parseTrackingSettings({ liveMaxSec: 45 });
    expect(s.liveMaxSec).toBe(45);
    expect(s.staleMaxSec).toBe(DEFAULT_TRACKING_SETTINGS.staleMaxSec);
  });

  it('ignores values that are not positive finite numbers', () => {
    const s = parseTrackingSettings({
      liveMaxSec: -1,
      staleMaxSec: 0,
      tripExpiryMin: Number.NaN,
      minAccuracyM: '80',
      offlineMaxMin: Number.POSITIVE_INFINITY,
    });
    expect(s).toEqual(DEFAULT_TRACKING_SETTINGS);
  });

  it('ignores unknown keys', () => {
    const s = parseTrackingSettings({ liveMaxSec: 45, bogus: 9 }) as Record<string, unknown>;
    expect(s.bogus).toBeUndefined();
  });

  it('never mutates the exported defaults', () => {
    parseTrackingSettings({ liveMaxSec: 999 });
    expect(DEFAULT_TRACKING_SETTINGS.liveMaxSec).toBe(120);
  });
});
