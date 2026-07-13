import { describe, it, expect, vi } from 'vitest';
import { snapToRoad, routeToCampus, roundCoord, shouldUseSnap } from './osrm';

const ok = (body: unknown) => ({ ok: true, json: async () => body }) as unknown as Response;

describe('roundCoord', () => {
  it('rounds to 4 dp by default (~11 m)', () => {
    expect(roundCoord(11.4444567)).toBe(11.4445);
    expect(roundCoord(77.730258)).toBe(77.7303);
  });
});

describe('shouldUseSnap', () => {
  it('accepts snaps within the 60 m guard', () => {
    expect(shouldUseSnap(0)).toBe(true);
    expect(shouldUseSnap(60)).toBe(true);
  });
  it('rejects far snaps and non-finite distances', () => {
    expect(shouldUseSnap(61)).toBe(false);
    expect(shouldUseSnap(Number.NaN)).toBe(false);
  });
});

describe('snapToRoad', () => {
  it('returns the snapped point with its distance', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({
      code: 'Ok', waypoints: [{ location: [77.7303, 11.4445], distance: 12.5 }],
    }));
    const r = await snapToRoad(11.4444, 77.7302, fetchImpl);
    expect(r).toEqual({ lat: 11.4445, lng: 77.7303, snapDistanceM: 12.5 });
  });
  it('returns null on a non-Ok OSRM code', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ code: 'NoSegment', waypoints: [] }));
    expect(await snapToRoad(0, 0, fetchImpl)).toBeNull();
  });
  it('returns null on a thrown fetch', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('boom'));
    expect(await snapToRoad(0, 0, fetchImpl)).toBeNull();
  });
});

describe('routeToCampus', () => {
  const campus = { lat: 11.4444567, lng: 77.730258 };
  it('parses geometry to [lat,lng], km, minutes and snapped origin', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({
      code: 'Ok',
      routes: [{ geometry: { coordinates: [[77.70, 11.40], [77.72, 11.42]] }, distance: 5000, duration: 600 }],
      waypoints: [{ location: [77.7009, 11.4009], distance: 8 }],
    }));
    const r = await routeToCampus(11.40, 77.70, campus, fetchImpl);
    expect(r?.geometry).toEqual([[11.40, 77.70], [11.42, 77.72]]);
    expect(r?.distanceKm).toBeCloseTo(5, 6);
    expect(r?.durationMin).toBe(10);
    expect(r?.origin).toEqual({ lat: 11.4009, lng: 77.7009, snapDistanceM: 8 });
  });
  it('returns null when OSRM finds no route', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ code: 'NoRoute', routes: [] }));
    expect(await routeToCampus(0, 0, campus, fetchImpl)).toBeNull();
  });
});
