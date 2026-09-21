import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { loadRouteRosterView, RouteRosterReadError } from '@/lib/attendance/route-roster';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Same log lines and 500 messages this route has always produced per failed read. */
const READ_FAILURE = {
  route: { log: 'admin attendance roster: failed to load route:', message: 'Failed to load route' },
  stops: { log: 'admin attendance roster: failed to load stops:', message: 'Failed to load route stops' },
  attendance: { log: 'admin attendance roster: failed to load attendance:', message: 'Failed to load attendance' },
} as const;

/**
 * GET /api/admin/attendance/roster — one route, one date, one leg.
 *
 * The roster itself is assembled by lib/attendance/route-roster.ts, which
 * reuses the SAME pure helpers the boarding staff screen uses
 * (loadRouteAttendanceRoster + buildRosterRows), so present/absent/unmarked,
 * walk-up badges and ownership read identically on both screens. Any date is
 * allowed: viewing history is not marking it.
 */
async function getAdminRoster(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const url = new URL(request.url);
    const routeId = url.searchParams.get('routeId') ?? '';
    const date = url.searchParams.get('date') ?? '';
    const direction: 'onward' | 'return' =
      url.searchParams.get('direction') === 'return' ? 'return' : 'onward';

    if (!UUID.test(routeId)) {
      return NextResponse.json({ error: 'routeId must be a UUID' }, { status: 400 });
    }
    if (!ISO_DATE.test(date)) {
      return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
    }

    const svc = createServiceRoleClient();

    // An admin on this screen is the correction path by definition: they hold
    // tms.attendance.view, and the write route re-decides every gate server-side
    // anyway, so an over-permissive can_edit hint cannot grant anything.
    const isOverrideHolder = await requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_OVERRIDE);

    let view;
    try {
      view = await loadRouteRosterView(svc, {
        routeId,
        date,
        direction,
        viewer: { actorId: auth.userId, isOverrideHolder, isSuperAdmin: auth.isSuperAdmin },
        withFees: false,
      });
    } catch (e) {
      if (e instanceof RouteRosterReadError) {
        const f = READ_FAILURE[e.stage];
        console.error(f.log, e.cause);
        return NextResponse.json({ error: f.message }, { status: 500 });
      }
      throw e;
    }
    if (!view) return NextResponse.json({ error: 'Route not found' }, { status: 404 });

    return NextResponse.json({
      success: true,
      data: {
        date, direction,
        route: view.route,
        rows: view.rows,
        counts: view.counts,
      },
    });
  } catch (e) {
    console.error('admin attendance roster error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getAdminRoster(request, auth));
