/**
 * Server helper: road route from a live bus position → campus, mapped to a compact
 * RoadRoute and cached by rounded coordinates (4 dp ≈ 11 m, 60 s). A moving bus
 * recomputes its route as it drives, but repeated polls at one spot hit cache.
 * Fail-soft: null when the router is unavailable (the map simply shows no line).
 * Wraps the Track-All OSRM engine; relative imports so it is vitest-resolvable.
 */
import { CAMPUS } from '../gps/campus';
import { routeToCampus, roundCoord, type RouteResult } from './osrm';

export interface RoadRoute {
  geometry: [number, number][];
  distanceKm: number;
  durationMin: number;
}

type RouteFn = (
  lat: number,
  lng: number,
  campus: { lat: number; lng: number },
) => Promise<RouteResult | null>;

interface Entry {
  value: RoadRoute | null;
  expires: number;
}
const cache = new Map<string, Entry>();
const TTL_MS = 60_000;

export async function cachedRouteToCampus(
  lat: number,
  lng: number,
  routeFn: RouteFn = routeToCampus,
): Promise<RoadRoute | null> {
  const key = `${roundCoord(lat)},${roundCoord(lng)}`;
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expires > now) return hit.value;
  const r = await routeFn(lat, lng, { lat: CAMPUS.lat, lng: CAMPUS.lng });
  const value: RoadRoute | null = r
    ? { geometry: r.geometry, distanceKm: r.distanceKm, durationMin: r.durationMin }
    : null;
  cache.set(key, { value, expires: now + TTL_MS });
  return value;
}
