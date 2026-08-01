import { describe, it, expect } from 'vitest';
import { classifyRouteStatus, STUCK_AFTER_MIN, type RouteStatusInput } from './route-status';

const NOW = Date.parse('2026-08-01T10:00:00Z');

/** Build an input whose last fix is `minutes` old. Pass null for "never reported". */
function at(minutes: number | null, over: Partial<RouteStatusInput> = {}): RouteStatusInput {
  return {
    hasDriver: true,
    hasVehicle: true,
    sharing: true,
    lastFixAt: minutes === null ? null : new Date(NOW - minutes * 60_000).toISOString(),
    nowMs: NOW,
    ...over,
  };
}

describe('classifyRouteStatus — configuration problems outrank sharing', () => {
  it('reports unconfigured when there is neither driver nor vehicle', () => {
    const r = classifyRouteStatus(at(0, { hasDriver: false, hasVehicle: false }));
    expect(r.state).toBe('unconfigured');
    expect(r.canNudge).toBe(false);
  });

  it('reports no_vehicle even when the driver has sharing on', () => {
    const r = classifyRouteStatus(at(0, { hasVehicle: false, sharing: true }));
    expect(r.state).toBe('no_vehicle');
  });

  it('reports no_driver when a vehicle exists but no driver does', () => {
    const r = classifyRouteStatus(at(0, { hasDriver: false }));
    expect(r.state).toBe('no_driver');
  });
});

describe('classifyRouteStatus — sharing off', () => {
  it('reports off when the driver has not gone on duty', () => {
    const r = classifyRouteStatus(at(0, { sharing: false }));
    expect(r.state).toBe('off');
    expect(r.canNudge).toBe(true);
  });

  it('reports off regardless of how fresh an old fix is', () => {
    expect(classifyRouteStatus(at(1, { sharing: false })).state).toBe('off');
  });
});

describe('classifyRouteStatus — freshness bands', () => {
  it('is live at 0 minutes', () => {
    expect(classifyRouteStatus(at(0)).state).toBe('live');
  });

  it('is live at exactly the 2-minute boundary', () => {
    expect(classifyRouteStatus(at(2)).state).toBe('live');
  });

  it('is recent just past 2 minutes', () => {
    expect(classifyRouteStatus(at(3)).state).toBe('recent');
  });

  it('is recent at exactly the 5-minute boundary', () => {
    expect(classifyRouteStatus(at(5)).state).toBe('recent');
  });

  it('is paused just past 5 minutes', () => {
    expect(classifyRouteStatus(at(6)).state).toBe('paused');
  });

  it('is paused at exactly the stuck boundary', () => {
    expect(classifyRouteStatus(at(STUCK_AFTER_MIN)).state).toBe('paused');
  });

  it('is stuck just past the stuck boundary', () => {
    expect(classifyRouteStatus(at(STUCK_AFTER_MIN + 1)).state).toBe('stuck');
  });

  it('is stuck for a 28-day-old fix (the route 19 case)', () => {
    const r = classifyRouteStatus(at(28 * 24 * 60));
    expect(r.state).toBe('stuck');
    expect(r.canNudge).toBe(true);
  });

  it('is stuck when sharing is on but nothing was ever reported', () => {
    expect(classifyRouteStatus(at(null)).state).toBe('stuck');
  });
});

describe('classifyRouteStatus — presentation', () => {
  it('gives live a green tone and recent a green tone', () => {
    expect(classifyRouteStatus(at(0)).tone).toBe('green');
    expect(classifyRouteStatus(at(4)).tone).toBe('green');
  });

  it('gives paused amber and stuck red', () => {
    expect(classifyRouteStatus(at(10)).tone).toBe('amber');
    expect(classifyRouteStatus(at(60)).tone).toBe('red');
  });

  it('never returns an empty label or reason', () => {
    const inputs = [
      at(0), at(4), at(10), at(60), at(null),
      at(0, { sharing: false }),
      at(0, { hasVehicle: false }),
      at(0, { hasDriver: false }),
      at(0, { hasDriver: false, hasVehicle: false }),
    ];
    for (const i of inputs) {
      const r = classifyRouteStatus(i);
      expect(r.label.length).toBeGreaterThan(0);
      expect(r.reason.length).toBeGreaterThan(0);
    }
  });

  it('only allows nudging in off and stuck states', () => {
    expect(classifyRouteStatus(at(0)).canNudge).toBe(false);
    expect(classifyRouteStatus(at(10)).canNudge).toBe(false);
    expect(classifyRouteStatus(at(60)).canNudge).toBe(true);
    expect(classifyRouteStatus(at(0, { sharing: false })).canNudge).toBe(true);
  });
});
