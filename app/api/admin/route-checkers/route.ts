import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/activity/log';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { requirePerm } from '@/lib/auth/require-perm';
import { UUID_RE, describeCheckerEmails, resolveLoginEmail, selectIn } from '@/lib/route-check/admin';

const forbidden = () => NextResponse.json({ error: 'Forbidden' }, { status: 403 });
const canManage = (auth: AuthContext) => requirePerm(auth, TMS_PERMISSIONS.ROUTE_CHECK_MANAGE);

type AssignmentRow = { id: string; checker_email: string; route_id: string; notes: string | null; assigned_at: string };
type RouteRow = { id: string; route_number: string | null; route_name: string | null; status: string | null };

// GET: active checker ↔ route assignments.
async function listAssignments(_req: NextRequest, auth: AuthContext) {
  try {
    if (!(await canManage(auth))) return forbidden();
    const svc = createServiceRoleClient();
    const { data, error } = await svc
      .from('tms_route_checker_assignment')
      .select('id, checker_email, route_id, notes, assigned_at')
      .eq('is_active', true)
      .order('assigned_at', { ascending: false });
    if (error) {
      console.error('route-checkers list error:', error);
      return NextResponse.json({ error: 'Failed to load checkers' }, { status: 500 });
    }
    const rows = (data ?? []) as AssignmentRow[];
    const [routes, people] = await Promise.all([
      selectIn<RouteRow>(svc, 'tms_route', 'id, route_number, route_name, status', 'id', rows.map((r) => r.route_id)),
      describeCheckerEmails(svc, rows.map((r) => r.checker_email)),
    ]);
    const routeById = new Map(routes.map((r) => [r.id, r]));
    const assignments = rows.map((r) => {
      const route = routeById.get(r.route_id);
      const who = people.get(r.checker_email);
      return {
        id: r.id,
        checkerEmail: r.checker_email,
        // The stored email IS the login email the checker must sign in with.
        loginEmail: r.checker_email,
        unverifiedLogin: !who?.verifiedLogin,
        checkerName: who?.name ?? null,
        designation: who?.designation ?? null,
        routeId: r.route_id,
        routeNumber: route?.route_number ?? null,
        routeName: route?.route_name ?? null,
        routeStatus: route?.status ?? null,
        assignedAt: r.assigned_at,
        notes: r.notes,
      };
    });
    return NextResponse.json({ success: true, data: assignments, count: assignments.length });
  } catch (e) {
    console.error('route-checkers list error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST: assign one person to one or more routes. Body:
// { email?, staffId?, profileId?, routeIds: string[], notes? }
async function assign(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await canManage(auth))) return forbidden();
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });

    const routeIds = Array.isArray(body.routeIds)
      ? [...new Set((body.routeIds as unknown[]).map((x) => String(x ?? '').trim()).filter(Boolean))]
      : [];
    if (!routeIds.length) return NextResponse.json({ error: 'Pick at least one route' }, { status: 400 });
    if (routeIds.length > 100) return NextResponse.json({ error: 'Too many routes in one request' }, { status: 400 });
    if (routeIds.some((id) => !UUID_RE.test(id))) return NextResponse.json({ error: 'Invalid route id' }, { status: 400 });
    const notesRaw = typeof body.notes === 'string' ? body.notes.trim() : '';
    if (notesRaw.length > 500) return NextResponse.json({ error: 'Notes are too long (max 500 characters)' }, { status: 400 });
    const notes = notesRaw || null;

    const svc = createServiceRoleClient();

    // Resolve the email the checker will actually LOG IN WITH (R5) — never
    // store a client-supplied address without this.
    const who = await resolveLoginEmail(svc, { email: body.email, staffId: body.staffId, profileId: body.profileId });
    if (!who.ok) return NextResponse.json({ error: who.error }, { status: who.status });
    const loginEmail = who.loginEmail;

    const routes = await selectIn<RouteRow>(svc, 'tms_route', 'id, route_number, route_name, status', 'id', routeIds);
    const routeById = new Map(routes.map((r) => [r.id, r]));
    const missing = routeIds.filter((id) => !routeById.has(id));
    if (missing.length) return NextResponse.json({ error: 'Route not found', routeIds: missing }, { status: 404 });
    const inactive = routes.filter((r) => r.status !== 'active');
    if (inactive.length) {
      return NextResponse.json(
        { error: `Route ${inactive.map((r) => r.route_number ?? r.id).join(', ')} is not active`, routeIds: inactive.map((r) => r.id) },
        { status: 400 }
      );
    }

    const { data: existing, error: exErr } = await svc
      .from('tms_route_checker_assignment')
      .select('route_id')
      .eq('checker_email', loginEmail)
      .eq('is_active', true)
      .in('route_id', routeIds);
    if (exErr) {
      console.error('route-checkers existing read error:', exErr);
      return NextResponse.json({ error: 'Failed to check existing assignments' }, { status: 500 });
    }
    const already = new Set(((existing ?? []) as { route_id: string }[]).map((r) => r.route_id));

    const created: { id: string; routeId: string; routeNumber: string | null }[] = [];
    const skipped: { routeId: string; routeNumber: string | null; reason: 'already_assigned' }[] = [];
    for (const routeId of routeIds) {
      const route = routeById.get(routeId)!;
      if (already.has(routeId)) {
        skipped.push({ routeId, routeNumber: route.route_number, reason: 'already_assigned' });
        continue;
      }
      const { data: row, error } = await svc
        .from('tms_route_checker_assignment')
        .insert({ checker_email: loginEmail, route_id: routeId, notes, assigned_by: auth.userId, is_active: true })
        .select('id')
        .single();
      if (error) {
        if (error.code === '23505') {
          // Raced with another assign — the unique partial index kept it single.
          skipped.push({ routeId, routeNumber: route.route_number, reason: 'already_assigned' });
          continue;
        }
        console.error('route-checkers insert error:', error);
        return NextResponse.json(
          { error: 'Failed to assign some routes', created, skipped, loginEmail },
          { status: 500 }
        );
      }
      created.push({ id: (row as { id: string }).id, routeId, routeNumber: route.route_number });
    }

    if (created.length) {
      await logActivity(auth, request, {
        module: 'route-checks',
        action: 'assign',
        entityType: 'tms_route_checker_assignment',
        entityId: created.length === 1 ? created[0].id : null,
        entityLabel: loginEmail,
        description: `Assigned route checker ${loginEmail} to route ${created.map((c) => c.routeNumber ?? c.routeId).join(', ')}`,
        metadata: {
          loginEmail,
          verifiedLogin: who.verified,
          loginSource: who.source,
          staffId: who.staffId,
          profileId: who.profileId,
          assignmentIds: created.map((c) => c.id),
          routeIds: created.map((c) => c.routeId),
          skippedRouteIds: skipped.map((s) => s.routeId),
        },
      });
    }

    return NextResponse.json(
      {
        success: true,
        message: created.length
          ? `Assigned ${created.length} route${created.length === 1 ? '' : 's'}${skipped.length ? `, ${skipped.length} already assigned` : ''}`
          : 'Already assigned to every selected route',
        data: {
          loginEmail,
          unverifiedLogin: !who.verified,
          loginSource: who.source,
          checkerName: who.name,
          created,
          skipped,
        },
      },
      { status: created.length ? 201 : 200 }
    );
  } catch (e) {
    console.error('route-checkers assign error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE ?id= : soft-remove one assignment (frees the unique index).
async function unassign(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await canManage(auth))) return forbidden();
    const id = new URL(request.url).searchParams.get('id')?.trim() ?? '';
    if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Assignment id is required' }, { status: 400 });

    const svc = createServiceRoleClient();
    const { data: existing, error: readErr } = await svc
      .from('tms_route_checker_assignment')
      .select('id, checker_email, route_id, is_active')
      .eq('id', id)
      .maybeSingle();
    if (readErr) {
      console.error('route-checkers unassign read error:', readErr);
      return NextResponse.json({ error: 'Failed to load assignment' }, { status: 500 });
    }
    if (!existing) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
    const row = existing as { id: string; checker_email: string; route_id: string; is_active: boolean };
    if (!row.is_active) return NextResponse.json({ success: true, message: 'Assignment already removed' });

    const { error } = await svc.from('tms_route_checker_assignment').update({ is_active: false }).eq('id', id);
    if (error) {
      console.error('route-checkers unassign error:', error);
      return NextResponse.json({ error: 'Failed to remove assignment' }, { status: 500 });
    }
    const { data: route } = await svc.from('tms_route').select('route_number').eq('id', row.route_id).maybeSingle();
    const routeLabel = (route as { route_number: string | null } | null)?.route_number ?? row.route_id;
    await logActivity(auth, request, {
      module: 'route-checks',
      action: 'unassign',
      entityType: 'tms_route_checker_assignment',
      entityId: id,
      entityLabel: row.checker_email,
      description: `Removed route checker ${row.checker_email} from route ${routeLabel}`,
      metadata: { checkerEmail: row.checker_email, routeId: row.route_id },
    });
    return NextResponse.json({ success: true, message: 'Checker removed from route' });
  } catch (e) {
    console.error('route-checkers unassign error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => listAssignments(request, auth));
export const POST = withAuth((request, auth) => assign(request, auth));
export const DELETE = withAuth((request, auth) => unassign(request, auth));
