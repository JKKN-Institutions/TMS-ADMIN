/**
 * Pure stop-pin logic for the live-tracking maps: which stop the bus is nearest to,
 * which it has passed, and which comes next.
 *
 * Free of Leaflet, React and Supabase so it runs under vitest and in both the browser
 * (the map pages) and the server (the location endpoints).
 */
import { haversineMeters, type LatLng } from '../gps/interpolate';

/** Matches tms_trip.direction: onward = morning run to college, return = evening run home. */
export type TripDirection = 'onward' | 'return';

/** A route stop whose map location a person has confirmed. */
export interface StopPin {
  id: string;
  name: string;
  /** tms_route_stop.sequence_order — 1 is the first pickup of the morning run. */
  order: number;
  lat: number;
  lng: number;
  /** "HH:MM:SS" morning (to-college) time. */
  time: string | null;
  /** "HH:MM:SS" evening (from-college) time. */
  eveningTime: string | null;
  isMajor: boolean;
}

/** plain = direction unknown, so nothing is claimed about passed / next. */
export type StopPinState = 'passed' | 'next' | 'upcoming' | 'plain';

export interface StopProgress {
  /** Index, into the stops array as given, of the stop closest to the bus. */
  nearestIndex: number;
  nearestDistanceM: number;
  /** The bus is standing at (within AT_STOP_RADIUS_M of) the nearest stop. */
  atStop: boolean;
  /**
   * Index of the stop the bus is at or heading to. Null when the direction is unknown,
   * or when the bus is beyond the last stop of the run.
   */
  nextIndex: number | null;
  nextDistanceM: number | null;
  /** One state per stop, in the same order as the input. */
  states: StopPinState[];
}

/** A bus this close to a stop is treated as being AT it. */
export const AT_STOP_RADIUS_M = 150;

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Seconds since midnight, India time, for an instant. */
export function istSecondsOfDay(epochMs: number): number {
  return Math.floor((((epochMs + IST_OFFSET_MS) % DAY_MS) + DAY_MS) % DAY_MS / 1000);
}

/** "07:25:00" or "07:25" -> seconds since midnight; null when unparseable. */
export function clockToSeconds(clock: string | null | undefined): number | null {
  if (!clock) return null;
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(clock);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const s = m[3] ? Number(m[3]) : 0;
  if (h > 23 || min > 59 || s > 59) return null;
  return h * 3600 + min * 60 + s;
}

/**
 * Which way the bus is running. An active trip says so outright. With no trip to ask,
 * fall back to the clock: every route runs to college in the morning and home in the
 * evening, and nothing runs across 1 pm.
 */
export function inferDirection(tripDirection: string | null | undefined, nowMs: number): TripDirection {
  if (tripDirection === 'onward' || tripDirection === 'return') return tripDirection;
  return istSecondsOfDay(nowMs) < 13 * 3600 ? 'onward' : 'return';
}

/** The scheduled clock time at a stop for the given run, as "HH:MM", or null. */
export function scheduledClock(stop: Pick<StopPin, 'time' | 'eveningTime'>, direction: TripDirection | null): string | null {
  const raw = direction === 'return' ? stop.eveningTime : stop.time;
  return raw ? raw.slice(0, 5) : null;
}

/**
 * Distance from point p to the segment a→b in metres, plus how far along the segment
 * the closest point lies (0 = at a, 1 = at b, clamped).
 *
 * Uses a local flat-earth projection around p. Stops on one route sit within a few
 * tens of kilometres, where the error against a great-circle answer is far below the
 * width of a road.
 */
function distanceToSegment(p: LatLng, a: LatLng, b: LatLng): { distanceM: number; t: number } {
  const mPerDegLat = 111_320;
  const mPerDegLng = 111_320 * Math.cos((p.lat * Math.PI) / 180);
  const ax = (a.lng - p.lng) * mPerDegLng;
  const ay = (a.lat - p.lat) * mPerDegLat;
  const bx = (b.lng - p.lng) * mPerDegLng;
  const by = (b.lat - p.lat) * mPerDegLat;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  // p is the origin, so the projection parameter is -(a · d) / |d|².
  const raw = len2 === 0 ? 0 : -(ax * dx + ay * dy) / len2;
  const t = raw < 0 ? 0 : raw > 1 ? 1 : raw;
  const cx = ax + dx * t;
  const cy = ay + dy * t;
  return { distanceM: Math.hypot(cx, cy), t };
}

/**
 * Where the bus is along its stops.
 *
 * With a direction, the stops are walked in travel order and the bus is placed on the
 * leg (stop → next stop) it is closest to: everything up to that leg's first stop is
 * passed, and the leg's second stop is next. Standing at a stop makes THAT stop next,
 * so the pin reads "bus is here" rather than jumping ahead before the bus leaves.
 *
 * Without a direction only the nearest stop is reported — saying which stops are
 * "passed" needs to know which way the bus is going.
 */
export function stopProgress(
  stops: ReadonlyArray<Pick<StopPin, 'lat' | 'lng' | 'order'>>,
  bus: LatLng | null,
  direction: TripDirection | null,
): StopProgress | null {
  if (!bus || stops.length === 0) return null;

  let nearestIndex = 0;
  let nearestDistanceM = Infinity;
  stops.forEach((s, i) => {
    const d = haversineMeters(bus, s);
    if (d < nearestDistanceM) {
      nearestDistanceM = d;
      nearestIndex = i;
    }
  });
  const atStop = nearestDistanceM <= AT_STOP_RADIUS_M;

  if (!direction) {
    return {
      nearestIndex,
      nearestDistanceM,
      atStop,
      nextIndex: null,
      nextDistanceM: null,
      states: stops.map(() => 'plain'),
    };
  }

  // Indices into `stops`, in the order the bus visits them on this run.
  const travel = stops
    .map((s, i) => ({ i, order: s.order }))
    .sort((a, b) => (direction === 'onward' ? a.order - b.order : b.order - a.order))
    .map((x) => x.i);

  // Position in `travel` of the stop the bus is at / heading to; travel.length = past the end.
  let nextPos: number;
  if (atStop) {
    nextPos = travel.indexOf(nearestIndex);
  } else if (travel.length === 1) {
    nextPos = 0;
  } else {
    let bestLeg = 0;
    let bestDist = Infinity;
    let bestT = 0;
    for (let k = 0; k < travel.length - 1; k++) {
      const { distanceM, t } = distanceToSegment(bus, stops[travel[k]], stops[travel[k + 1]]);
      if (distanceM < bestDist) {
        bestDist = distanceM;
        bestLeg = k;
        bestT = t;
      }
    }
    if (bestLeg === 0 && bestT <= 0) nextPos = 0; // still on the way to the first stop
    else if (bestLeg === travel.length - 2 && bestT >= 1) nextPos = travel.length; // beyond the last stop
    else nextPos = bestLeg + 1;
  }

  const states: StopPinState[] = stops.map(() => 'upcoming');
  travel.forEach((stopIndex, pos) => {
    if (pos < nextPos) states[stopIndex] = 'passed';
    else if (pos === nextPos) states[stopIndex] = 'next';
  });

  const nextIndex = nextPos < travel.length ? travel[nextPos] : null;
  return {
    nearestIndex,
    nearestDistanceM,
    atStop,
    nextIndex,
    nextDistanceM: nextIndex == null ? null : haversineMeters(bus, stops[nextIndex]),
    states,
  };
}

/** Metres (to the nearest 10) under 1 km, else one-decimal km. */
export function formatDistance(metres: number): string {
  const rounded = Math.round(metres / 10) * 10;
  return rounded < 1000 ? `${rounded} m` : `${(metres / 1000).toFixed(1)} km`;
}

export interface ProgressSummary {
  /** e.g. "Next stop: KUMARAMANGALAM", "At THIRUCHENGODU". */
  headline: string;
  /** e.g. "1.2 km away · due 07:20". */
  detail: string | null;
}

/** One plain-English line about where the bus is among its stops. */
export function summariseProgress(
  stops: ReadonlyArray<StopPin>,
  progress: StopProgress | null,
  direction: TripDirection | null,
): ProgressSummary | null {
  if (!progress || stops.length === 0) return null;

  if (progress.atStop) {
    const s = stops[progress.nearestIndex];
    const due = scheduledClock(s, direction);
    return { headline: `At ${s.name}`, detail: due ? `Due ${due}` : null };
  }

  if (progress.nextIndex != null && progress.nextDistanceM != null) {
    const s = stops[progress.nextIndex];
    const due = scheduledClock(s, direction);
    return {
      headline: `Next stop: ${s.name}`,
      detail: `${formatDistance(progress.nextDistanceM)} away${due ? ` · due ${due}` : ''}`,
    };
  }

  if (direction) return { headline: 'Past the last stop', detail: null };

  const s = stops[progress.nearestIndex];
  return { headline: `Near ${s.name}`, detail: `${formatDistance(progress.nearestDistanceM)} away` };
}
