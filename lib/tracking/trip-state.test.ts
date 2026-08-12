import { describe, it, expect } from 'vitest';
import {
  deriveDirection,
  shouldAcceptFix,
  liveStatus,
  isTripExpired,
  distanceIncrementKm,
  ONWARD_GRACE_MIN,
} from './trip-state';

describe('deriveDirection', () => {
  it('is onward before the route arrival time', () => {
    expect(deriveDirection(7 * 60, '09:00:00')).toBe('onward');
  });

  it('stays onward through the grace window after arrival', () => {
    const pivot = 9 * 60 + ONWARD_GRACE_MIN;
    expect(deriveDirection(pivot, '09:00:00')).toBe('onward');
  });

  it('is return once past arrival plus grace', () => {
    const pivot = 9 * 60 + ONWARD_GRACE_MIN;
    expect(deriveDirection(pivot + 1, '09:00:00')).toBe('return');
  });

  it('falls back to a noon pivot when the route has no arrival time', () => {
    expect(deriveDirection(11 * 60, null)).toBe('onward');
    expect(deriveDirection(13 * 60, null)).toBe('return');
  });
});

describe('shouldAcceptFix', () => {
  it('accepts a fix at or better than the threshold', () => {
    expect(shouldAcceptFix(100, 100)).toBe(true);
    expect(shouldAcceptFix(8, 100)).toBe(true);
  });

  it('rejects a fix worse than the threshold', () => {
    expect(shouldAcceptFix(101, 100)).toBe(false);
  });

  it('accepts a fix whose accuracy is unknown', () => {
    // Some devices report null accuracy; rejecting these would break capture entirely.
    expect(shouldAcceptFix(null, 100)).toBe(true);
  });
});

describe('liveStatus', () => {
  const base = { nowMs: 1_000_000, liveMaxSec: 120, staleMaxSec: 300 };

  it('reports TRIP_COMPLETED for any non-active trip', () => {
    expect(liveStatus({ ...base, tripStatus: 'completed', lastFixAt: null })).toBe('TRIP_COMPLETED');
    expect(liveStatus({ ...base, tripStatus: 'expired', lastFixAt: null })).toBe('TRIP_COMPLETED');
  });

  it('reports CONNECTING for an active trip with no fix yet', () => {
    expect(liveStatus({ ...base, tripStatus: 'active', lastFixAt: null })).toBe('CONNECTING');
  });

  it('reports CONNECTING when the stored fix time is unparseable', () => {
    expect(liveStatus({ ...base, tripStatus: 'active', lastFixAt: 'not-a-date' })).toBe('CONNECTING');
  });

  it('walks LIVE → STALE → OFFLINE across the thresholds', () => {
    const at = (ageSec: number) =>
      liveStatus({
        ...base,
        tripStatus: 'active',
        lastFixAt: new Date(base.nowMs - ageSec * 1000).toISOString(),
      });
    expect(at(0)).toBe('LIVE');
    expect(at(120)).toBe('LIVE');
    expect(at(121)).toBe('STALE');
    expect(at(300)).toBe('STALE');
    expect(at(301)).toBe('OFFLINE');
  });
});

describe('isTripExpired', () => {
  const now = 10_000_000;
  const iso = (msAgo: number) => new Date(now - msAgo).toISOString();

  it('expires an active trip silent past the threshold', () => {
    expect(isTripExpired(iso(31 * 60_000), iso(60 * 60_000), now, 30)).toBe(true);
  });

  it('does not expire a trip still reporting', () => {
    expect(isTripExpired(iso(29 * 60_000), iso(60 * 60_000), now, 30)).toBe(false);
  });

  it('measures from started_at when no fix has ever arrived', () => {
    expect(isTripExpired(null, iso(31 * 60_000), now, 30)).toBe(true);
    expect(isTripExpired(null, iso(5 * 60_000), now, 30)).toBe(false);
  });

  it('never expires on a future timestamp', () => {
    expect(isTripExpired(new Date(now + 60_000).toISOString(), iso(0), now, 30)).toBe(false);
  });

  it('does not expire when both timestamps are unparseable', () => {
    expect(isTripExpired('junk', 'junk', now, 30)).toBe(false);
  });
});

describe('distanceIncrementKm', () => {
  it('is zero when there is no previous point', () => {
    expect(distanceIncrementKm(null, { lat: 11.44, lng: 77.73 })).toBe(0);
  });

  it('ignores GPS jitter below the movement floor', () => {
    expect(distanceIncrementKm({ lat: 11.44, lng: 77.73 }, { lat: 11.44005, lng: 77.73 })).toBe(0);
  });

  it('accumulates a real move', () => {
    const km = distanceIncrementKm({ lat: 11.44, lng: 77.73 }, { lat: 11.45, lng: 77.73 });
    expect(km).toBeGreaterThan(1);
    expect(km).toBeLessThan(1.3);
  });
});
