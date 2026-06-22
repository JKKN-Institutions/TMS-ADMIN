import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/activity/log';
import { getAssignedRouteIdsForUser } from '@/lib/boarding/identity';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';

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

async function mark(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_MANAGE))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      routeId?: string; direction?: string; marks?: MarkInput[];
    };
    const routeId = String(body.routeId ?? '');
    const direction = body.direction === 'return' ? 'return' : 'onward';
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
    const rows = marks
      .filter((m) => stopByLearner.has(m.learnerId) && (m.status === 'present' || m.status === 'absent'))
      .map((m) => ({
        learner_id: m.learnerId,
        route_id: routeId,
        stop_id: stopByLearner.get(m.learnerId) ?? null,
        trip_date: today,
        direction,
        status: m.status,
        method: 'manual',
        scanned_by: auth.userId,
        scanned_at: now,
      }));

    if (rows.length === 0) {
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
      description: `Manually marked attendance for ${rows.length} learner(s) on route ${routeId} (${direction})`,
      metadata: { routeId, direction, count: rows.length },
    });
    return NextResponse.json({ success: true, updated: rows.length });
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

export const GET = withAuth((request, auth) => getHistory(request, auth));
export const POST = withAuth((request, auth) => mark(request, auth));
