import { describe, it, expect } from 'vitest';
import { mapPluginLocationToFix } from './background-location';

describe('mapPluginLocationToFix', () => {
  it('maps plugin fields to the DriverFix shape', () => {
    const out = mapPluginLocationToFix({
      latitude: 11.44, longitude: 77.72, accuracy: 8, speed: 4.2, bearing: 90, time: 1_700_000_000_000,
    });
    expect(out).toEqual({
      lat: 11.44, lng: 77.72, accuracy: 8, speed: 4.2, heading: 90, timestamp: 1_700_000_000_000,
    });
  });

  it('nulls missing optional fields and defaults timestamp when absent', () => {
    const out = mapPluginLocationToFix({ latitude: 1, longitude: 2 });
    expect(out.accuracy).toBeNull();
    expect(out.speed).toBeNull();
    expect(out.heading).toBeNull();
    expect(typeof out.timestamp).toBe('number');
  });
});
