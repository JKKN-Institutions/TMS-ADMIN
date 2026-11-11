/**
 * Database reads for stop pins. Decision logic lives in ./progress and ./suggest (pure,
 * unit-tested); this file only fetches.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { inferDirection, type StopPin, type TripDirection } from './progress';
import type { TripTrack, TrackFix } from './suggest';
import type { TimetableStop } from './arrival';

/** Postgres "undefined column" — the location_confirmed_at migration is not applied yet. */
export const isMissingColumn = (e: unknown) => (e as { code?: string } | null)?.code === '42703';

type StopRow = {
  id: string;
  route_id: string;
  stop_name: string;
  sequence_order: number | null;
  latitude: number | string | null;
  longitude: number | string | null;
  stop_time: string | null;
  evening_time: string | null;
  is_major_stop: boolean | null;
};

/**
 * CONFIRMED stop pins for a set of routes, in route order.
 *
 * Only rows a person has confirmed (location_confirmed_at) are returned: the bare
 * latitude/longitude columns also hold name-lookup guesses that are wrong more often
 * than right, and must never reach a learner's map.
 *
 * Fail-soft: any read error — including the confirm column not existing yet — yields
 * no pins. A tracking map without pins is the behaviour before this feature; a
 * tracking endpoint that 500s because of pins would be a regression.
 */
export async function loadStopPinsByRoute(
  svc: SupabaseClient,
  routeIds: string[],
): Promise<Map<string, StopPin[]>> {
  const out = new Map<string, StopPin[]>();
  const ids = [...new Set(routeIds)].filter(Boolean);
  if (ids.length === 0) return out;

  const { data, error } = await svc
    .from('tms_route_stop')
    .select('id, route_id, stop_name, sequence_order, latitude, longitude, stop_time, evening_time, is_major_stop')
    .in('route_id', ids)
    .eq('is_active', true)
    .not('location_confirmed_at', 'is', null)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .order('sequence_order', { ascending: true });
  if (error) {
    if (!isMissingColumn(error)) console.error('loadStopPinsByRoute failed:', error.message);
    return out;
  }

  for (const s of (data ?? []) as StopRow[]) {
    const lat = Number(s.latitude);
    const lng = Number(s.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const list = out.get(s.route_id) ?? [];
    list.push({
      id: s.id,
      name: s.stop_name,
      order: s.sequence_order ?? list.length + 1,
      lat,
      lng,
      time: s.stop_time,
      eveningTime: s.evening_time,
      isMajor: !!s.is_major_stop,
    });
    out.set(s.route_id, list);
  }
  return out;
}

export async function loadStopPins(svc: SupabaseClient, routeId: string): Promise<StopPin[]> {
  return (await loadStopPinsByRoute(svc, [routeId])).get(routeId) ?? [];
}

/**
 * Which way the route's bus is running: its active trip says so; with no active trip
 * the time of day decides (see inferDirection).
 */
export async function loadTripDirection(
  svc: SupabaseClient,
  routeId: string,
  nowMs: number = Date.now(),
): Promise<TripDirection> {
  const { data } = await svc
    .from('tms_trip')
    .select('direction')
    .eq('route_id', routeId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  return inferDirection((data as { direction?: string } | null)?.direction, nowMs);
}

/** Trips with fewer fixes than this are a driver who tapped START and stopped — no route in them. */
const MIN_FIXES = 50;
const PAGE = 1000;

/**
 * The route's most recent recorded trips (up to `perDirection` each way) with their
 * GPS fixes, for suggesting stop locations.
 *
 * Fixes are paged: a single trip is several hundred rows and PostgREST caps a response,
 * so one unpaged read would silently return a fraction of the data.
 */
export async function loadTripTracks(
  svc: SupabaseClient,
  routeId: string,
  perDirection = 15,
): Promise<TripTrack[]> {
  const { data: tripRows, error: tripErr } = await svc
    .from('tms_trip')
    .select('id, direction, started_at, fix_count')
    .eq('route_id', routeId)
    .gte('fix_count', MIN_FIXES)
    .order('started_at', { ascending: false })
    .limit(perDirection * 8);
  if (tripErr) throw new Error(tripErr.message);

  const chosen: Array<{ id: string; direction: TripDirection }> = [];
  const taken: Record<TripDirection, number> = { onward: 0, return: 0 };
  for (const t of (tripRows ?? []) as Array<{ id: string; direction: string }>) {
    if (t.direction !== 'onward' && t.direction !== 'return') continue;
    if (taken[t.direction] >= perDirection) continue;
    taken[t.direction] += 1;
    chosen.push({ id: t.id, direction: t.direction });
  }
  if (chosen.length === 0) return [];

  const fixesByTrip = new Map<string, TrackFix[]>();
  const ids = chosen.map((c) => c.id);
  for (let from = 0; ; ) {
    const { data, error } = await svc
      .from('gps_location_history')
      .select('id, trip_id, timestamp, latitude, longitude')
      .in('trip_id', ids)
      .order('timestamp', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Array<{
      trip_id: string;
      timestamp: string;
      latitude: number | string;
      longitude: number | string;
    }>;
    if (rows.length === 0) break;
    for (const r of rows) {
      const t = Date.parse(r.timestamp);
      const lat = Number(r.latitude);
      const lng = Number(r.longitude);
      if (Number.isNaN(t) || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const list = fixesByTrip.get(r.trip_id) ?? [];
      list.push({ t, lat, lng });
      fixesByTrip.set(r.trip_id, list);
    }
    // Advance by what actually came back, so a server-side row cap below PAGE can
    // never end the loop early.
    from += rows.length;
  }

  return chosen
    .map((c) => ({ tripId: c.id, direction: c.direction, fixes: fixesByTrip.get(c.id) ?? [] }))
    .filter((t) => t.fixes.length > 0);
}

/**
 * Every active stop on the route in route order — names and times only. Unlike the
 * pins this needs no map location, so a learner sees their stop and its time even on a
 * route whose stops nobody has placed yet. Fail-soft like the pins.
 */
export async function loadTimetable(svc: SupabaseClient, routeId: string): Promise<TimetableStop[]> {
  const { data, error } = await svc
    .from('tms_route_stop')
    .select('id, stop_name, sequence_order, stop_time, evening_time')
    .eq('route_id', routeId)
    .eq('is_active', true)
    .order('sequence_order', { ascending: true });
  if (error) {
    console.error('loadTimetable failed:', error.message);
    return [];
  }
  return ((data ?? []) as Array<Pick<StopRow, 'id' | 'stop_name' | 'sequence_order' | 'stop_time' | 'evening_time'>>).map((s, i) => ({
    id: s.id,
    name: s.stop_name,
    order: s.sequence_order ?? i + 1,
    time: s.stop_time,
    eveningTime: s.evening_time,
  }));
}
