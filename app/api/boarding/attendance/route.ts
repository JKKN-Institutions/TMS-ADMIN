import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/activity/log';
import { getAssignedRouteIdsForUser, loadMarkerNames } from '@/lib/boarding/identity';
import { decideMark, canClearMark, type MarkStatus } from '@/lib/boarding/attendance-ownership';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { loadAttendanceWindows, isDirectionOpen, formatHM, type AttDirection } from '@/lib/boarding/attendance-window';

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

interface ExistingRow {
  learner_id: string;
  status: string | null;
  scanned_by: string | null;
  scanned_at: string | null;
}

interface AttendanceUpsert {
  learner_id: string;
  route_id: string;
  stop_id: string | null;
  trip_date: string;
  direction: AttDirection;
  status: MarkStatus;
  method: 'manual';
  scanned_by: string;
  scanned_at: string;
  previous_status: MarkStatus | null;
  previous_scanned_by: string | null;
  previous_scanned_at: string | null;
}

/** A mark this request could not write because a colleague owns it. */
interface LockedMark {
  learnerId: string;
  status: MarkStatus;
  markedBy: string | null;
  markedByName: string;
  markedAt: string | null;
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

    // Authority: staff may only mark for routes they're assigned to.
    if (!auth.isSuperAdmin) {
      const assigned = await getAssignedRouteIdsForUser(auth);
      if (!assigned.includes(routeId)) {
        return NextResponse.json({ error: 'You are not assigned to this route' }, { status: 403 });
      }
    }

    const svc = createServiceRoleClient();

    // Time-window gate: manual marking follows the same window as the scanner.
    const windows = await loadAttendanceWindows(svc);
    if (!isDirectionOpen(windows[direction])) {
      const w = windows[direction];
      return NextResponse.json({
        error: `Onward (morning) marking is open ${formatHM(w.start)}–${formatHM(w.end)} only.`,
        reason: 'window_closed',
      }, { status: 409 });
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

    const today = new Date().toISOString().slice(0, 10);
    const now = new Date().toISOString();

    // What is ALREADY marked. This route's upsert has no guard of its own, so
    // without reading first, any of route 16's twelve in-charges silently flips a
    // colleague's mark. A failed read must NEVER be treated as "nothing is
    // marked" — that is the overwrite this whole change exists to stop.
    const { data: existingRows, error: exErr } = await svc
      .from('tms_attendance')
      .select('learner_id, status, scanned_by, scanned_at')
      .eq('trip_date', today)
      .eq('direction', direction)
      .in('learner_id', learnerIds);
    if (exErr) {
      console.error('boarding manual mark existing-read error:', exErr);
      return NextResponse.json({ error: 'Could not verify existing marks' }, { status: 500 });
    }
    const existingByLearner = new Map<
      string,
      { status: MarkStatus; scannedBy: string | null; scannedAt: string | null }
    >();
    for (const r of (existingRows ?? []) as ExistingRow[]) {
      if (r.status === 'present' || r.status === 'absent') {
        existingByLearner.set(r.learner_id, {
          status: r.status,
          scannedBy: r.scanned_by,
          scannedAt: r.scanned_at,
        });
      }
    }

    // requirePerm already returns true for super admins; isSuperAdmin is passed
    // to decideMark separately only to keep its inputs explicit.
    const isOverrideHolder = await requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_OVERRIDE);

    const rows: AttendanceUpsert[] = [];
    const locked: LockedMark[] = [];
    let skipped = 0;
    let overrides = 0;

    for (const m of marks) {
      if (!stopByLearner.has(m.learnerId)) continue;
      if (m.status !== 'present' && m.status !== 'absent') continue;

      const existing = existingByLearner.get(m.learnerId) ?? null;
      const decision = decideMark({
        existing: existing ? { status: existing.status, scannedBy: existing.scannedBy } : null,
        requestedStatus: m.status,
        actorId: auth.userId,
        isOverrideHolder,
        isSuperAdmin: auth.isSuperAdmin,
        viaScan: false,
      });

      if (decision.action === 'noop') {
        skipped += 1;
        continue;
      }
      if (decision.action === 'deny') {
        locked.push({
          learnerId: m.learnerId,
          status: existing!.status,
          markedBy: existing!.scannedBy,
          markedByName: 'another staff member',
          markedAt: existing!.scannedAt,
        });
        continue;
      }

      if (decision.action === 'override') overrides += 1;
      rows.push({
        learner_id: m.learnerId,
        route_id: routeId,
        stop_id: stopByLearner.get(m.learnerId) ?? null,
        trip_date: today,
        direction,
        status: m.status,
        method: 'manual',
        scanned_by: auth.userId,
        scanned_at: now,
        previous_status: decision.action === 'override' ? decision.from : null,
        previous_scanned_by: decision.action === 'override' ? decision.previousBy : null,
        previous_scanned_at: decision.action === 'override' ? existing!.scannedAt : null,
      });
    }

    // Name the owners so the client can say WHO holds the mark, not just that
    // something is locked.
    if (locked.length > 0) {
      const names = await loadMarkerNames(svc, locked.map((l) => l.markedBy));
      for (const l of locked) {
        l.markedByName = (l.markedBy && names.get(l.markedBy)) || 'another staff member';
      }
    }

    if (rows.length === 0) {
      // A single locked mark is the common case (one tap on a stale screen) and
      // deserves a 409 the client can turn into a named message. 403 would be
      // wrong: this staffer MAY use the endpoint, this one row is taken.
      if (locked.length > 0) {
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
      // Everything requested was already true. Nothing to do, nothing wrong.
      if (skipped > 0) {
        return NextResponse.json({ success: true, updated: 0, skipped, locked: [] });
      }
      return NextResponse.json({ error: 'No valid learners for this route' }, { status: 400 });
    }

    const { error } = await svc
      .from('tms_attendance')
      .upsert(rows, { onConflict: 'learner_id,trip_date,direction' });
    if (error) {
      console.error('boarding manual mark error:', error);
      return NextResponse.json({ error: 'Failed to save attendance' }, { status: 500 });
    }

    await logActivity(auth, request, {
      module: 'boarding',
      action: 'mark',
      entityType: 'tms_attendance',
      description:
        `Manually marked attendance for ${rows.length} learner(s) on route ${routeId} (${direction})` +
        (overrides > 0 ? ` — ${overrides} overrode an earlier mark` : ''),
      metadata: {
        routeId,
        direction,
        count: rows.length,
        overrides,
        skipped,
        locked: locked.length,
        ...(overrides > 0 ? { reason: 'override' } : {}),
      },
    });
    // A partially locked batch still succeeds: one taken row must not fail the
    // other nineteen. `locked` tells the client which ones to redraw.
    return NextResponse.json({ success: true, updated: rows.length, skipped, locked });
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
    const today = new Date().toISOString().slice(0, 10);

    // Same ownership rule as marking. This endpoint is currently unreachable from
    // the UI (row-level Undo was removed in PR #9) but it is still exposed, and
    // today it lets ANY assigned staff wipe ANY mark on the route.
    const { data: existingRows, error: exErr } = await svc
      .from('tms_attendance')
      .select('learner_id, status, scanned_by')
      .eq('route_id', routeId)
      .eq('trip_date', today)
      .eq('direction', direction)
      .in('learner_id', learnerIds);
    if (exErr) {
      console.error('boarding clear mark existing-read error:', exErr);
      return NextResponse.json({ error: 'Could not verify existing marks' }, { status: 500 });
    }
    const isOverrideHolder = await requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_OVERRIDE);

    const clearable: string[] = [];
    let blocked = 0;
    for (const r of (existingRows ?? []) as ExistingRow[]) {
      const existing =
        r.status === 'present' || r.status === 'absent'
          ? { status: r.status as MarkStatus, scannedBy: r.scanned_by }
          : null;
      if (canClearMark({ existing, actorId: auth.userId, isOverrideHolder, isSuperAdmin: auth.isSuperAdmin })) {
        clearable.push(r.learner_id);
      } else {
        blocked += 1;
      }
    }

    if (clearable.length === 0) {
      return NextResponse.json(
        {
          error: blocked > 0
            ? 'Those marks belong to another staff member. Only they or the transport office can clear them.'
            : 'Nothing to clear',
          reason: blocked > 0 ? 'locked' : 'not_found',
        },
        { status: blocked > 0 ? 409 : 404 },
      );
    }

    const { data, error } = await svc
      .from('tms_attendance')
      .delete()
      .eq('route_id', routeId)
      .eq('trip_date', today)
      .eq('direction', direction)
      .in('learner_id', clearable)
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
      metadata: { routeId, direction, count: cleared, blocked },
    });
    return NextResponse.json({ success: true, cleared, blocked });
  } catch (e) {
    console.error('boarding clear mark error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getHistory(request, auth));
export const POST = withAuth((request, auth) => mark(request, auth));
export const DELETE = withAuth((request, auth) => clearMarks(request, auth));
