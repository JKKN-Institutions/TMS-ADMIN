/**
 * Shared "who booked today" roster helper. Powers the boarding dashboard's
 * today's-bookings list and the driver Boardings view. `groupRosterByStop` is a
 * pure, unit-tested transform; `loadBookedRoster` is its DB companion.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { bookedCount, routeCapacity } from './repo';

export interface RosterRider {
  learner_id: string;
  name: string;
  roll: string | null;
  stop_id: string | null;
}

export interface OrderedStop {
  id: string;
  name: string;
  time: string | null;
  order: number | null;
}

export interface RosterStopGroup {
  stop_id: string | null;
  stop_name: string;
  stop_time: string | null;
  count: number;
  riders: RosterRider[];
}

const isMissingTable = (e: unknown) => (e as { code?: string } | null)?.code === '42P01';

/** Split an id list into ≤150-id chunks (API-gateway limit on `.in()`). */
function chunk<T>(arr: T[], size = 150): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Today's booked riders for one route: reads tms_booking by route_id + travel_date,
 * denormalizes learner name/roll (chunked .in()), plus booked/capacity counts.
 * 42P01-safe: empty roster + zero counts if tms_booking is absent.
 */
export async function loadBookedRoster(
  svc: SupabaseClient,
  routeId: string,
  date: string
): Promise<{ counts: { booked: number; capacity: number }; riders: RosterRider[] }> {
  const { data: bookings, error } = await svc
    .from('tms_booking')
    .select('learner_id, stop_id')
    .eq('route_id', routeId)
    .eq('travel_date', date);
  if (error) {
    if (isMissingTable(error)) return { counts: { booked: 0, capacity: 0 }, riders: [] };
    throw error;
  }

  const stopByLearner = new Map<string, string | null>();
  for (const b of (bookings ?? []) as { learner_id: string; stop_id: string | null }[]) {
    stopByLearner.set(b.learner_id, b.stop_id ?? null);
  }
  const ids = [...stopByLearner.keys()];

  const info = new Map<string, { name: string; roll: string | null }>();
  for (const c of chunk(ids)) {
    const { data } = await svc
      .from('learners_profiles')
      .select('id, first_name, last_name, roll_number')
      .in('id', c);
    for (const l of (data ?? []) as Array<{
      id: string; first_name: string | null; last_name: string | null; roll_number: string | null;
    }>) {
      info.set(l.id, {
        name: `${l.first_name ?? ''} ${l.last_name ?? ''}`.trim() || 'Learner',
        roll: l.roll_number,
      });
    }
  }

  const riders: RosterRider[] = ids.map((id) => ({
    learner_id: id,
    name: info.get(id)?.name ?? 'Learner',
    roll: info.get(id)?.roll ?? null,
    stop_id: stopByLearner.get(id) ?? null,
  }));

  const [booked, capacity] = await Promise.all([
    bookedCount(svc, routeId, date),
    routeCapacity(svc, routeId),
  ]);
  return { counts: { booked, capacity }, riders };
}

/**
 * Pure: group riders by stop in the route's pickup order. Stops with no riders are
 * skipped; riders whose stop_id is null or not in `orderedStops` fall into a trailing
 * "Stop not set" bucket. Riders within a stop are sorted by roll then name.
 */
export function groupRosterByStop(
  riders: RosterRider[],
  orderedStops: OrderedStop[]
): RosterStopGroup[] {
  const UNSET = '__unset__';
  const known = new Set(orderedStops.map((s) => s.id));
  const byStop = new Map<string, RosterRider[]>();
  for (const r of riders) {
    const key = r.stop_id && known.has(r.stop_id) ? r.stop_id : UNSET;
    const arr = byStop.get(key) ?? [];
    arr.push(r);
    byStop.set(key, arr);
  }

  const sortRiders = (a: RosterRider, b: RosterRider) =>
    (a.roll ?? a.name).localeCompare(b.roll ?? b.name, undefined, { numeric: true });

  const groups: RosterStopGroup[] = [];
  for (const s of [...orderedStops].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
    const rs = byStop.get(s.id);
    if (!rs || rs.length === 0) continue;
    groups.push({ stop_id: s.id, stop_name: s.name, stop_time: s.time, count: rs.length, riders: rs.sort(sortRiders) });
  }
  const unset = byStop.get(UNSET);
  if (unset && unset.length > 0) {
    groups.push({ stop_id: null, stop_name: 'Stop not set', stop_time: null, count: unset.length, riders: unset.sort(sortRiders) });
  }
  return groups;
}
