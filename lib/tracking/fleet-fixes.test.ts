import { describe, it, expect } from 'vitest';
import { keepLatest, newerFix } from './fleet-fixes';
import type { LiveFix } from './broadcast';

const fix = (routeId: string, at: string, latitude = 11.4): LiveFix => ({
  tripId: 't', routeId, vehicleId: 'v', latitude, longitude: 77.7, speed: null, heading: null, accuracyM: null, at,
});

describe('keepLatest', () => {
  it('keeps one position per bus — a message from one bus never drops another', () => {
    const m = new Map<string, LiveFix>();
    keepLatest(m, fix('r18', '2026-11-12T03:00:00Z', 11.40));
    keepLatest(m, fix('r31', '2026-11-12T03:00:02Z', 11.50));
    keepLatest(m, fix('r18', '2026-11-12T03:00:06Z', 11.41));
    expect(m.size).toBe(2);
    expect(m.get('r18')?.latitude).toBe(11.41);
    expect(m.get('r31')?.latitude).toBe(11.50); // untouched by r18's newer message
  });

  it('ignores a message older than the one already held', () => {
    const m = new Map<string, LiveFix>();
    expect(keepLatest(m, fix('r18', '2026-11-12T03:00:06Z', 11.41))).toBe(true);
    expect(keepLatest(m, fix('r18', '2026-11-12T03:00:00Z', 11.40))).toBe(false);
    expect(m.get('r18')?.latitude).toBe(11.41);
  });

  it('ignores malformed messages', () => {
    const m = new Map<string, LiveFix>();
    expect(keepLatest(m, null)).toBe(false);
    expect(keepLatest(m, { ...fix('', '2026-11-12T03:00:00Z') })).toBe(false);
    expect(keepLatest(m, { ...fix('r1', '2026-11-12T03:00:00Z'), latitude: 'x' as unknown as number })).toBe(false);
    expect(m.size).toBe(0);
  });
});

describe('newerFix', () => {
  const m = new Map<string, LiveFix>([['r18', fix('r18', '2026-11-12T03:00:06Z')]]);

  it('returns the broadcast position only when it beats the polled one', () => {
    expect(newerFix(m, 'r18', '2026-11-12T03:00:00Z')).not.toBeNull();
    expect(newerFix(m, 'r18', '2026-11-12T03:00:06Z')).toBeNull();
    expect(newerFix(m, 'r18', '2026-11-12T03:00:30Z')).toBeNull();
  });

  it('takes a broadcast position for a bus the server has never placed', () => {
    expect(newerFix(m, 'r18', null)).not.toBeNull();
  });

  it('has nothing for a bus that has not broadcast', () => {
    expect(newerFix(m, 'r31', null)).toBeNull();
  });
});
