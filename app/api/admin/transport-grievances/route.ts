import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { loadPassengerRefs } from '@/lib/passengers/refs';
import { notifyLearner } from '@/lib/notifications/notify';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';

/**
 * Admin transport-grievance queue (tms_grievance). Separate from the institutional
 * grievance_tickets system and the broken legacy /api/admin/grievances routes.
 *   GET        -> list (with learner + route labels)
 *   GET ?id=X  -> one grievance + comments + learner
 *   POST {grievanceId, message}            -> add an admin comment
 *   PATCH {grievanceId, status?, resolution?} -> update status / resolve
 */
interface GrvRow {
  id: string;
  learner_id: string;
  route_id: string | null;
  category: string;
  subject: string;
  status: string;
  priority: string;
  created_at: string;
}
interface LearnerLite {
  id: string;
  first_name: string | null;
  last_name: string | null;
  roll_number: string | null;
}

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

async function handleGet(request: NextRequest, auth: AuthContext) {
  if (!(await requirePerm(auth, TMS_PERMISSIONS.GRIEVANCES_MANAGE))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const svc = createServiceRoleClient();
  const id = new URL(request.url).searchParams.get('id');

  if (id) {
    const { data: g } = await svc
      .from('tms_grievance')
      .select('id, learner_id, route_id, category, subject, description, status, priority, resolution, created_at')
      .eq('id', id)
      .maybeSingle();
    if (!g) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const { data: comments } = await svc
      .from('tms_grievance_comment')
      .select('id, author_role, message, created_at')
      .eq('grievance_id', id)
      .order('created_at', { ascending: true });
    const { data: learner } = await svc
      .from('learners_profiles')
      .select('first_name, last_name, roll_number')
      .eq('id', (g as { learner_id: string }).learner_id)
      .maybeSingle();
    return NextResponse.json({ success: true, data: { grievance: g, comments: comments ?? [], learner } });
  }

  const { data: rows } = await svc
    .from('tms_grievance')
    .select('id, learner_id, route_id, category, subject, status, priority, created_at')
    .order('created_at', { ascending: false });
  const list = (rows ?? []) as GrvRow[];

  const learnerIds = [...new Set(list.map((r) => r.learner_id))];
  const { data: learners } = learnerIds.length
    ? await svc.from('learners_profiles').select('id, first_name, last_name, roll_number').in('id', learnerIds)
    : { data: [] as LearnerLite[] };
  const lmap = new Map(((learners ?? []) as LearnerLite[]).map((l) => [l.id, l]));

  const refs = await loadPassengerRefs(svc, {
    institutionIds: [],
    departmentIds: [],
    routeIds: list.map((r) => r.route_id),
    stopIds: [],
  });

  const grievances = list.map((r) => {
    const l = lmap.get(r.learner_id);
    const route = r.route_id ? refs.routes.get(r.route_id) : null;
    return {
      id: r.id,
      category: r.category,
      subject: r.subject,
      status: r.status,
      priority: r.priority,
      createdAt: r.created_at,
      learnerName: l ? `${l.first_name ?? ''} ${l.last_name ?? ''}`.trim() || '—' : '—',
      rollNumber: l?.roll_number ?? null,
      routeLabel: route ? `${route.routeNumber} · ${route.routeName}` : null,
    };
  });
  return NextResponse.json({ success: true, data: grievances, count: grievances.length });
}

async function handlePost(request: NextRequest, auth: AuthContext) {
  if (!(await requirePerm(auth, TMS_PERMISSIONS.GRIEVANCES_MANAGE))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) as { grievanceId?: string; message?: string };
  const grievanceId = String(body.grievanceId ?? '');
  const message = String(body.message ?? '').trim();
  if (!grievanceId || !message) {
    return NextResponse.json({ error: 'grievanceId and message are required' }, { status: 400 });
  }
  const svc = createServiceRoleClient();
  const ins = await svc.from('tms_grievance_comment').insert({
    grievance_id: grievanceId,
    author_id: auth.userId,
    author_role: 'admin',
    message: message.slice(0, 2000),
  });
  if (ins.error) {
    console.error('admin grievance comment error:', ins.error);
    return NextResponse.json({ error: 'Failed to add comment' }, { status: 500 });
  }
  await svc.from('tms_grievance').update({ updated_at: new Date().toISOString() }).eq('id', grievanceId);

  const { data: g } = await svc.from('tms_grievance').select('learner_id, subject').eq('id', grievanceId).maybeSingle();
  const gl = g as { learner_id: string; subject: string } | null;
  if (gl) {
    await notifyLearner(svc, {
      learnerId: gl.learner_id,
      actorId: auth.userId,
      title: 'New reply on your grievance',
      body: `An admin replied to "${gl.subject}".`,
      url: '/student/grievances',
    });
  }
  return NextResponse.json({ success: true });
}

async function handlePatch(request: NextRequest, auth: AuthContext) {
  if (!(await requirePerm(auth, TMS_PERMISSIONS.GRIEVANCES_MANAGE))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    grievanceId?: string;
    status?: string;
    resolution?: string;
  };
  const grievanceId = String(body.grievanceId ?? '');
  if (!grievanceId) return NextResponse.json({ error: 'grievanceId is required' }, { status: 400 });

  const status = ['open', 'in_progress', 'resolved', 'closed'].includes(String(body.status))
    ? String(body.status)
    : undefined;
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (status) update.status = status;
  if (body.resolution !== undefined) update.resolution = String(body.resolution).slice(0, 4000);
  if (status === 'resolved' || status === 'closed') {
    update.resolved_at = new Date().toISOString();
    update.resolved_by = auth.userId;
  }

  const svc = createServiceRoleClient();
  const upd = await svc.from('tms_grievance').update(update).eq('id', grievanceId).select('id').maybeSingle();
  if (upd.error) {
    console.error('admin grievance update error:', upd.error);
    return NextResponse.json({ error: 'Failed to update grievance' }, { status: 500 });
  }
  if (!upd.data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: g } = await svc.from('tms_grievance').select('learner_id, subject').eq('id', grievanceId).maybeSingle();
  const gl = g as { learner_id: string; subject: string } | null;
  if (gl) {
    await notifyLearner(svc, {
      learnerId: gl.learner_id,
      actorId: auth.userId,
      title: 'Grievance updated',
      body: `Your grievance "${gl.subject}"${status ? ` is now ${status.replace('_', ' ')}` : ' was updated'}.`,
      url: '/student/grievances',
    });
  }
  return NextResponse.json({ success: true });
}

export const GET = withAuth((request, auth) => handleGet(request, auth));
export const POST = withAuth((request, auth) => handlePost(request, auth));
export const PATCH = withAuth((request, auth) => handlePatch(request, auth));
