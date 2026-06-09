import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getLearnerRowForUser } from '@/lib/student/identity';
import type { LearnerRow } from '@/lib/passengers/types';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';

/**
 * Learner transport-enrollment: view own requests + available routes (GET),
 * submit a request (POST), cancel a pending request (PATCH). Fully self-scoped:
 * the learner is resolved from the session and is the only learner_id ever used.
 */
interface ReqRow {
  id: string;
  status: string;
  request_type: string;
  preferred_route_id: string | null;
  preferred_stop_id: string | null;
  reason: string | null;
  admin_notes: string | null;
  rejection_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
}
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

async function loadView(learner: LearnerRow) {
  const svc = createServiceRoleClient();

  const [reqRes, routeRes] = await Promise.all([
    svc
      .from('tms_enrollment_request')
      .select(
        'id, status, request_type, preferred_route_id, preferred_stop_id, reason, admin_notes, rejection_reason, created_at, reviewed_at'
      )
      .eq('learner_id', learner.id)
      .order('created_at', { ascending: false }),
    svc
      .from('tms_route')
      .select('id, route_number, route_name')
      .eq('status', 'active')
      .order('route_number', { ascending: true }),
  ]);

  const routes = (routeRes.data ?? []) as RouteRow[];
  const routeIds = routes.map((r) => r.id);
  const stopsRes = routeIds.length
    ? await svc
        .from('tms_route_stop')
        .select('id, route_id, stop_name, sequence_order')
        .in('route_id', routeIds)
        .order('sequence_order', { ascending: true })
    : { data: [] as StopRow[] };
  const stops = (stopsRes.data ?? []) as StopRow[];

  const routeLabel = new Map(routes.map((r) => [r.id, `${r.route_number} · ${r.route_name}`]));
  const stopName = new Map(stops.map((s) => [s.id, s.stop_name]));
  const stopsByRoute = new Map<string, { id: string; name: string }[]>();
  for (const s of stops) {
    const arr = stopsByRoute.get(s.route_id) ?? [];
    arr.push({ id: s.id, name: s.stop_name });
    stopsByRoute.set(s.route_id, arr);
  }

  const requests = ((reqRes.data ?? []) as ReqRow[]).map((r) => ({
    id: r.id,
    status: r.status,
    requestType: r.request_type,
    routeLabel: r.preferred_route_id ? routeLabel.get(r.preferred_route_id) ?? null : null,
    stopLabel: r.preferred_stop_id ? stopName.get(r.preferred_stop_id) ?? null : null,
    reason: r.reason,
    adminNotes: r.admin_notes,
    rejectionReason: r.rejection_reason,
    createdAt: r.created_at,
    reviewedAt: r.reviewed_at,
  }));

  const hasPending = requests.some((r) => r.status === 'pending');

  return {
    busRequired: learner.bus_required,
    assigned: !!learner.transport_route_id,
    allocation: {
      routeLabel: learner.transport_route_id ? routeLabel.get(learner.transport_route_id) ?? null : null,
      stopLabel: learner.transport_stop_id ? stopName.get(learner.transport_stop_id) ?? null : null,
    },
    hasPending,
    canRequest: !!learner.bus_required && !hasPending,
    requests,
    routes: routes.map((r) => ({
      id: r.id,
      label: `${r.route_number} · ${r.route_name}`,
      stops: stopsByRoute.get(r.id) ?? [],
    })),
  };
}

async function handleGet(_request: NextRequest, auth: AuthContext) {
  if (!(await requirePerm(auth, TMS_PERMISSIONS.PASSENGER_SELF_VIEW))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const learner = await getLearnerRowForUser(auth);
  if (!learner) return NextResponse.json({ error: 'Learner profile not found' }, { status: 404 });
  return NextResponse.json({ success: true, data: await loadView(learner) });
}

async function handlePost(request: NextRequest, auth: AuthContext) {
  if (!(await requirePerm(auth, TMS_PERMISSIONS.PASSENGER_ENROLL))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const learner = await getLearnerRowForUser(auth);
  if (!learner) return NextResponse.json({ error: 'Learner profile not found' }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as {
    preferredRouteId?: string;
    preferredStopId?: string;
    reason?: string;
  };
  if (!body.preferredRouteId || !body.preferredStopId) {
    return NextResponse.json({ error: 'Route and boarding stop are required' }, { status: 400 });
  }

  const svc = createServiceRoleClient();
  const stopChk = await svc
    .from('tms_route_stop')
    .select('id')
    .eq('id', body.preferredStopId)
    .eq('route_id', body.preferredRouteId)
    .maybeSingle();
  if (!stopChk.data) {
    return NextResponse.json({ error: 'Selected stop does not belong to the route' }, { status: 400 });
  }

  const ins = await svc
    .from('tms_enrollment_request')
    .insert({
      learner_id: learner.id,
      preferred_route_id: body.preferredRouteId,
      preferred_stop_id: body.preferredStopId,
      request_type: learner.transport_route_id ? 'change' : 'new',
      status: 'pending',
      reason: body.reason ? String(body.reason).slice(0, 1000) : null,
    })
    .select('id')
    .maybeSingle();

  if (ins.error) {
    if ((ins.error as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'You already have a pending request' }, { status: 409 });
    }
    console.error('enrollment insert error:', ins.error);
    return NextResponse.json({ error: 'Failed to submit request' }, { status: 500 });
  }
  return NextResponse.json({ success: true, id: (ins.data as { id: string } | null)?.id });
}

async function handlePatch(request: NextRequest, auth: AuthContext) {
  if (!(await requirePerm(auth, TMS_PERMISSIONS.PASSENGER_ENROLL))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const learner = await getLearnerRowForUser(auth);
  if (!learner) return NextResponse.json({ error: 'Learner profile not found' }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as { requestId?: string };
  if (!body.requestId) return NextResponse.json({ error: 'requestId required' }, { status: 400 });

  const svc = createServiceRoleClient();
  // Cancel ONLY the caller's own pending request (ownership enforced in the filter).
  const upd = await svc
    .from('tms_enrollment_request')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', body.requestId)
    .eq('learner_id', learner.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();

  if (upd.error) {
    console.error('enrollment cancel error:', upd.error);
    return NextResponse.json({ error: 'Failed to cancel request' }, { status: 500 });
  }
  if (!upd.data) return NextResponse.json({ error: 'No cancellable request found' }, { status: 404 });
  return NextResponse.json({ success: true });
}

export const GET = withAuth((request, auth) => handleGet(request, auth));
export const POST = withAuth((request, auth) => handlePost(request, auth));
export const PATCH = withAuth((request, auth) => handlePatch(request, auth));
