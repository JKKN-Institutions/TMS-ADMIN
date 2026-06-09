import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getLearnerRowForUser } from '@/lib/student/identity';
import { loadPassengerRefs } from '@/lib/passengers/refs';
import { GRIEVANCE_CATEGORY_VALUES } from '@/lib/grievances/categories';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';

/**
 * Learner transport grievances (self-scoped).
 *   GET           -> list own grievances (+ allocated route for the form)
 *   GET ?id=X     -> one grievance + its comment thread (ownership-checked)
 *   POST {action:'create', ...}   -> submit a grievance
 *   POST {action:'comment', grievanceId, message} -> add a comment
 */
interface GrvListRow {
  id: string;
  category: string;
  subject: string;
  status: string;
  priority: string;
  created_at: string;
  route_id: string | null;
}

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

async function handleGet(request: NextRequest, auth: AuthContext) {
  if (!(await requirePerm(auth, TMS_PERMISSIONS.GRIEVANCES_SUBMIT))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const learner = await getLearnerRowForUser(auth);
  if (!learner) return NextResponse.json({ error: 'Learner profile not found' }, { status: 404 });

  const svc = createServiceRoleClient();
  const id = new URL(request.url).searchParams.get('id');

  if (id) {
    const { data: g } = await svc
      .from('tms_grievance')
      .select('id, category, subject, description, status, priority, resolution, created_at, route_id')
      .eq('id', id)
      .eq('learner_id', learner.id)
      .maybeSingle();
    if (!g) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const { data: comments } = await svc
      .from('tms_grievance_comment')
      .select('id, author_role, message, created_at')
      .eq('grievance_id', id)
      .order('created_at', { ascending: true });
    return NextResponse.json({ success: true, data: { grievance: g, comments: comments ?? [] } });
  }

  const { data: rows } = await svc
    .from('tms_grievance')
    .select('id, category, subject, status, priority, created_at, route_id')
    .eq('learner_id', learner.id)
    .order('created_at', { ascending: false });
  const list = (rows ?? []) as GrvListRow[];

  const refs = await loadPassengerRefs(svc, {
    institutionIds: [],
    departmentIds: [],
    routeIds: list.map((r) => r.route_id).concat([learner.transport_route_id]),
    stopIds: [],
  });
  const routeLabel = (rid: string | null) => {
    if (!rid) return null;
    const r = refs.routes.get(rid);
    return r ? `${r.routeNumber} · ${r.routeName}` : null;
  };

  return NextResponse.json({
    success: true,
    data: {
      grievances: list.map((r) => ({
        id: r.id,
        category: r.category,
        subject: r.subject,
        status: r.status,
        priority: r.priority,
        createdAt: r.created_at,
        routeLabel: routeLabel(r.route_id),
      })),
      allocatedRouteId: learner.transport_route_id,
      allocatedRouteLabel: routeLabel(learner.transport_route_id),
    },
  });
}

async function handlePost(request: NextRequest, auth: AuthContext) {
  if (!(await requirePerm(auth, TMS_PERMISSIONS.GRIEVANCES_SUBMIT))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const learner = await getLearnerRowForUser(auth);
  if (!learner) return NextResponse.json({ error: 'Learner profile not found' }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const svc = createServiceRoleClient();

  if (body.action === 'comment') {
    const grievanceId = String(body.grievanceId ?? '');
    const message = String(body.message ?? '').trim();
    if (!grievanceId || !message) {
      return NextResponse.json({ error: 'grievanceId and message are required' }, { status: 400 });
    }
    const { data: g } = await svc
      .from('tms_grievance')
      .select('id')
      .eq('id', grievanceId)
      .eq('learner_id', learner.id)
      .maybeSingle();
    if (!g) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const ins = await svc.from('tms_grievance_comment').insert({
      grievance_id: grievanceId,
      author_id: auth.userId,
      author_role: 'learner',
      message: message.slice(0, 2000),
    });
    if (ins.error) {
      console.error('grievance comment error:', ins.error);
      return NextResponse.json({ error: 'Failed to add comment' }, { status: 500 });
    }
    await svc.from('tms_grievance').update({ updated_at: new Date().toISOString() }).eq('id', grievanceId);
    return NextResponse.json({ success: true });
  }

  // create
  const category = GRIEVANCE_CATEGORY_VALUES.includes(String(body.category)) ? String(body.category) : 'other';
  const subject = String(body.subject ?? '').trim();
  const description = String(body.description ?? '').trim();
  const priority = ['low', 'normal', 'high'].includes(String(body.priority)) ? String(body.priority) : 'normal';
  if (!subject || !description) {
    return NextResponse.json({ error: 'Subject and description are required' }, { status: 400 });
  }
  const routeId = body.routeId ? String(body.routeId) : learner.transport_route_id ?? null;

  const ins = await svc
    .from('tms_grievance')
    .insert({
      learner_id: learner.id,
      route_id: routeId,
      category,
      subject: subject.slice(0, 200),
      description: description.slice(0, 4000),
      priority,
      status: 'open',
    })
    .select('id')
    .maybeSingle();
  if (ins.error) {
    console.error('grievance create error:', ins.error);
    return NextResponse.json({ error: 'Failed to submit grievance' }, { status: 500 });
  }
  return NextResponse.json({ success: true, id: (ins.data as { id: string } | null)?.id });
}

export const GET = withAuth((request, auth) => handleGet(request, auth));
export const POST = withAuth((request, auth) => handlePost(request, auth));
