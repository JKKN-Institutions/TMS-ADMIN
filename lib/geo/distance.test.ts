import { describe, it, expect } from 'vitest';
import { haversineKm } from './distance';

describe('haversineKm', () => {
  it('is zero for the same point', () => {
    expect(haversineKm({ lat: 11.0, long: 77.0 }, { lat: 11.0, long: 77.0 })).toBe(0);
  });
  it('is symmetric', () => {
    const a = { lat: 11.0, long: 77.0 };
    const b = { lat: 11.5, long: 77.5 };
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 6);
  });
  it('matches a known distance (Chennai ↔ Bangalore ≈ 290 km)', () => {
    const chennai = { lat: 13.0827, long: 80.2707 };
    const bangalore = { lat: 12.9716, long: 77.5946 };
    const km = haversineKm(chennai, bangalore);
    expect(km).toBeGreaterThan(280);
    expect(km).toBeLessThan(300);
  });
  it('about 1.1 km for ~0.01° latitude apart', () => {
    const km = haversineKm({ lat: 11.0, long: 77.0 }, { lat: 11.01, long: 77.0 });
    expect(km).toBeGreaterThan(1.0);
    expect(km).toBeLessThan(1.2);
  });
});
