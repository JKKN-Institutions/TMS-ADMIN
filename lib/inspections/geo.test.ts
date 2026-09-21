import { describe, it, expect } from 'vitest';
import { distanceMeters, locationEvidence } from './geo';

describe('distanceMeters', () => {
  it('~111 m per 0.001° latitude', () => {
    const d = distanceMeters({ lat: 11.0, lng: 77.0 }, { lat: 11.001, lng: 77.0 });
    expect(d).toBeGreaterThan(105);
    expect(d).toBeLessThan(118);
  });
});

describe('locationEvidence', () => {
  it('unavailable without inspector position', () =>
    expect(locationEvidence(null, { lat: 11, lng: 77 })).toEqual({ location_status: 'unavailable', bus_distance_m: null }));
  it('bus_no_gps without bus position', () =>
    expect(locationEvidence({ lat: 11, lng: 77 }, null)).toEqual({ location_status: 'bus_no_gps', bus_distance_m: null }));
  it('ok with rounded distance', () => {
    const r = locationEvidence({ lat: 11.0, lng: 77.0 }, { lat: 11.001, lng: 77.0 });
    expect(r.location_status).toBe('ok');
    expect(Number.isInteger(r.bus_distance_m)).toBe(true);
  });
});
