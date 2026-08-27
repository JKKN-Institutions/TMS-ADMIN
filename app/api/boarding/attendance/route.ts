import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/activity/log';
import { getAssignedRouteIdsForUser, loadMarkerNames } from '@/lib/boarding/identity';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { loadAttendanceWindows, isDirectionOpen, formatHM, type AttDirection } from '@/lib/boarding/attendance-window';
import { summarizeMarkBatch, type RpcMarkOutcome } from '@/lib/boarding/mark-batch';
import { loadShareLearnerIds } from '@/lib/boarding/allocation-repo';
import { delegatedTo, type AbsenceRow } from '@/lib/boarding/share-coverage';
import { loadSchedulingConfig } from '@/lib/settings/scheduling';
import { istToday } from '@/lib/booking/window';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Manually mark attendance (present/absent) for one or many learners on a route,
 * for a given direction + today. Single mark = a one-item `marks` array; bulk =
 * many. Gated on tms.attendance.manage (stronger than the scanner's .scan), and
 * the staff must be assigned to the route. Each learner is verified to actually
 * belong to the route before writing. Idempotent via the same
 * (learner, trip_date, direction) upsert key the QR scanner uses.
 */
async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

interface MarkInput { learnerId: string; status: 'present' | 'absent' }
interface StudentLite { id: string; transport_route_id: string | null; transport_stop_id: string | null }

/**
 * The learner ids this caller may mark on this route and date, split two ways:
 *
 *   all — their own share PLUS any share they accepted cover for. This is Gate
 *         A: may they touch the learner at all?
 *   own — their own share ONLY. Narrower, and it decides a different question:
 *         owning a learner lets you replace a COVERER's mark on them, while a
 *         coverer may never replace the owner's. Cover transfers duty, not
 *         authority over data already written.
 *
 * Returns null when the share restriction does not apply — the flag is off, or
 * the caller is a super admin, or the route has no allocation at all. A null
 * means "no restriction", which is the pre-share behaviour and the safe
 * default while the feature ships dormant.
 */
async function markableLearnerIds(
  svc: SupabaseClient,
  opts: { callerEmail: string | null; routeId: string; date: string; isSuperAdmin: boolean; enabled: boolean },
): Promise<{ all: Set<string>; own: Set<string> } | null> {
  if (!opts.enabled || opts.isSuperAdmin || !opts.callerEmail) return null;

  const { data: myAssignment } = await svc
    .from('tms_staff_route_assignment')
    .select('id')
    .eq('route_id', opts.routeId)
    .eq('staff_email', opts.callerEmail)
    .eq('is_active', true)
    .maybeSingle();
  const myAssignmentId = (myAssignment as { id: string } | null)?.id ?? null;
  if (!myAssignmentId) return null; // Not an in-charge here; the route check already passed.

  const own = new Set(await loadShareLearnerIds(svc, myAssignmentId));
  const ids = new Set(own);

  const { data: absData } = await svc
    .from('tms_incharge_absence')
    .select('assignment_id, absence_date, covering_assignment_id, cover_status')
    .eq('route_id', opts.routeId)
    .eq('absence_date', opts.date);
  for (const covered of delegatedTo(myAssignmentId, opts.date, (absData ?? []) as AbsenceRow[])) {
    for (const id of await loadShareLearnerIds(svc, covered)) ids.add(id);
  }

  // An allocation that produced nothing for this person is a coverage gap, not
  // a lockout. Restricting them to an empty set would make the route
  // unmarkable, which is worse than the problem this feature solves.
  return ids.size > 0 ? { all: ids, own } : null;
}

async function mark(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_MANAGE))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      routeId?: string; direction?: string; marks?: MarkInput[];
    };
    // Attendance is onward-only. A stale client requesting the retired evening
    // leg must fail loudly rather than silently having its marks recorded as onward.
    if (body.direction && body.direction !== 'onward') {
      return NextResponse.json(
        { error: 'Only onward (morning) attendance is supported.' },
        { status: 400 },
      );
    }
    const routeId = String(body.routeId ?? '');
    const direction: AttDirection = 'onward';
    const marks = Array.isArray(body.marks) ? body.marks : [];
    if (!routeId) return NextResponse.json({ error: 'routeId is required' }, { status: 400 });
    if (marks.length === 0) return NextResponse.json({ error: 'No marks provided' }, { status: 400 });

    // Resolved once, early. An override holder (tms.attendance.override --
    // transport_head) is the designated correction path for a colleague's mark.
    // Without exempting them from the two gates that follow, the permission
    // grants nothing reachable: its sole holder is not assigned to most routes,
    // and corrections are needed exactly when the window has already closed.
    const isOverrideHolder = await requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_OVERRIDE);

    // Authority: staff may only mark for routes they're assigned to -- override
    // holders exempt, since correcting a route they don't work is the point.
    if (!auth.isSuperAdmin && !isOverrideHolder) {
      const assigned = await getAssignedRouteIdsForUser(auth);
      if (!assigned.includes(routeId)) {
        return NextResponse.json({ error: 'You are not assigned to this route' }, { status: 403 });
      }
    }

    const svc = createServiceRoleClient();

    // Time-window gate: manual marking follows the same window as the scanner
    // -- except for override holders, who exist specifically to fix a mark
    // AFTER the window closes, the only time a wrong mark is otherwise
    // unfixable.
    if (!auth.isSuperAdmin && !isOverrideHolder) {
      const windows = await loadAttendanceWindows(svc);
      if (!isDirectionOpen(windows[direction])) {
        const w = windows[direction];
        return NextResponse.json({
          error: `Onward (morning) marking is open ${formatHM(w.start)}–${formatHM(w.end)} only.`,
          reason: 'window_closed',
        }, { status: 409 });
      }
    }

    const cfg = await loadSchedulingConfig(svc);
    const { data: callerProfile } = await auth.supabase
      .from('profiles').select('email').eq('id', auth.userId).maybeSingle();
    const callerEmail = (callerProfile?.email as string | undefined)?.toLowerCase() ?? null;
    // AUTHORIZATION date: IST, not UTC. Between 00:00 and 05:30 IST the UTC
    // date is still yesterday, so an accepted cover for TODAY would not be
    // found and the coverer would be 403'd 'not_your_share'.
    //
    // `today` below -- the trip_date these marks are STORED under -- is
    // deliberately left on UTC. That is pre-existing behaviour shared with the
    // QR scanner, and changing which date a mark lands on is out of scope here
    // and would be dangerous. Only the authorization lookup moves to IST.
    const authDate = istToday();
    const today = new Date().toISOString().slice(0, 10);
    const markable = await markableLearnerIds(svc, {
      callerEmail, routeId, date: authDate, isSuperAdmin: auth.isSuperAdmin,
      enabled: cfg.inchargeShareScoringEnabled,
    });

    if (markable) {
      const outside = marks.filter((m) => !markable.all.has(m.learnerId)).map((m) => m.learnerId);
      if (outside.length > 0) {
        // Name the owner. A bare 403 tells the in-charge nothing they can act
        // on, and "ask Priya, they own this student" is the whole point of
        // having an owner.
        const { data: owners } = await svc
          .from('tms_incharge_roster_allocation')
          .select('learner_id, staff_email')
          .in('learner_id', outside.slice(0, 150));
        return NextResponse.json({
          error: 'Some of these students belong to another in-charge on this route.',
          reason: 'not_your_share',
          learners: (owners ?? []) as Array<{ learner_id: string; staff_email: string }>,
        }, { status: 403 });
      }
    }

    // Verify each learner actually belongs to this route; grab their stop id.
    const learnerIds = [...new Set(marks.map((m) => m.learnerId).filter(Boolean))];
    const { data: studs } = await svc
      .from('learners_profiles')
      .select('id, transport_route_id, transport_stop_id')
      .in('id', learnerIds);
    const stopByLearner = new Map<string, string | null>();
    for (const s of (studs ?? []) as StudentLite[]) {
      if (s.transport_route_id === routeId) stopByLearner.set(s.id, s.transport_stop_id ?? null);
    }

    const rows = marks
      .filter((m) => stopByLearner.has(m.learnerId) && (m.status === 'present' || m.status === 'absent'))
      .map((m) => ({
        learner_id: m.learnerId,
        route_id: routeId,
        stop_id: stopByLearner.get(m.learnerId) ?? null,
        status: m.status,
        // PER-LEARNER entitlement. p_allow_override below is a per-CALL flag and
        // cannot express this: within one batch the caller may own some learners
        // and merely cover others, and only the owned ones outrank a coverer's
        // existing mark. Mirrors decideMark's isLearnerOwner.
        allow_override: markable ? markable.own.has(m.learnerId) : false,
      }));

    if (rows.length === 0) {
      return NextResponse.json({ error: 'No valid learners for this route' }, { status: 400 });
    }

    // Atomic: the decision and the write are ONE statement per learner, inside
    // the database. The read-then-upsert this replaces held nothing between the
    // two, so two of a route's dozen staff tapping the same learner in the same
    // second both saw "unmarked" and the second silently overwrote the first.
    //
    // GATE B, enforced in the database. The RPC's own WHERE already permits an
    // unowned row, your own row, and a same-status no-op; p_allow_override is
    // the ONE remaining question it cannot answer for itself -- may this actor
    // replace a COLLEAGUE'S differing mark? Only the designated correction path
    // may. That mirrors decideMark's final branch exactly.
    //
    // NOTE: this rule is now expressed twice -- here in SQL, and in
    // lib/boarding/attendance-ownership.ts for the roster's can_edit hint.
    // They must agree; nothing mechanically proves they do.
    const { data: outcomes, error } = await svc.rpc('tms_mark_attendance', {
      p_marks: rows,
      p_trip_date: today,
      p_direction: direction,
      p_actor: auth.userId,
      p_method: 'manual',
      p_allow_override: isOverrideHolder || auth.isSuperAdmin,
    });
    if (error) {
      console.error('boarding manual mark error:', error);
      return NextResponse.json({ error: 'Failed to save attendance' }, { status: 500 });
    }

    // Shaped by a pure helper (lib/boarding/mark-batch.ts) so the partial-lock
    // rules are testable without a database: which batches are a 409, which are
    // a success that still has something to report, and what was dropped before
    // it ever reached the RPC.
    const summary = summarizeMarkBatch((outcomes ?? []) as RpcMarkOutcome[], marks.length);
    const { written, skipped, overrides } = summary;

    // Name the owners so the client can say WHO holds each mark, not merely that
    // something is locked. The raw profiles.id is resolved here and STRIPPED
    // before the response leaves the server.
    const lockedNames = summary.locked.length
      ? await loadMarkerNames(svc, summary.locked.map((l) => l.markedBy))
      : new Map<string, string>();
    const locked = summary.locked.map((l) => ({
      learnerId: l.learnerId,
      status: l.status,
      markedByName: (l.markedBy && lockedNames.get(l.markedBy)) || 'another staff member',
      markedAt: l.markedAt,
    }));

    // 409 only when ownership is the WHOLE story. 403 would be wrong -- this
    // staffer MAY use the endpoint, these rows are taken.
    if (summary.disposition === 'all_locked') {
      const first = locked[0];
      return NextResponse.json(
        {
          error: `Already marked ${first.status} by ${first.markedByName}. Only they or the transport office can change it.`,
          reason: 'locked',
          locked,
        },
        { status: 409 },
      );
    }

    await logActivity(auth, request, {
      module: 'boarding',
      action: 'mark',
      entityType: 'tms_attendance',
      description:
        `Manually marked attendance for ${written} learner(s) on route ${routeId} (${direction})` +
        (overrides > 0 ? ` — ${overrides} replaced an earlier mark` : ''),
      metadata: { routeId, direction, count: written, skipped, overrides, locked: locked.length, dropped: summary.dropped },
    });
    // A partially locked batch still succeeds: one taken row must not fail the
    // other nineteen. `locked` and `dropped` tell the client what did NOT
    // happen, so it can never render this as a clean sweep.
    return NextResponse.json({
      success: true, updated: written, skipped, locked, dropped: summary.dropped,
    });
  } catch (e) {
    console.error('boarding manual mark error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/* ── History (GET) ─────────────────────────────────────────────────────────
 * List attendance records for the staff's assigned routes on a given day, with
 * optional route / direction / status filters. Gated on .scan (viewing), unlike
 * the .manage-gated POST above.
 */
interface RouteRow { id: string; route_number: string | null }
interface HistoryAtt { id: string; learner_id: string; route_id: string; direction: string | null; status: string | null; method: string | null; scanned_at: string | null }
interface LearnerName { id: string; first_name: string | null; last_name: string | null; roll_number: string | null }

async function getHistory(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_SCAN))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const url = new URL(request.url);
    const date = (url.searchParams.get('date') || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const fRoute = url.searchParams.get('routeId') || '';
    const fDir = url.searchParams.get('direction') || '';
    const fStatus = url.searchParams.get('status') || '';

    const svc = createServiceRoleClient();

    // Routes in scope: assigned; super admin with none → all.
    let routeIds = await getAssignedRouteIdsForUser(auth);
    let routes: RouteRow[] = [];
    if (routeIds.length > 0) {
      const { data } = await svc.from('tms_route').select('id, route_number').in('id', routeIds);
      routes = (data ?? []) as RouteRow[];
    } else if (auth.isSuperAdmin) {
      const { data } = await svc.from('tms_route').select('id, route_number');
      routes = (data ?? []) as RouteRow[];
      routeIds = routes.map((r) => r.id);
    }
    if (routeIds.length === 0) {
      return NextResponse.json({ success: true, data: { records: [], counts: { total: 0, present: 0, absent: 0 } } });
    }

    let scoped = routeIds;
    if (fRoute) {
      if (!routeIds.includes(fRoute)) {
        return NextResponse.json({ error: 'You are not assigned to this route' }, { status: 403 });
      }
      scoped = [fRoute];
    }

    let q = svc
      .from('tms_attendance')
      .select('id, learner_id, route_id, direction, status, method, scanned_at')
      .eq('trip_date', date)
      .in('route_id', scoped)
      .order('scanned_at', { ascending: false })
      .limit(300);
    if (fDir === 'onward' || fDir === 'return') q = q.eq('direction', fDir);
    if (fStatus === 'present' || fStatus === 'absent') q = q.eq('status', fStatus);

    const { data: att, error } = await q;
    if (error) {
      // Missing table / empty → return an empty set rather than 500.
      return NextResponse.json({ success: true, data: { records: [], counts: { total: 0, present: 0, absent: 0 } } });
    }
    const rows = (att ?? []) as HistoryAtt[];

    const learnerIds = [...new Set(rows.map((r) => r.learner_id))];
    const nameById: Record<string, { name: string; roll: string | null }> = {};
    if (learnerIds.length) {
      const { data: ls } = await svc
        .from('learners_profiles').select('id, first_name, last_name, roll_number').in('id', learnerIds);
      for (const l of (ls ?? []) as LearnerName[]) {
        nameById[l.id] = { name: `${l.first_name ?? ''} ${l.last_name ?? ''}`.trim() || 'Learner', roll: l.roll_number };
      }
    }
    const routeNumById: Record<string, string | null> = {};
    for (const r of routes) routeNumById[r.id] = r.route_number;

    let present = 0, absent = 0;
    const records = rows.map((r) => {
      if (r.status === 'present') present += 1;
      else if (r.status === 'absent') absent += 1;
      return {
        id: r.id,
        learner_name: nameById[r.learner_id]?.name ?? 'Learner',
        roll_number: nameById[r.learner_id]?.roll ?? null,
        route_number: routeNumById[r.route_id] ?? null,
        direction: r.direction,
        status: r.status,
        method: r.method,
        scanned_at: r.scanned_at,
      };
    });

    return NextResponse.json({
      success: true,
      data: { records, counts: { total: records.length, present, absent } },
    });
  } catch (e) {
    console.error('boarding attendance history error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

interface ClearInput { routeId?: string; direction?: string; learnerIds?: string[] }

/* ── Clear marks (DELETE) ───────────────────────────────────────────────────
 * Revert one or many learners to "Unmarked" for today + a direction by deleting
 * their tms_attendance rows. Same authority as marking (.manage + assigned to the
 * route). Today-only (you can only undo the current day's marks). */
async function clearMarks(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_MANAGE))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as ClearInput;
    // Attendance is onward-only. A stale client requesting the retired evening
    // leg must fail loudly rather than silently clearing the wrong (or a nonexistent) leg.
    if (body.direction && body.direction !== 'onward') {
      return NextResponse.json(
        { error: 'Only onward (morning) attendance is supported.' },
        { status: 400 },
      );
    }
    const routeId = String(body.routeId ?? '');
    const direction: AttDirection = 'onward';
    const learnerIds = Array.isArray(body.learnerIds) ? [...new Set(body.learnerIds.filter(Boolean))] : [];
    if (!routeId) return NextResponse.json({ error: 'routeId is required' }, { status: 400 });
    if (learnerIds.length === 0) return NextResponse.json({ error: 'No learners provided' }, { status: 400 });

    // Authority: staff may only clear for routes they're assigned to.
    if (!auth.isSuperAdmin) {
      const assigned = await getAssignedRouteIdsForUser(auth);
      if (!assigned.includes(routeId)) {
        return NextResponse.json({ error: 'You are not assigned to this route' }, { status: 403 });
      }
    }

    const svc = createServiceRoleClient();
    // See the note on the marking path above: the trip_date rows are matched
    // and deleted by stays on UTC (pre-existing, shared with the QR scanner);
    // only the authorization date is IST.
    const today = new Date().toISOString().slice(0, 10);
    const authDate = istToday();

    const cfg = await loadSchedulingConfig(svc);
    const { data: callerProfile } = await auth.supabase
      .from('profiles').select('email').eq('id', auth.userId).maybeSingle();
    const callerEmail = (callerProfile?.email as string | undefined)?.toLowerCase() ?? null;
    const markable = await markableLearnerIds(svc, {
      callerEmail, routeId, date: authDate, isSuperAdmin: auth.isSuperAdmin,
      enabled: cfg.inchargeShareScoringEnabled,
    });

    if (markable) {
      const outside = learnerIds.filter((id) => !markable.all.has(id));
      if (outside.length > 0) {
        return NextResponse.json({
          error: 'Some of these students belong to another in-charge on this route.',
          reason: 'not_your_share',
        }, { status: 403 });
      }
    }

    const { data, error } = await svc
      .from('tms_attendance')
      .delete()
      .eq('route_id', routeId)
      .eq('trip_date', today)
      .eq('direction', direction)
      .in('learner_id', learnerIds)
      .select('learner_id');
    if (error) {
      console.error('boarding clear mark error:', error);
      return NextResponse.json({ error: 'Failed to clear attendance' }, { status: 500 });
    }
    const cleared = (data ?? []).length;

    await logActivity(auth, request, {
      module: 'boarding',
      action: 'unmark',
      entityType: 'tms_attendance',
      description: `Cleared attendance for ${cleared} learner(s) on route ${routeId} (${direction})`,
      metadata: { routeId, direction, count: cleared },
    });
    return NextResponse.json({ success: true, cleared });
  } catch (e) {
    console.error('boarding clear mark error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getHistory(request, auth));
export const POST = withAuth((request, auth) => mark(request, auth));
export const DELETE = withAuth((request, auth) => clearMarks(request, auth));
