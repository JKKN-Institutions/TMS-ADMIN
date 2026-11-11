/**
 * "When does the bus reach MY stop?" — the one question a learner opens Live Track to
 * answer.
 *
 * The estimate is the timetable plus the bus's current delay: work out how late (or
 * early) the bus will be at the stop it is heading to now, and assume it is that late
 * at every later stop. This stays steady while the bus halts at a stop, where an
 * estimate from the bus's instantaneous speed drops to nothing.
 *
 * Pure: no Leaflet, React or Supabase.
 */
import {
  clockToSeconds,
  istSecondsOfDay,
  type StopPin,
  type StopProgress,
  type TripDirection,
} from './progress';

/** One row of the route's timetable, located on the map or not. */
export interface TimetableStop {
  id: string;
  name: string;
  order: number;
  time: string | null;
  eveningTime: string | null;
}

/** Average road speed assumed between the bus and its next stop. */
export const ASSUMED_KMH = 25;
/** Roads are longer than the straight line between two points. */
export const ROAD_FACTOR = 1.3;
/** A computed delay outside this range means the data is off, not the bus: ignore it. */
const MAX_EARLY_MIN = 15;
const MAX_LATE_MIN = 120;

export interface StopArrival {
  /** Timetable time at the stop for this run, "HH:MM", or null when none is set. */
  scheduled: string | null;
  /** Estimated time at the stop, "HH:MM". Null when it cannot be estimated. */
  eta: string | null;
  /** Minutes behind (+) or ahead of (−) the timetable. Null when unknown. */
  delayMin: number | null;
  /** Stops between the bus and this stop, counting this stop. 0 = the bus is here. Null when unknown. */
  stopsAway: number | null;
  /** The bus has already gone past this stop on this run. */
  passed: boolean;
}

function clock(seconds: number): string {
  const s = ((Math.round(seconds) % 86400) + 86400) % 86400;
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
}

const runTime = (s: { time: string | null; eveningTime: string | null }, d: TripDirection) =>
  d === 'return' ? s.eveningTime : s.time;

/**
 * Arrival at `myStopId`.
 *
 * `pins` are the stops with a confirmed map location (what `progress` was computed
 * from, in the same order); `timetable` is every stop on the route. The learner's own
 * stop only needs to be in the timetable — it does not need a map location.
 *
 * With no live bus (`progress` null) only the timetable time is returned.
 */
export function estimateArrival(input: {
  timetable: ReadonlyArray<TimetableStop>;
  pins: ReadonlyArray<StopPin>;
  progress: StopProgress | null;
  direction: TripDirection;
  myStopId: string | null | undefined;
  nowMs: number;
}): StopArrival | null {
  const { timetable, pins, progress, direction, myStopId, nowMs } = input;
  const mine = myStopId ? timetable.find((s) => s.id === myStopId) : undefined;
  if (!mine) return null;

  const scheduledRaw = runTime(mine, direction);
  const scheduled = scheduledRaw ? scheduledRaw.slice(0, 5) : null;
  const base: StopArrival = { scheduled, eta: null, delayMin: null, stopsAway: null, passed: false };

  if (!progress) return base;
  // Position of a stop in the order the bus visits them on this run.
  const pos = (order: number) => (direction === 'onward' ? order : -order);

  if (progress.nextIndex == null) {
    // Beyond the last located stop: everything located is behind the bus.
    const last = pins.length ? Math.max(...pins.map((p) => pos(p.order))) : null;
    return last != null && pos(mine.order) <= last ? { ...base, passed: true } : base;
  }

  const next = pins[progress.nextIndex];
  if (pos(mine.order) < pos(next.order)) return { ...base, passed: true };

  // 1 = my stop is the very next one; 0 = the bus is standing at it.
  const stopsAway = timetable.filter((s) => pos(s.order) >= pos(next.order) && pos(s.order) <= pos(mine.order)).length;
  const away = next.id === mine.id && progress.atStop ? 0 : stopsAway;

  const nowSec = istSecondsOfDay(nowMs);
  const travelSec = progress.atStop
    ? 0
    : (((progress.nextDistanceM ?? 0) / 1000) * ROAD_FACTOR / ASSUMED_KMH) * 3600;
  const reachNextSec = nowSec + travelSec;

  // My stop is the one the bus is heading to: the answer is simply when it gets there.
  if (next.id === mine.id) {
    const sched = clockToSeconds(scheduledRaw);
    const delay = sched != null ? Math.round((reachNextSec - sched) / 60) : null;
    return { ...base, eta: clock(reachNextSec), delayMin: usable(delay), stopsAway: away };
  }

  const nextSched = clockToSeconds(runTime(next, direction));
  const mySched = clockToSeconds(scheduledRaw);
  if (nextSched == null || mySched == null) return { ...base, stopsAway: away };

  const delay = usable(Math.round((reachNextSec - nextSched) / 60));
  if (delay == null) return { ...base, stopsAway: away };
  return { ...base, eta: clock(mySched + delay * 60), delayMin: delay, stopsAway: away };
}

function usable(delayMin: number | null): number | null {
  if (delayMin == null) return null;
  return delayMin < -MAX_EARLY_MIN || delayMin > MAX_LATE_MIN ? null : delayMin;
}

/** "6 min late" / "3 min early" / "on time". */
export function delayText(delayMin: number | null): string | null {
  if (delayMin == null) return null;
  if (Math.abs(delayMin) <= 1) return 'on time';
  return delayMin > 0 ? `${delayMin} min late` : `${-delayMin} min early`;
}
