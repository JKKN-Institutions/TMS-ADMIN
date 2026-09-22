import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/activity/log';
import { istToday } from '@/lib/booking/window';
import { canCheckRoute } from '@/lib/route-check/access';
import { UUID_RE } from '@/lib/route-check/admin';

/**
 * POST { routeId, leg } — create or resume TODAY's draft check for this
 * checker on this route and leg. The partial unique index
 * (checker_id, route_id, check_date, leg) where status='draft' keeps it single.
 */
async function start(request: NextRequest, auth: AuthContext) {
  try {
    const body = (await request.json().catch(() => ({}))) as { routeId?: unknown; leg?: unknown };
    const routeId = typeof body.routeId === 'string' ? body.routeId.trim() : '';
    const leg = body.leg === 'onward' || body.leg === 'return' ? body.leg : null;
    if (!UUID_RE.test(routeId)) return NextResponse.json({ error: 'Invalid route id' }, { status: 400 });
    if (!leg) return NextResponse.json({ error: 'Pick Morning or Evening' }, { status: 400 });

    const svc = createServiceRoleClient();
    if (!(await canCheckRoute(auth, svc, routeId))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { data: route, error: rErr } = await svc.from('tms_route').select('id, vehicle_id, status').eq('id', routeId).maybeSingle();
    if (rErr) { console.error('route-check start: route read error:', rErr); return NextResponse.json({ error: 'Failed to load route' }, { status: 500 }); }
    if (!route) return NextResponse.json({ error: 'Route not found' }, { status: 404 });
    if (route.status !== 'active') return NextResponse.json({ error: 'This route is not active' }, { status: 409 });

    const date = istToday();
    const findDraft = async () => {
      const { data, error } = await svc.from('tms_route_check').select('id')
        .eq('checker_id', auth.userId).eq('route_id', routeId).eq('check_date', date).eq('leg', leg).eq('status', 'draft').maybeSingle();
      if (error) throw new Error(`draft read failed: ${error.message}`);
      return (data as { id: string } | null)?.id ?? null;
    };
    const existing = await findDraft();
    if (existing) return NextResponse.json({ success: true, data: { checkId: existing, resumed: true } });

    const { data: created, error: cErr } = await svc.from('tms_route_check')
      .insert({ route_id: routeId, vehicle_id: route.vehicle_id ?? null, checker_id: auth.userId, check_date: date, leg, status: 'draft' })
      .select('id').single();
    if (cErr) {
      if (cErr.code === '23505') {
        const raced = await findDraft();
        if (raced) return NextResponse.json({ success: true, data: { checkId: raced, resumed: true } });
      }
      console.error('route-check start: insert error:', cErr);
      return NextResponse.json({ error: 'Failed to start the check' }, { status: 500 });
    }
    const checkId = (created as { id: string }).id;
    await logActivity(auth, request, {
      module: 'route-checks', action: 'create', entityType: 'tms_route_check', entityId: checkId,
      entityLabel: `${date} ${leg}`, description: `Started route check (${leg}) for route ${routeId}`,
      metadata: { routeId, leg, date },
    });
    return NextResponse.json({ success: true, data: { checkId, resumed: false } }, { status: 201 });
  } catch (e) {
    console.error('route-check start error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => start(request, auth));
