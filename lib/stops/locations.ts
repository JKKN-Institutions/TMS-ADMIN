/**
 * Validation for saving stop map locations (Routes -> Stop locations).
 * Pure, so the rules are unit-tested rather than discovered in production.
 */
import { haversineMeters } from '../gps/interpolate';
import { CAMPUS } from '../gps/campus';

/**
 * No route reaches further than about 60 km from campus (Tiruppur, Gobi). Anything
 * beyond this is a mis-click or a mistyped number, and is exactly the mistake that
 * put two "COLLEGE" stops in Chennai.
 */
export const SERVICE_RADIUS_KM = 150;

export function isInServiceRegion(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  return haversineMeters({ lat, lng }, CAMPUS) <= SERVICE_RADIUS_KM * 1000;
}

/** ~11 cm — finer than any GPS fix, and keeps stored values tidy. */
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

export interface LocationUpdate {
  stopId: string;
  lat: number;
  lng: number;
}

export interface LocationChanges {
  /** Stops to place (or move) on the map. */
  set: LocationUpdate[];
  /** Stops whose map location is removed. */
  clear: string[];
}

export type ParseResult = { ok: true; value: LocationChanges } | { ok: false; error: string };

const MAX_CHANGES = 200;

/**
 * Parse the body of PUT /api/admin/routes/[routeId]/stop-locations.
 *
 * `routeStopIds` is the set of stops that belong to the route in the URL, so a body
 * can never move a stop on some other route.
 */
export function parseLocationChanges(body: unknown, routeStopIds: ReadonlySet<string>): ParseResult {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Nothing to save.' };
  const raw = body as { set?: unknown; clear?: unknown };
  const rawSet = raw.set ?? [];
  const rawClear = raw.clear ?? [];
  if (!Array.isArray(rawSet) || !Array.isArray(rawClear)) {
    return { ok: false, error: 'Stop locations were sent in the wrong format.' };
  }
  if (rawSet.length + rawClear.length === 0) return { ok: false, error: 'Nothing to save.' };
  if (rawSet.length + rawClear.length > MAX_CHANGES) {
    return { ok: false, error: `Too many changes at once (limit ${MAX_CHANGES}).` };
  }

  const seen = new Set<string>();
  const set: LocationUpdate[] = [];
  for (const item of rawSet) {
    const u = item as { stopId?: unknown; lat?: unknown; lng?: unknown } | null;
    const stopId = typeof u?.stopId === 'string' ? u.stopId : null;
    if (!stopId || !routeStopIds.has(stopId)) {
      return { ok: false, error: 'One of the stops does not belong to this route.' };
    }
    if (seen.has(stopId)) return { ok: false, error: 'A stop was sent twice.' };
    seen.add(stopId);
    if (typeof u?.lat !== 'number' || typeof u?.lng !== 'number' || !isInServiceRegion(u.lat, u.lng)) {
      return {
        ok: false,
        error: `A stop was placed more than ${SERVICE_RADIUS_KM} km from campus. Move it onto the route and save again.`,
      };
    }
    set.push({ stopId, lat: round6(u.lat), lng: round6(u.lng) });
  }

  const clear: string[] = [];
  for (const item of rawClear) {
    if (typeof item !== 'string' || !routeStopIds.has(item)) {
      return { ok: false, error: 'One of the stops does not belong to this route.' };
    }
    if (seen.has(item)) return { ok: false, error: 'A stop was sent twice.' };
    seen.add(item);
    clear.push(item);
  }

  return { ok: true, value: { set, clear } };
}
