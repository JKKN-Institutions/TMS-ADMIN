import { describe, it, expect } from 'vitest';
import { haversineKm, bearingDeg, angleDelta, isApproaching, etaMinutes } from './distance';
import { CAMPUS } from './campus';

describe('haversineKm', () => {
  it('is zero for the same point', () => {
    expect(haversineKm(CAMPUS, CAMPUS)).toBeCloseTo(0, 6);
  });
  it('is ~111 km for one degree of latitude', () => {
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeGreaterThan(110);
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeLessThan(112);
  });
});

describe('bearingDeg', () => {
  it('points ~north (0°) for a due-north target', () => {
    expect(bearingDeg({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(0, 1);
  });
  it('points ~east (90°) for a due-east target', () => {
    expect(bearingDeg({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(90, 1);
  });
  it('points ~south (180°) for a due-south target', () => {
    expect(bearingDeg({ lat: 0, lng: 0 }, { lat: -1, lng: 0 })).toBeCloseTo(180, 1);
  });
});

describe('angleDelta', () => {
  it('wraps around 360 (350 vs 10 = 20)', () => {
    expect(angleDelta(350, 10)).toBeCloseTo(20, 6);
  });
  it('is symmetric and <= 180', () => {
    expect(angleDelta(10, 200)).toBeLessThanOrEqual(180);
  });
});

describe('isApproaching', () => {
  it('true when heading is within 90° of the bearing to target', () => {
    expect(isApproaching(0, 45)).toBe(true);
    expect(isApproaching(0, 90)).toBe(true); // boundary inclusive
  });
  it('false when heading points away (>90°)', () => {
    expect(isApproaching(0, 180)).toBe(false);
    expect(isApproaching(0, 91)).toBe(false);
  });
  it('false when heading is unknown', () => {
    expect(isApproaching(null, 45)).toBe(false);
  });
});

describe('etaMinutes', () => {
  it('is null when idle/too slow', () => {
    expect(etaMinutes(10, 0)).toBeNull();
    expect(etaMinutes(10, null)).toBeNull();
  });
  it('applies the road factor (10km @ 30km/h ≈ 26 min)', () => {
    expect(etaMinutes(10, 30)).toBe(26);
  });
});
