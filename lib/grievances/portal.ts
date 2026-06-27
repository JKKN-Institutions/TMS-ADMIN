import { createServiceRoleClient } from '@/lib/supabase/server';
import { loadPassengerRefs } from '@/lib/passengers/refs';
import { GRIEVANCE_CATEGORY_VALUES } from '@/lib/grievances/categories';

// Shared self-service grievance logic for the STAFF portals (driver + boarding).
// These submitters live on tms_grievance via submitter_profile_id + submitter_type
// (added in 20260627120000_grievance_staff_submitters), unlike learners which use
// learner_id. The student route keeps its own learner-scoped copy; this module is
// the driver/boarding equivalent so the two portals stay byte-identical in behavior.

type Svc = ReturnType<typeof createServiceRoleClient>;

export type StaffSubmitterType = 'driver' | 'boarding';

/** A route the staff member may link a new grievance to. */
export interface PortalRoute {
  id: string;
  label: string;
}

type PortalResult<T> = { data: T } | { error: string; status: number };

interface ListRow {
  id: string;
  category: string;
  subject: string;
  status: string;
  priority: string;
  created_at: string;
  route_id: string | null;
}

/** List the staff member's own grievances + the routes they may link a new one to. */
export async function listPortalGrievances(
  svc: Svc,
  profileId: string,
  type: StaffSubmitterType,
  routes: PortalRoute[]
) {
  const { data: rows } = await svc
    .from('tms_grievance')
    .select('id, category, subject, status, priority, created_at, route_id')
    .eq('submitter_profile_id', profileId)
    .eq('submitter_type', type)
    .order('created_at', { ascending: false });
  const list = (rows ?? []) as ListRow[];

  const refs = await loadPassengerRefs(svc, {
    institutionIds: [],
    departmentIds: [],
    routeIds: list.map((r) => r.route_id),
    stopIds: [],
  });
  const label = (rid: string | null) => {
    if (!rid) return null;
    const r = refs.routes.get(rid);
    return r ? `${r.routeNumber} · ${r.routeName}` : null;
  };
  const primary = routes[0] ?? null;

  return {
    grievances: list.map((r) => ({
      id: r.id,
      category: r.category,
      subject: r.subject,
      status: r.status,
      priority: r.priority,
      createdAt: r.created_at,
      routeLabel: label(r.route_id),
    })),
    allocatedRouteId: primary?.id ?? null,
    allocatedRouteLabel: primary?.label ?? null,
    routes,
  };
}

/** One own grievance + its comment thread (ownership-checked by submitter). */
export async function loadPortalGrievance(
  svc: Svc,
  profileId: string,
  type: StaffSubmitterType,
  id: string
) {
  const { data: g } = await svc
    .from('tms_grievance')
    .select('id, category, subject, description, status, priority, resolution, created_at, route_id')
    .eq('id', id)
    .eq('submitter_profile_id', profileId)
    .eq('submitter_type', type)
    .maybeSingle();
  if (!g) return null;
  const { data: comments } = await svc
    .from('tms_grievance_comment')
    .select('id, author_role, message, created_at')
    .eq('grievance_id', id)
    .order('created_at', { ascending: true });
  return { grievance: g, comments: comments ?? [] };
}

/** Insert a new staff-submitted grievance. */
export async function createPortalGrievance(
  svc: Svc,
  args: { profileId: string; type: StaffSubmitterType; body: Record<string, unknown> }
): Promise<PortalResult<{ id: string | null }>> {
  const { profileId, type, body } = args;
  const category = GRIEVANCE_CATEGORY_VALUES.includes(String(body.category)) ? String(body.category) : 'other';
  const subject = String(body.subject ?? '').trim();
  const description = String(body.description ?? '').trim();
  const priority = ['low', 'normal', 'high'].includes(String(body.priority)) ? String(body.priority) : 'normal';
  if (!subject || !description) return { error: 'Subject and description are required', status: 400 };
  const routeId = body.routeId ? String(body.routeId) : null;

  const ins = await svc
    .from('tms_grievance')
    .insert({
      submitter_profile_id: profileId,
      submitter_type: type,
      learner_id: null,
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
    console.error('portal grievance create error:', ins.error);
    return { error: 'Failed to submit grievance', status: 500 };
  }
  return { data: { id: (ins.data as { id: string } | null)?.id ?? null } };
}

/** Add a comment from the staff submitter to one of their own grievances. */
export async function addPortalComment(
  svc: Svc,
  args: { profileId: string; type: StaffSubmitterType; grievanceId: string; message: string }
): Promise<PortalResult<{ ok: true }>> {
  const { profileId, type, grievanceId } = args;
  const message = String(args.message ?? '').trim();
  if (!grievanceId || !message) return { error: 'grievanceId and message are required', status: 400 };

  const { data: g } = await svc
    .from('tms_grievance')
    .select('id')
    .eq('id', grievanceId)
    .eq('submitter_profile_id', profileId)
    .eq('submitter_type', type)
    .maybeSingle();
  if (!g) return { error: 'Not found', status: 404 };

  const ins = await svc.from('tms_grievance_comment').insert({
    grievance_id: grievanceId,
    author_id: profileId,
    author_role: type,
    message: message.slice(0, 2000),
  });
  if (ins.error) {
    console.error('portal grievance comment error:', ins.error);
    return { error: 'Failed to add comment', status: 500 };
  }
  await svc.from('tms_grievance').update({ updated_at: new Date().toISOString() }).eq('id', grievanceId);
  return { data: { ok: true } };
}
