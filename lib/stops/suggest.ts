/**
 * Suggest where a route's stops are, from the trips its bus has already driven.
 *
 * Looking a stop up by name does not work here: measured on route 31, 2 of 22 stops
 * landed within 1.5 km and four were 29–68 km out. The bus, on the other hand, drives
 * past every stop twice a day and its phone records where. Two signals come out of
 * that record:
 *
 *   1. SCHEDULE — where the bus usually is at the stop's timetabled minute. Robust
 *      (a median over many days) but only as exact as the bus is punctual: a few
 *      hundred metres on a typical day.
 *   2. HALT — places near that point where the bus habitually comes to a standstill.
 *      A stop is where a bus stops, so a spot it halts at trip after trip pins the
 *      stop to within a bus length.
 *
 * Each suggestion is the habitual halt nearest the scheduled point when there is one,
 * else the scheduled point itself. They are SUGGESTIONS: a person reviews them on the
 * map and saves — nothing here writes anything.
 *
 * Pure (no I/O) so the behaviour is pinned by tests.
 */
import { haversineMeters, type LatLng } from '../gps/interpolate';
import { clockToSeconds, istSecondsOfDay, type TripDirection } from './progress';

export interface TrackFix {
  /** Capture time, epoch milliseconds. */
  t: number;
  lat: number;
  lng: number;
}

export interface TripTrack {
  tripId: string;
  direction: TripDirection;
  /** In time order. */
  fixes: TrackFix[];
}

export interface StopSchedule {
  id: string;
  /** "HH:MM:SS" morning (onward) time. */
  time: string | null;
  /** "HH:MM:SS" evening (return) time. */
  eveningTime: string | null;
}

export interface StopSuggestion {
  stopId: string;
  lat: number;
  lng: number;
  /** How many recorded trips back this position. */
  trips: number;
  /** halt = the bus habitually stops here; schedule = where it usually is at the stop's time. */
  basis: 'halt' | 'schedule';
}

/** Fixes within this many seconds of the timetabled minute count as "at the stop's time". */
const SCHEDULE_WINDOW_S = 60;
/** Fewer trips than this and a median means nothing. */
const MIN_TRIPS = 3;
/** A bus that stays inside this radius… */
const HALT_RADIUS_M = 20;
/** …for at least this long has halted (two 6-second fixes apart is the minimum signal). */
const HALT_MIN_MS = 12_000;
/** A habitual halt must be this close to the scheduled point to be taken as the stop. */
const SNAP_RADIUS_M = 400;
/** Halts this close together are the same stopping place. */
const CLUSTER_RADIUS_M = 60;
/** Two stops cannot share one halt; suggestions closer than this are a collision. */
const SAME_PLACE_M = 40;

interface Halt extends LatLng {
  tripId: string;
}

function mean(points: ReadonlyArray<LatLng>): LatLng {
  let lat = 0;
  let lng = 0;
  for (const p of points) {
    lat += p.lat;
    lng += p.lng;
  }
  return { lat: lat / points.length, lng: lng / points.length };
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Every place the bus stood still on one trip. */
export function haltsOf(track: TripTrack): Halt[] {
  const f = track.fixes;
  const out: Halt[] = [];
  let i = 0;
  while (i < f.length) {
    let j = i + 1;
    while (j < f.length && haversineMeters(f[i], f[j]) <= HALT_RADIUS_M) j++;
    if (j - i >= 2 && f[j - 1].t - f[i].t >= HALT_MIN_MS) {
      out.push({ ...mean(f.slice(i, j)), tripId: track.tripId });
      i = j;
    } else {
      i++;
    }
  }
  return out;
}

/** Where the bus was, on each trip, at the timetabled second-of-day. One point per trip. */
function scheduledPoints(tracks: ReadonlyArray<TripTrack>, scheduledS: number): LatLng[] {
  const out: LatLng[] = [];
  for (const tr of tracks) {
    const near = tr.fixes.filter((x) => Math.abs(istSecondsOfDay(x.t) - scheduledS) <= SCHEDULE_WINDOW_S);
    if (near.length > 0) out.push(mean(near));
  }
  return out;
}

interface Cluster extends LatLng {
  trips: Set<string>;
  n: number;
}

/** The stopping place near `centre` that the most trips share, if enough of them do. */
function habitualHalt(halts: ReadonlyArray<Halt>, centre: LatLng, minTrips: number): Cluster | null {
  const clusters: Cluster[] = [];
  for (const h of halts) {
    if (haversineMeters(h, centre) > SNAP_RADIUS_M) continue;
    const c = clusters.find((x) => haversineMeters(x, h) <= CLUSTER_RADIUS_M);
    if (c) {
      c.lat = (c.lat * c.n + h.lat) / (c.n + 1);
      c.lng = (c.lng * c.n + h.lng) / (c.n + 1);
      c.n += 1;
      c.trips.add(h.tripId);
    } else {
      clusters.push({ lat: h.lat, lng: h.lng, n: 1, trips: new Set([h.tripId]) });
    }
  }
  let best: Cluster | null = null;
  for (const c of clusters) {
    if (c.trips.size < minTrips) continue;
    if (
      !best ||
      c.trips.size > best.trips.size ||
      (c.trips.size === best.trips.size && haversineMeters(c, centre) < haversineMeters(best, centre))
    ) {
      best = c;
    }
  }
  return best;
}

interface Working extends StopSuggestion {
  /** The scheduled point, kept so a collision can fall back to it. */
  scheduled: LatLng;
  scheduledTrips: number;
}

export function suggestStopLocations(
  stops: ReadonlyArray<StopSchedule>,
  tracks: ReadonlyArray<TripTrack>,
): StopSuggestion[] {
  const byDirection: Record<TripDirection, TripTrack[]> = { onward: [], return: [] };
  for (const t of tracks) if (t.fixes.length > 0) byDirection[t.direction].push(t);
  const halts: Record<TripDirection, Halt[]> = {
    onward: byDirection.onward.flatMap(haltsOf),
    return: byDirection.return.flatMap(haltsOf),
  };

  const working: Working[] = [];
  for (const stop of stops) {
    // The morning timetable is the one the office maintains closely, so it goes first;
    // the evening run is the fallback for a stop the morning data does not cover.
    const options: Array<[TripDirection, number | null]> = [
      ['onward', clockToSeconds(stop.time)],
      ['return', clockToSeconds(stop.eveningTime)],
    ];
    for (const [direction, scheduledS] of options) {
      if (scheduledS == null) continue;
      const points = scheduledPoints(byDirection[direction], scheduledS);
      if (points.length < MIN_TRIPS) continue;

      const scheduled: LatLng = {
        lat: median(points.map((p) => p.lat)),
        lng: median(points.map((p) => p.lng)),
      };
      const need = Math.max(MIN_TRIPS, Math.ceil(points.length * 0.2));
      const halt = habitualHalt(halts[direction], scheduled, need);
      working.push(
        halt
          ? { stopId: stop.id, lat: halt.lat, lng: halt.lng, trips: halt.trips.size, basis: 'halt', scheduled, scheduledTrips: points.length }
          : { stopId: stop.id, lat: scheduled.lat, lng: scheduled.lng, trips: points.length, basis: 'schedule', scheduled, scheduledTrips: points.length },
      );
      break;
    }
  }

  // Two stops a minute apart can both reach for the same busy junction. Only the one
  // whose scheduled point is closer keeps the halt; the other returns to its own
  // scheduled point rather than being stacked on top.
  for (let a = 0; a < working.length; a++) {
    for (let b = a + 1; b < working.length; b++) {
      const A = working[a];
      const B = working[b];
      if (A.basis !== 'halt' || B.basis !== 'halt') continue;
      if (haversineMeters(A, B) > SAME_PLACE_M) continue;
      const loser = haversineMeters(A.scheduled, A) <= haversineMeters(B.scheduled, B) ? B : A;
      loser.lat = loser.scheduled.lat;
      loser.lng = loser.scheduled.lng;
      loser.trips = loser.scheduledTrips;
      loser.basis = 'schedule';
    }
  }

  return working.map(({ stopId, lat, lng, trips, basis }) => ({
    stopId,
    lat: Math.round(lat * 1e6) / 1e6,
    lng: Math.round(lng * 1e6) / 1e6,
    trips,
    basis,
  }));
}

/** Thin a recorded trip to at most `maxPoints` for drawing as a guide line. */
export function downsampleTrack(fixes: ReadonlyArray<TrackFix>, maxPoints = 300): [number, number][] {
  if (fixes.length === 0) return [];
  const step = Math.max(1, Math.ceil(fixes.length / maxPoints));
  const out: [number, number][] = [];
  for (let i = 0; i < fixes.length; i += step) out.push([fixes[i].lat, fixes[i].lng]);
  const last = fixes[fixes.length - 1];
  const tail = out[out.length - 1];
  if (tail[0] !== last.lat || tail[1] !== last.lng) out.push([last.lat, last.lng]);
  return out;
}
