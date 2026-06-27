import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { loadPassengerRefs } from '@/lib/passengers/refs';
import { notifyLearner, notifyProfile } from '@/lib/notifications/notify';
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
  learner_id: string | null;
  submitter_profile_id: string | null;
  submitter_type: string;
  route_id: string | null;
  category: string;
  subject: string;
  status: string;
  priority: string;
  created_at: string;
}
// Just the fields needed to route a notification back to whoever raised the grievance.
interface SubmitterInfo {
  learner_id: string | null;
  submitter_profile_id: string | null;
  submitter_type: string;
  subject: string;
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

// Notify whoever raised the grievance, pointing them at THEIR portal's page.
async function notifySubmitter(
  svc: ReturnType<typeof createServiceRoleClient>,
  g: SubmitterInfo,
  opts: { actorId: string; title: string; body: string }
): Promise<void> {
  if (g.submitter_type === 'learner' && g.learner_id) {
    await notifyLearner(svc, { learnerId: g.learner_id, ...opts, url: '/student/grievances' });
  } else if (g.submitter_profile_id) {
    const url = g.submitter_type === 'boarding' ? '/boarding/grievances' : '/driver/grievances';
    await notifyProfile(svc, { profileId: g.submitter_profile_id, ...opts, url });
  }
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
    const learnerId = (g as { learner_id: string | null }).learner_id;
    const { data: learner } = learnerId
      ? await svc
          .from('learners_profiles')
          .select('first_name, last_name, roll_number')
          .eq('id', learnerId)
          .maybeSingle()
      : { data: null };
    return NextResponse.json({ success: true, data: { grievance: g, comments: comments ?? [], learner } });
  }

  const { data: rows } = await svc
    .from('tms_grievance')
    .select('id, learner_id, submitter_profile_id, submitter_type, route_id, category, subject, status, priority, created_at')
    .order('created_at', { ascending: false });
  const list = (rows ?? []) as GrvRow[];

  const learnerIds = [...new Set(list.map((r) => r.learner_id).filter((x): x is string => !!x))];
  const { data: learners } = learnerIds.length
    ? await svc.from('learners_profiles').select('id, first_name, last_name, roll_number').in('id', learnerIds)
    : { data: [] as LearnerLite[] };
  const lmap = new Map(((learners ?? []) as LearnerLite[]).map((l) => [l.id, l]));

  // Staff (driver/boarding) submitters resolve their display name from profiles.
  const staffProfileIds = [
    ...new Set(
      list
        .filter((r) => r.submitter_type !== 'learner')
        .map((r) => r.submitter_profile_id)
        .filter((x): x is string => !!x)
    ),
  ];
  const { data: staffProfiles } = staffProfileIds.length
    ? await svc.from('profiles').select('id, full_name').in('id', staffProfileIds)
    : { data: [] as { id: string; full_name: string | null }[] };
  const pmap = new Map(
    ((staffProfiles ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name])
  );

  const refs = await loadPassengerRefs(svc, {
    institutionIds: [],
    departmentIds: [],
    routeIds: list.map((r) => r.route_id),
    stopIds: [],
  });

  const grievances = list.map((r) => {
    const isLearner = r.submitter_type === 'learner';
    const l = r.learner_id ? lmap.get(r.learner_id) : undefined;
    const route = r.route_id ? refs.routes.get(r.route_id) : null;
    const submitterName = isLearner
      ? l
        ? `${l.first_name ?? ''} ${l.last_name ?? ''}`.trim() || '—'
        : '—'
      : (r.submitter_profile_id ? pmap.get(r.submitter_profile_id) : null) || '—';
    return {
      id: r.id,
      category: r.category,
      subject: r.subject,
      status: r.status,
      priority: r.priority,
      createdAt: r.created_at,
      learnerName: submitterName,
      rollNumber: isLearner ? l?.roll_number ?? null : null,
      submitterType: r.submitter_type,
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

  const { data: g } = await svc
    .from('tms_grievance')
    .select('learner_id, submitter_profile_id, submitter_type, subject')
    .eq('id', grievanceId)
    .maybeSingle();
  if (g) {
    const gi = g as SubmitterInfo;
    await notifySubmitter(svc, gi, {
      actorId: auth.userId,
      title: 'New reply on your grievance',
      body: `An admin replied to "${gi.subject}".`,
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

  const { data: g } = await svc
    .from('tms_grievance')
    .select('learner_id, submitter_profile_id, submitter_type, subject')
    .eq('id', grievanceId)
    .maybeSingle();
  if (g) {
    const gi = g as SubmitterInfo;
    await notifySubmitter(svc, gi, {
      actorId: auth.userId,
      title: 'Grievance updated',
      body: `Your grievance "${gi.subject}"${status ? ` is now ${status.replace('_', ' ')}` : ' was updated'}.`,
    });
  }
  return NextResponse.json({ success: true });
}

export const GET = withAuth((request, auth) => handleGet(request, auth));
export const POST = withAuth((request, auth) => handlePost(request, auth));
export const PATCH = withAuth((request, auth) => handlePatch(request, auth));
