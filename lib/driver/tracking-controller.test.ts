import { describe, it, expect } from 'vitest';
import {
  reduceTracking,
  initialTrackingState,
  isSharing,
  PAUSE_AFTER_MS,
  OS_OFF_STREAK,
  type TrackingState,
} from './tracking-controller';
import { GEO_PERMISSION_DENIED, GEO_POSITION_UNAVAILABLE, GEO_TIMEOUT } from './geo';

const run = (events: Parameters<typeof reduceTracking>[1][], from: TrackingState = initialTrackingState) =>
  events.reduce(reduceTracking, from);

describe('reduceTracking — session lifecycle', () => {
  it('starts in idle', () => {
    expect(initialTrackingState.status).toBe('idle');
  });

  it('start → starting (acquiring), no fix yet', () => {
    const s = run([{ type: 'start' }]);
    expect(s.status).toBe('starting');
    expect(s.everFixed).toBe(false);
  });

  it('first fix → live and clears the banner', () => {
    const s = run([{ type: 'start' }, { type: 'fix', atMs: 1000 }]);
    expect(s.status).toBe('live');
    expect(s.lastFixAt).toBe(1000);
    expect(s.everFixed).toBe(true);
    expect(s.banner).toBeNull();
  });

  it('stop → stopped', () => {
    const s = run([{ type: 'start' }, { type: 'fix', atMs: 1000 }, { type: 'stop' }]);
    expect(s.status).toBe('stopped');
  });
});

describe('reduceTracking — OS location OFF detection', () => {
  it('3 POSITION_UNAVAILABLE with no fix ever → os_location_off (error banner)', () => {
    const s = run([
      { type: 'start' },
      { type: 'geoError', code: GEO_POSITION_UNAVAILABLE },
      { type: 'geoError', code: GEO_POSITION_UNAVAILABLE },
      { type: 'geoError', code: GEO_POSITION_UNAVAILABLE },
    ]);
    expect(s.unavailableStreak).toBeGreaterThanOrEqual(OS_OFF_STREAK);
    expect(s.status).toBe('os_location_off');
    expect(s.banner?.tone).toBe('error');
  });

  it('POSITION_UNAVAILABLE AFTER a fix is a transient pause, never os_location_off', () => {
    const s = run([
      { type: 'start' },
      { type: 'fix', atMs: 1000 },
      { type: 'geoError', code: GEO_POSITION_UNAVAILABLE },
      { type: 'geoError', code: GEO_POSITION_UNAVAILABLE },
      { type: 'geoError', code: GEO_POSITION_UNAVAILABLE },
    ]);
    expect(s.status).toBe('paused');
  });

  it('a fresh fix recovers from os_location_off', () => {
    const s = run([
      { type: 'start' },
      { type: 'geoError', code: GEO_POSITION_UNAVAILABLE },
      { type: 'geoError', code: GEO_POSITION_UNAVAILABLE },
      { type: 'geoError', code: GEO_POSITION_UNAVAILABLE },
      { type: 'fix', atMs: 5000 },
    ]);
    expect(s.status).toBe('live');
  });

  it('fewer than OS_OFF_STREAK POSITION_UNAVAILABLE (no fix yet) stays starting, not os_location_off', () => {
    const s = run([
      { type: 'start' },
      { type: 'geoError', code: GEO_POSITION_UNAVAILABLE },
      { type: 'geoError', code: GEO_POSITION_UNAVAILABLE },
    ]);
    expect(s.unavailableStreak).toBe(2);
    expect(s.status).toBe('starting');
  });

  it('a terminal permission_denied absorbs a stray later fix (stays terminal)', () => {
    const s = run([
      { type: 'start' },
      { type: 'geoError', code: GEO_PERMISSION_DENIED },
      { type: 'fix', atMs: 5000 },
    ]);
    expect(s.status).toBe('permission_denied');
  });
});

describe('reduceTracking — permission denied is terminal', () => {
  it('PERMISSION_DENIED → permission_denied with error banner, not sharing', () => {
    const s = run([{ type: 'start' }, { type: 'fix', atMs: 1000 }, { type: 'geoError', code: GEO_PERMISSION_DENIED }]);
    expect(s.status).toBe('permission_denied');
    expect(s.banner?.tone).toBe('error');
    expect(isSharing(s.status)).toBe(false);
  });
});

describe('reduceTracking — heartbeat + visibility', () => {
  it('no fresh fix for PAUSE_AFTER_MS while live → paused (warn banner)', () => {
    const s = run([
      { type: 'start' },
      { type: 'fix', atMs: 1000 },
      { type: 'tick', nowMs: 1000 + PAUSE_AFTER_MS + 1 },
    ]);
    expect(s.status).toBe('paused');
    expect(s.banner?.tone).toBe('warn');
  });

  it('a tick within the window keeps it live', () => {
    const s = run([
      { type: 'start' },
      { type: 'fix', atMs: 1000 },
      { type: 'tick', nowMs: 1000 + PAUSE_AFTER_MS - 1 },
    ]);
    expect(s.status).toBe('live');
  });

  it('hidden while live → paused; a later fix → live again', () => {
    const hidden = run([{ type: 'start' }, { type: 'fix', atMs: 1000 }, { type: 'visibility', visible: false }]);
    expect(hidden.status).toBe('paused');
    const back = run([{ type: 'visibility', visible: true }, { type: 'fix', atMs: 9000 }], hidden);
    expect(back.status).toBe('live');
  });

  it('TIMEOUT while starting stays starting (still acquiring), not os_location_off', () => {
    const s = run([{ type: 'start' }, { type: 'geoError', code: GEO_TIMEOUT }, { type: 'geoError', code: GEO_TIMEOUT }]);
    expect(s.status).toBe('starting');
  });

  it('ticks/visibility do not resurrect a terminal permission_denied', () => {
    const s = run([
      { type: 'start' },
      { type: 'geoError', code: GEO_PERMISSION_DENIED },
      { type: 'visibility', visible: true },
      { type: 'tick', nowMs: 999999 },
    ]);
    expect(s.status).toBe('permission_denied');
  });
});
