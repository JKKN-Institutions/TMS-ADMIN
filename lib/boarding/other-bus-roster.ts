/**
 * other-bus-roster — marks the learners on one bus's attendance list whose day
 * involves another bus, and adds the learners from other buses who were
 * recorded boarding this one. See lib/boarding/wrong-bus.ts for the rules.
 *
 * The merge is pure (mergeOtherBuses) so it is tested without a database; the
 * loader around it does the three lookups it needs.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { OtherBus, RosterRider } from '@/lib/booking/roster';

export interface OtherBusFacts {
  /** learner_id -> the bus they booked today, only when it is NOT this bus. */
  bookedElsewhere: Map<string, string>;
  /** learner_id -> the bus they were recorded on, only when it is NOT this bus. */
  boardedElsewhere: Map<string, string>;
  /** Learners recorded on this bus who are not on its list. */
  strangers: Array<{
    learner_id: string;
    name: string;
    roll: string | null;
    stop_id: string | null;
    allocatedRouteId: string | null;
  }>;
  /** route_id -> route number, for every bus named above. */
  routeNumbers: Map<string, string | null>;
}

export function mergeOtherBuses(riders: RosterRider[], facts: OtherBusFacts): RosterRider[] {
  const tag = (kind: OtherBus['kind'], routeId: string): OtherBus => ({
    kind,
    routeId,
    routeNumber: facts.routeNumbers.get(routeId) ?? null,
  });

  const out: RosterRider[] = riders.map((r) => {
    const boarded = facts.boardedElsewhere.get(r.learner_id);
    if (boarded) return { ...r, other_bus: tag('boarded', boarded) };
    // Only an unbooked rider can have booked elsewhere: one booking a day.
    const booked = r.booked === false ? facts.bookedElsewhere.get(r.learner_id) : undefined;
    if (booked) return { ...r, other_bus: tag('booked', booked) };
    return r;
  });

  const listed = new Set(riders.map((r) => r.learner_id));
  for (const s of facts.strangers) {
    if (listed.has(s.learner_id)) continue;
    const booked = facts.bookedElsewhere.get(s.learner_id);
    const other = booked ? tag('booked', booked) : s.allocatedRouteId ? tag('from', s.allocatedRouteId) : null;
    out.push({
      learner_id: s.learner_id,
      name: s.name,
      roll: s.roll,
      stop_id: s.stop_id,
      booked: false,
      other_bus: other,
    });
  }
  return out;
}

const CHUNK = 150;
function chunks<T>(arr: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += CHUNK) out.push(arr.slice(i, i + CHUNK));
  return out;
}

/**
 * Load the facts for one bus and merge them in. Best-effort: a failed lookup
 * leaves the list as it was (no tags), never fails the roster.
 */
export async function withOtherBuses(
  svc: SupabaseClient,
  routeId: string,
  riders: RosterRider[],
  opts: {
    date: string;
    direction: 'onward' | 'return';
    /** Attendance rows on THIS bus for the day and trip. */
    recordedHere: Array<{ learner_id: string; stop_id: string | null }>;
  },
): Promise<RosterRider[]> {
  try {
    const listed = new Set(riders.map((r) => r.learner_id));
    const strangerRows = opts.recordedHere.filter((a) => !listed.has(a.learner_id));
    const strangerIds = [...new Set(strangerRows.map((a) => a.learner_id))];
    const unbookedIds = riders.filter((r) => r.booked === false).map((r) => r.learner_id);
    const riderIds = riders.map((r) => r.learner_id);

    const facts: OtherBusFacts = {
      bookedElsewhere: new Map(),
      boardedElsewhere: new Map(),
      strangers: [],
      routeNumbers: new Map(),
    };

    const bookingLookups = chunks([...unbookedIds, ...strangerIds]).map(async (c) => {
      const { data, error } = await svc
        .from('tms_booking')
        .select('learner_id, route_id')
        .eq('travel_date', opts.date)
        .in('learner_id', c);
      if (error) throw error;
      for (const b of (data ?? []) as Array<{ learner_id: string; route_id: string }>) {
        if (b.route_id !== routeId) facts.bookedElsewhere.set(b.learner_id, b.route_id);
      }
    });
    const boardedLookups = chunks(riderIds).map(async (c) => {
      const { data, error } = await svc
        .from('tms_attendance')
        .select('learner_id, route_id')
        .eq('trip_date', opts.date)
        .eq('direction', opts.direction)
        // Present only: the auto-absent job writes absences on the BOOKED
        // bus, and that is not a boarding anywhere.
        .eq('status', 'present')
        .neq('route_id', routeId)
        .in('learner_id', c);
      if (error) throw error;
      for (const a of (data ?? []) as Array<{ learner_id: string; route_id: string }>) {
        facts.boardedElsewhere.set(a.learner_id, a.route_id);
      }
    });
    const stopByStranger = new Map(strangerRows.map((a) => [a.learner_id, a.stop_id] as const));
    const strangerLookups = chunks(strangerIds).map(async (c) => {
      const { data, error } = await svc
        .from('learners_profiles')
        .select('id, first_name, last_name, roll_number, transport_route_id')
        .in('id', c);
      if (error) throw error;
      for (const l of (data ?? []) as Array<{
        id: string; first_name: string | null; last_name: string | null;
        roll_number: string | null; transport_route_id: string | null;
      }>) {
        facts.strangers.push({
          learner_id: l.id,
          name: `${l.first_name ?? ''} ${l.last_name ?? ''}`.trim() || 'Learner',
          roll: l.roll_number,
          stop_id: stopByStranger.get(l.id) ?? null,
          allocatedRouteId: l.transport_route_id,
        });
      }
    });
    await Promise.all([...bookingLookups, ...boardedLookups, ...strangerLookups]);

    const namedIds = new Set<string>([
      ...facts.bookedElsewhere.values(),
      ...facts.boardedElsewhere.values(),
      ...facts.strangers.map((s) => s.allocatedRouteId).filter((id): id is string => !!id),
    ]);
    if (namedIds.size > 0) {
      const { data, error } = await svc.from('tms_route').select('id, route_number').in('id', [...namedIds]);
      if (error) throw error;
      for (const r of (data ?? []) as Array<{ id: string; route_number: string | null }>) {
        facts.routeNumbers.set(r.id, r.route_number);
      }
    }

    return mergeOtherBuses(riders, facts);
  } catch (e) {
    console.error('boarding roster: other-bus lookup failed (non-fatal):', e);
    return riders;
  }
}
