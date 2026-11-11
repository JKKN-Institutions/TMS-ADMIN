import { describe, it, expect } from 'vitest';
import { sharingHealth, SENT_FRESH_MS, START_GRACE_MS, GAP_GRACE_MS } from './sharing-health';

const NOW = 1_800_000_000_000;
const base = { status: 'starting' as const, network: 'idle' as const, lastSentAt: null, sinceMs: NOW, nowMs: NOW };

describe('sharingHealth', () => {
  it('says ok while a position reached the server recently', () => {
    const h = sharingHealth({ ...base, status: 'live', network: 'connected', lastSentAt: NOW - SENT_FRESH_MS });
    expect(h.level).toBe('ok');
    expect(h.steps).toEqual([]);
  });

  it('waits, without alarm, in the first minute before any position is sent', () => {
    expect(sharingHealth({ ...base, sinceMs: NOW - START_GRACE_MS }).level).toBe('wait');
  });

  it('turns bad when a trip has run past the grace time with nothing sent', () => {
    // The 2026-11-11 case: trip running, zero positions, nothing obvious on screen.
    const h = sharingHealth({ ...base, sinceMs: NOW - START_GRACE_MS - 1 });
    expect(h.level).toBe('bad');
    expect(h.title).toBe('Learners cannot see the bus');
    expect(h.steps.length).toBeGreaterThan(0);
  });

  it('blames mobile data, not location, when positions exist but are not arriving', () => {
    const h = sharingHealth({ ...base, status: 'live', network: 'reconnecting', sinceMs: NOW - START_GRACE_MS - 1 });
    expect(h.level).toBe('bad');
    expect(h.body).toMatch(/mobile data/);
  });

  it('is bad at once when location permission is blocked, even inside the grace time', () => {
    const h = sharingHealth({ ...base, status: 'permission_denied' });
    expect(h.level).toBe('bad');
    expect(h.body).toMatch(/blocked/);
  });

  it('is bad at once when the phone location is switched off', () => {
    expect(sharingHealth({ ...base, status: 'os_location_off' }).level).toBe('bad');
  });

  it('tolerates a short gap after sharing worked, then turns bad', () => {
    const sent = { ...base, status: 'paused' as const, network: 'connected' as const };
    expect(sharingHealth({ ...sent, lastSentAt: NOW - SENT_FRESH_MS - 1 }).level).toBe('wait');
    expect(sharingHealth({ ...sent, lastSentAt: NOW - GAP_GRACE_MS }).level).toBe('wait');
    expect(sharingHealth({ ...sent, lastSentAt: NOW - GAP_GRACE_MS - 1 }).level).toBe('bad');
  });
});
