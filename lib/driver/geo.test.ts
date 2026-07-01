import { describe, it, expect } from 'vitest';
import {
  GEO_PERMISSION_DENIED,
  GEO_POSITION_UNAVAILABLE,
  GEO_TIMEOUT,
  isTerminalGeoError,
  geoErrorMessage,
  geoErrorOutcome,
} from './geo';

describe('isTerminalGeoError', () => {
  it('treats PERMISSION_DENIED as terminal — nothing will ever come, so stop sharing', () => {
    expect(isTerminalGeoError(GEO_PERMISSION_DENIED)).toBe(true);
  });

  it('treats TIMEOUT as transient — watchPosition can still recover, keep sharing alive', () => {
    expect(isTerminalGeoError(GEO_TIMEOUT)).toBe(false);
  });

  it('treats POSITION_UNAVAILABLE as transient — a moving bus loses fix momentarily', () => {
    expect(isTerminalGeoError(GEO_POSITION_UNAVAILABLE)).toBe(false);
  });

  it('treats unknown/future codes as transient (fail-open — do not silently kill a live session)', () => {
    expect(isTerminalGeoError(99)).toBe(false);
  });
});

describe('geoErrorMessage', () => {
  it('gives permission-denied its own actionable message', () => {
    expect(geoErrorMessage(GEO_PERMISSION_DENIED)).toMatch(/permission/i);
  });

  it('reassures on transient errors that sharing resumes automatically', () => {
    expect(geoErrorMessage(GEO_TIMEOUT)).toMatch(/resume|automatically/i);
    expect(geoErrorMessage(GEO_POSITION_UNAVAILABLE)).toMatch(/resume|automatically/i);
  });
});

describe('geoErrorOutcome — live-session resilience', () => {
  // Regression guard: the bug that froze the admin map at the driver's start point
  // was a single transient geolocation error tearing down the whole session.
  it('does NOT stop the session on a transient TIMEOUT', () => {
    expect(geoErrorOutcome(GEO_TIMEOUT).stopSharing).toBe(false);
  });

  it('does NOT stop the session on a transient POSITION_UNAVAILABLE', () => {
    expect(geoErrorOutcome(GEO_POSITION_UNAVAILABLE).stopSharing).toBe(false);
  });

  it('survives an intermittent burst of transient errors mid-drive', () => {
    // A moving bus (tunnels, buildings, GPS re-acquisition) throws these routinely.
    const burst = [GEO_TIMEOUT, GEO_POSITION_UNAVAILABLE, GEO_TIMEOUT, 99];
    expect(burst.some((code) => geoErrorOutcome(code).stopSharing)).toBe(false);
  });

  it('stops the session only on a terminal PERMISSION_DENIED, with an actionable message', () => {
    const outcome = geoErrorOutcome(GEO_PERMISSION_DENIED);
    expect(outcome.stopSharing).toBe(true);
    expect(outcome.message).toMatch(/permission/i);
  });
});
