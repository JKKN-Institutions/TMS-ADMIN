/**
 * DB companion to lib/boarding/share-split.ts.
 *
 * Gathers a route's students, its in-charges and their own boarding stops,
 * hands them to the pure splitter, and replaces the route's allocation rows.
 *
 * Recompute is EXPLICIT, never scheduled. Callers are the staff-route
 * assignment API, the enrollment-request approve/reject path, the admin
 * Rebalance button and the nightly reconcile. A stable share is what lets an
 * in-charge learn who their students are, so a nightly rebalance would defeat
 * the feature.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { splitRouteShare, type ShareInCharge, type SharePin, type ShareStudent } from './share-split';

const isMissingTable = (e: unknown) => (e as { code?: string } | null)?.code === '42P01';

/** Split an id list into <=150-id chunks (API-gateway limit on `.in()`). */
function chunk<T>(arr: T[], size = 150): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

interface StopRow { id: string; sequence_order: number | null }
interface LearnerRow { id: string; transport_stop_id: string | null; roll_number: string | null }
interface AssignmentRow { id: string; staff_email: string }
interface StaffStopRow { email: string | null; institution_email: string | null; transport_stop_id: string | null }

/**
 * Rebuild one route's allocation from scratch.
 *
 * Returns counts rather than the shares themselves: the caller is always a
 * mutation handler that wants a log line, not the roster.
 */
export async function recomputeRouteAllocation(
  svc: SupabaseClient,
  routeId: string,
  actorId: string | null,
): Promise<{ routeId: string; inCharges: number; allocated: number; unowned: number }> {
  // 1. The route's stops, so both students and in-charges can be placed in
  //    pickup order.
  const { data: stopData, error: stopErr } = await svc
    .from('tms_route_stop')
    .select('id, sequence_order')
    .eq('route_id', routeId)
    .eq('is_active', true);
  if (stopErr && !isMissingTable(stopErr)) throw stopErr;
  const seqByStop = new Map<string, number | null>(
    ((stopData ?? []) as StopRow[]).map((s) => [s.id, s.sequence_order]),
  );

  // 2. The route's allocated learners.
  const { data: learnerData, error: lErr } = await svc
    .from('learners_profiles')
    .select('id, transport_stop_id, roll_number')
    .eq('transport_route_id', routeId);
  if (lErr) throw lErr;
  const students: ShareStudent[] = ((learnerData ?? []) as LearnerRow[]).map((l) => ({
    learner_id: l.id,
    stop_sequence: l.transport_stop_id ? seqByStop.get(l.transport_stop_id) ?? null : null,
    roll: l.roll_number,
  }));

  // 3. The route's active in-charges.
  const { data: aData, error: aErr } = await svc
    .from('tms_staff_route_assignment')
    .select('id, staff_email')
    .eq('route_id', routeId)
    .eq('is_active', true);
  if (aErr && !isMissingTable(aErr)) throw aErr;
  const assignments = (aData ?? []) as AssignmentRow[];

  // 4. Each in-charge's OWN boarding stop. Staff carry three addresses and the
  //    assignment stores whichever one the admin typed: 108 of 109 resolve via
  //    institution_email but only 75 via staff.email, so BOTH columns are read
  //    and intersected in memory. profiles.email is not all-lowercase, so the
  //    comparison is done on lowered values on our side rather than in the
  //    filter.
  const emails = [...new Set(assignments.map((a) => a.staff_email.toLowerCase()))];
  const stopByEmail = new Map<string, string | null>();
  for (const c of chunk(emails)) {
    for (const column of ['email', 'institution_email'] as const) {
      const { data } = await svc
        .from('staff')
        .select('email, institution_email, transport_stop_id')
        .in(column, c);
      for (const s of (data ?? []) as StaffStopRow[]) {
        for (const addr of [s.email, s.institution_email]) {
          const key = addr?.toLowerCase();
          if (key && !stopByEmail.has(key) && s.transport_stop_id) stopByEmail.set(key, s.transport_stop_id);
        }
      }
    }
  }
  const inCharges: ShareInCharge[] = assignments.map((a) => {
    const stopId = stopByEmail.get(a.staff_email.toLowerCase()) ?? null;
    return {
      assignment_id: a.id,
      staff_email: a.staff_email.toLowerCase(),
      // A stop on a DIFFERENT route is as useless as no stop for ordering
      // this route's band, so it resolves to null and sorts last.
      stop_sequence: stopId && seqByStop.has(stopId) ? seqByStop.get(stopId) ?? null : null,
    };
  });

  // 5. Existing manual pins survive the recompute.
  const { data: pinData, error: pinErr } = await svc
    .from('tms_incharge_roster_allocation')
    .select('learner_id, assignment_id')
    .eq('route_id', routeId)
    .eq('is_manual', true);
  if (pinErr && !isMissingTable(pinErr)) throw pinErr;
  const pinned = (pinData ?? []) as SharePin[];

  const shares = splitRouteShare({ students, inCharges, pinned });

  // 6. Replace the route's rows. Delete-then-insert rather than a diff: the
  //    split is deterministic, so a full replace is the simplest operation
  //    that cannot leave a learner owned by two people.
  const { error: delErr } = await svc
    .from('tms_incharge_roster_allocation')
    .delete()
    .eq('route_id', routeId);
  if (delErr) throw delErr;

  const emailByAssignment = new Map(assignments.map((a) => [a.id, a.staff_email.toLowerCase()]));
  const pinnedSet = new Set(pinned.map((p) => p.learner_id));
  const rows = shares.flatMap((share) =>
    share.learner_ids.map((learnerId) => ({
      route_id: routeId,
      assignment_id: share.assignment_id,
      staff_email: emailByAssignment.get(share.assignment_id) ?? '',
      learner_id: learnerId,
      is_manual: pinnedSet.has(learnerId),
      allocated_by: actorId,
    })),
  );
  for (const c of chunk(rows, 500)) {
    const { error } = await svc.from('tms_incharge_roster_allocation').insert(c);
    if (error) throw error;
  }

  const allocated = rows.length;
  return {
    routeId,
    inCharges: inCharges.length,
    allocated,
    // Students on a route with no in-charge. Not an error -- a coverage gap
    // the admin board reports.
    unowned: students.length - allocated,
  };
}

/** learner_id -> its owner, for one route. Empty map when the table is absent. */
export async function loadRouteAllocation(
  svc: SupabaseClient,
  routeId: string,
): Promise<Map<string, { assignment_id: string; staff_email: string }>> {
  const { data, error } = await svc
    .from('tms_incharge_roster_allocation')
    .select('learner_id, assignment_id, staff_email')
    .eq('route_id', routeId);
  if (error) {
    if (isMissingTable(error)) return new Map();
    throw error;
  }
  const out = new Map<string, { assignment_id: string; staff_email: string }>();
  for (const r of (data ?? []) as Array<{ learner_id: string; assignment_id: string; staff_email: string }>) {
    out.set(r.learner_id, { assignment_id: r.assignment_id, staff_email: r.staff_email });
  }
  return out;
}

/** The learner ids one in-charge owns. */
export async function loadShareLearnerIds(svc: SupabaseClient, assignmentId: string): Promise<string[]> {
  const { data, error } = await svc
    .from('tms_incharge_roster_allocation')
    .select('learner_id')
    .eq('assignment_id', assignmentId);
  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
  return ((data ?? []) as { learner_id: string }[]).map((r) => r.learner_id);
}

/** assignment_id -> learner ids, for many routes at once (the cron path). */
export async function loadSharesForRoutes(
  svc: SupabaseClient,
  routeIds: string[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  for (const c of chunk(routeIds)) {
    const { data, error } = await svc
      .from('tms_incharge_roster_allocation')
      .select('assignment_id, learner_id')
      .in('route_id', c);
    if (error) {
      if (isMissingTable(error)) return out;
      throw error;
    }
    for (const r of (data ?? []) as { assignment_id: string; learner_id: string }[]) {
      const arr = out.get(r.assignment_id) ?? [];
      arr.push(r.learner_id);
      out.set(r.assignment_id, arr);
    }
  }
  return out;
}
