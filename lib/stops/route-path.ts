/**
 * The line a route's bus actually drives, taken from its most recent full recorded
 * trip in the same direction.
 *
 * No route shape is stored anywhere, and a routing service would only guess: it does
 * not know the college gate, the village lanes or the turn the driver really takes.
 * The GPS history of a past trip does. Routes that have never recorded a trip simply
 * have no line.
 *
 * Reads only; nothing is written. Results are cached in memory, because a route's
 * road does not change between one request and the next.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { TripDirection } from './progress';
import { downsampleTrack, type TrackFix } from './suggest';

/** A trip shorter than this is a false start, not the route. */
const MIN_FIXES = 200;
const PAGE = 1000;
const MAX_POINTS = 260;
const TTL_MS = 6 * 60 * 60_000;

export interface RoutePath {
  /** [lat, lng] points along the road, in travel order. */
  points: [number, number][];
  /** When the trip the line comes from was driven (ISO). */
  recordedAt: string;
}

const cache = new Map<string, { at: number; value: RoutePath | null }>();

export async function loadRoutePath(
  svc: SupabaseClient,
  routeId: string,
  direction: TripDirection,
  nowMs: number = Date.now(),
): Promise<RoutePath | null> {
  const key = `${routeId}:${direction}`;
  const hit = cache.get(key);
  if (hit && nowMs - hit.at < TTL_MS) return hit.value;

  try {
    const { data: trips, error: tripErr } = await svc
      .from('tms_trip')
      .select('id, started_at, fix_count')
      .eq('route_id', routeId)
      .eq('direction', direction)
      .gte('fix_count', MIN_FIXES)
      .not('ended_at', 'is', null)
      .order('started_at', { ascending: false })
      .limit(1);
    if (tripErr) throw new Error(tripErr.message);
    const trip = (trips ?? [])[0] as { id: string; started_at: string } | undefined;
    if (!trip) {
      cache.set(key, { at: nowMs, value: null });
      return null;
    }

    const fixes: TrackFix[] = [];
    for (let from = 0; ; ) {
      const { data, error } = await svc
        .from('gps_location_history')
        .select('id, timestamp, latitude, longitude')
        .eq('trip_id', trip.id)
        .order('timestamp', { ascending: true })
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as Array<{ timestamp: string; latitude: number | string; longitude: number | string }>;
      if (rows.length === 0) break;
      for (const r of rows) {
        const t = Date.parse(r.timestamp);
        const lat = Number(r.latitude);
        const lng = Number(r.longitude);
        if (!Number.isNaN(t) && Number.isFinite(lat) && Number.isFinite(lng)) fixes.push({ t, lat, lng });
      }
      from += rows.length;
    }

    const points = downsampleTrack(fixes, MAX_POINTS);
    const value = points.length > 1 ? { points, recordedAt: trip.started_at } : null;
    cache.set(key, { at: nowMs, value });
    return value;
  } catch (e) {
    // A map without a route line is how every map looked before this; never let the
    // line take a tracking endpoint down. Not cached, so the next request retries.
    console.error('loadRoutePath failed:', e instanceof Error ? e.message : e);
    return null;
  }
}
