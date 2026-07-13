import { describe, it, expect, vi } from 'vitest';
import { cachedRouteToCampus } from './route-to-campus';

const fakeRoute = {
  geometry: [[11.4, 77.7], [11.44, 77.73]] as [number, number][],
  distanceKm: 5,
  durationMin: 10,
  origin: { lat: 11.4, lng: 77.7, snapDistanceM: 0 },
};

describe('cachedRouteToCampus', () => {
  it('maps the OSRM result to a RoadRoute (drops origin)', async () => {
    const routeFn = vi.fn().mockResolvedValue(fakeRoute);
    const r = await cachedRouteToCampus(11.11, 77.11, routeFn);
    expect(r).toEqual({ geometry: fakeRoute.geometry, distanceKm: 5, durationMin: 10 });
    expect(routeFn).toHaveBeenCalledTimes(1);
  });

  it('caches by rounded coords — a nearby second call within TTL does not re-call', async () => {
    const routeFn = vi.fn().mockResolvedValue(fakeRoute);
    await cachedRouteToCampus(22.22, 78.22, routeFn);
    await cachedRouteToCampus(22.22001, 78.22001, routeFn); // same 4-dp bucket
    expect(routeFn).toHaveBeenCalledTimes(1);
  });

  it('returns null when the router returns null (fail-soft)', async () => {
    const routeFn = vi.fn().mockResolvedValue(null);
    expect(await cachedRouteToCampus(33.33, 79.33, routeFn)).toBeNull();
  });
});
