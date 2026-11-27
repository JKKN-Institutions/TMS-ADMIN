import { describe, it, expect } from 'vitest';
import {
  lerp,
  interpolateLatLng,
  haversineMeters,
  shouldSnap,
  SNAP_THRESHOLD_M,
  bearingDeg,
  courseOf,
  shortestTurn,
} from './interpolate';

describe('lerp', () => {
  it('returns the endpoints at t=0 and t=1', () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
  });

  it('blends linearly at the midpoint', () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(10, 20, 0.25)).toBe(12.5);
  });

  it('clamps t outside [0,1] so the marker never overshoots', () => {
    expect(lerp(0, 10, -1)).toBe(0);
    expect(lerp(0, 10, 2)).toBe(10);
  });
});

describe('interpolateLatLng', () => {
  it('returns a point on the segment between from and to', () => {
    const mid = interpolateLatLng({ lat: 0, lng: 0 }, { lat: 10, lng: 20 }, 0.5);
    expect(mid).toEqual({ lat: 5, lng: 10 });
  });
});

describe('haversineMeters', () => {
  it('is zero for the same point', () => {
    expect(haversineMeters({ lat: 11.5, lng: 77.8 }, { lat: 11.5, lng: 77.8 })).toBe(0);
  });

  it('is ~111 m for 0.001° of latitude', () => {
    const d = haversineMeters({ lat: 0, lng: 0 }, { lat: 0.001, lng: 0 });
    expect(d).toBeGreaterThan(110);
    expect(d).toBeLessThan(112);
  });
});

describe('shouldSnap', () => {
  it('does NOT snap for a normal between-poll move (a bus travels < ~200 m in 5 s)', () => {
    // ~100 m apart
    expect(shouldSnap({ lat: 11.5, lng: 77.8 }, { lat: 11.5009, lng: 77.8 })).toBe(false);
  });

  it('snaps for an implausible jump (first fix / teleport) beyond the threshold', () => {
    expect(shouldSnap({ lat: 11.44, lng: 77.72 }, { lat: 11.52, lng: 77.89 })).toBe(true);
  });

  it('honours a custom threshold', () => {
    const near = { lat: 11.5, lng: 77.8 };
    const far = { lat: 11.5045, lng: 77.8 }; // ~500 m
    expect(shouldSnap(near, far, 100)).toBe(true);
    expect(shouldSnap(near, far, SNAP_THRESHOLD_M)).toBe(false);
  });
});

describe('bearingDeg', () => {
  const o = { lat: 11.44, lng: 77.73 };
  it('reads the four compass points', () => {
    expect(bearingDeg(o, { lat: 11.45, lng: 77.73 })).toBeCloseTo(0, 0);
    expect(bearingDeg(o, { lat: 11.44, lng: 77.74 })).toBeCloseTo(90, 0);
    expect(bearingDeg(o, { lat: 11.43, lng: 77.73 })).toBeCloseTo(180, 0);
    expect(bearingDeg(o, { lat: 11.44, lng: 77.72 })).toBeCloseTo(270, 0);
  });
});

describe('courseOf', () => {
  const a = { lat: 11.44, lng: 77.73 };
  const east = { lat: 11.44, lng: 77.731 }; // ~109 m east
  const jitter = { lat: 11.44001, lng: 77.73 }; // ~1 m

  it('uses the reported heading when there is one', () => {
    expect(courseOf(200, a, east, 10)).toBe(200);
    expect(courseOf(-90, a, east, 10)).toBe(270);
  });

  it('falls back to the direction of travel when no heading was sent', () => {
    expect(courseOf(null, a, east, 10)).toBeCloseTo(90, 0);
  });

  it('keeps the previous direction when the bus has not really moved', () => {
    expect(courseOf(null, a, jitter, 135)).toBe(135);
    expect(courseOf(undefined, a, a, null)).toBeNull();
  });
});

describe('shortestTurn', () => {
  it('turns the short way across north', () => {
    expect(shortestTurn(350, 10)).toBe(370);
    expect(shortestTurn(10, 350)).toBe(-10);
  });

  it('stays continuous after several turns', () => {
    expect(shortestTurn(370, 90)).toBe(450);
    expect(shortestTurn(-10, 180)).toBe(-180);
  });

  it('leaves a plain turn alone', () => {
    expect(shortestTurn(90, 120)).toBe(120);
  });
});
