import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { LEARNER_SELECT, mapLearner, type LearnerRow } from '@/lib/passengers/types';
import { loadPassengerRefs } from '@/lib/passengers/refs';
import { notifyLearner } from '@/lib/notifications/notify';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';

/**
 * Admin Transport Enrollment — DIRECT ALLOCATION (no student self-service, no
 * request queue). An admin allocates / changes / clears a bus-required learner's
 * route + boarding stop, written straight onto learners_profiles
 * (transport_route_id / transport_stop_id).
 *
 *   GET   -> bus-required active learners (+ current allocation) + route/stop options
 *   PATCH -> { learnerId, routeId, stopId } to allocate/change; { learnerId, routeId:null } to clear
 *
 * Replaces the legacy enrollment-requests routes (which queried dropped tables).
 */
interface RouteRow {
  id: string;
  route_number: string;
  route_name: string;
}
interface StopRow {
  id: string;
  route_id: string;
  stop_name: string;
  sequence_order: number | null;
}

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

async function handleGet(_request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.ENROLLMENT_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const svc = createServiceRoleClient();

    // All bus-required learners (NOT lifecycle-filtered): this is an allocation
    // tool, so admins must be able to allocate not-yet-active learners too. (The
    // read-only Learners *roster* page filters to active; enrollment does not.)
    const learnersRes = await svc
      .from('learners_profiles')
      .select(LEARNER_SELECT)
      .eq('bus_required', true)
      .order('first_name', { ascending: true });

    if (learnersRes.error) {
      if ((learnersRes.error as { code?: string }).code === '42P01') {
        return NextResponse.json({ success: true, data: { learners: [], routes: [] } });
      }
      console.error('admin enrollment learners error:', learnersRes.error);
      return NextResponse.json({ error: 'Failed to fetch learners' }, { status: 500 });
    }

    const rows = (learnersRes.data ?? []) as unknown as LearnerRow[];
    const refs = await loadPassengerRefs(svc, {
      institutionIds: rows.map((r) => r.institution_id),
      departmentIds: rows.map((r) => r.department_id),
      routeIds: rows.map((r) => r.transport_route_id),
      stopIds: rows.map((r) => r.transport_stop_id),
      programIds: rows.map((r) => r.program_id),
      semesterIds: rows.map((r) => r.semester_id),
    });
    const learners = rows.map((r) => mapLearner(r, refs));

    const routesRes = await svc
      .from('tms_route')
      .select('id, route_number, route_name')
      .eq('status', 'active')
      .order('route_number', { ascending: true });
    const routes = (routesRes.data ?? []) as RouteRow[];
    const routeIds = routes.map((r) => r.id);
    const stopsRes = routeIds.length
      ? await svc
          .from('tms_route_stop')
          .select('id, route_id, stop_name, sequence_order')
          .in('route_id', routeIds)
          .order('sequence_order', { ascending: true })
      : { data: [] as StopRow[] };
    const stops = (stopsRes.data ?? []) as StopRow[];
    const stopsByRoute = new Map<string, { id: string; name: string }[]>();
    for (const s of stops) {
      const arr = stopsByRoute.get(s.route_id) ?? [];
      arr.push({ id: s.id, name: s.stop_name });
      stopsByRoute.set(s.route_id, arr);
    }
    const routeOptions = routes.map((r) => ({
      id: r.id,
      label: `${r.route_number} · ${r.route_name}`,
      stops: stopsByRoute.get(r.id) ?? [],
    }));

    return NextResponse.json({
      success: true,
      data: { learners, routes: routeOptions },
      count: learners.length,
    });
  } catch (e) {
    console.error('admin enrollment GET error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function handlePatch(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.ENROLLMENT_MANAGE))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      learnerId?: string;
      routeId?: string | null;
      stopId?: string | null;
    };
    if (!body.learnerId) {
      return NextResponse.json({ error: 'learnerId is required' }, { status: 400 });
    }

    const svc = createServiceRoleClient();

    // Clear allocation.
    if (!body.routeId) {
      const upd = await svc
        .from('learners_profiles')
        .update({ transport_route_id: null, transport_stop_id: null })
        .eq('id', body.learnerId)
        .eq('bus_required', true)
        .select('id')
        .maybeSingle();
      if (upd.error) {
        console.error('admin enrollment clear error:', upd.error);
        return NextResponse.json({ error: 'Failed to clear allocation' }, { status: 500 });
      }
      if (!upd.data) return NextResponse.json({ error: 'Learner not found' }, { status: 404 });
      await notifyLearner(svc, {
        learnerId: body.learnerId,
        actorId: auth.userId,
        title: 'Transport allocation removed',
        body: 'Your transport route allocation has been removed. Contact the transport office if this is unexpected.',
        url: '/student/routes',
      });
      return NextResponse.json({ success: true });
    }

    // Allocate / change — stop is required and must belong to the route.
    if (!body.stopId) {
      return NextResponse.json({ error: 'stopId is required when a route is set' }, { status: 400 });
    }
    const stopChk = await svc
      .from('tms_route_stop')
      .select('id')
      .eq('id', body.stopId)
      .eq('route_id', body.routeId)
      .maybeSingle();
    if (!stopChk.data) {
      return NextResponse.json({ error: 'Selected stop does not belong to the route' }, { status: 400 });
    }

    const upd = await svc
      .from('learners_profiles')
      .update({ transport_route_id: body.routeId, transport_stop_id: body.stopId })
      .eq('id', body.learnerId)
      .eq('bus_required', true)
      .select('id')
      .maybeSingle();
    if (upd.error) {
      console.error('admin enrollment allocate error:', upd.error);
      return NextResponse.json({ error: 'Failed to update allocation' }, { status: 500 });
    }
    if (!upd.data) return NextResponse.json({ error: 'Learner not found' }, { status: 404 });
    await notifyLearner(svc, {
      learnerId: body.learnerId,
      actorId: auth.userId,
      title: 'Transport allocated',
      body: 'You have been allocated to a transport route. View it under My Route, and your boarding pass is ready.',
      url: '/student/routes',
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('admin enrollment PATCH error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => handleGet(request, auth));
export const PATCH = withAuth((request, auth) => handlePatch(request, auth));
