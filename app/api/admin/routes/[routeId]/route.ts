import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { logActivity } from '@/lib/activity/log';
import { ACTIVE_LIFECYCLE_STATUSES } from '@/lib/passengers/types';

/**
 * GET one route (full tms_route row + its ordered stops) by id. Backs the
 * in-module route view/edit pages so they survive deep-link / hard refresh.
 * Auth is enforced by proxy.ts (every /api route requires an authenticated TMS
 * user), matching the sibling [routeId]/stops handler.
 *
 * Note: this is the handler for /api/admin/routes/[routeId] itself — distinct
 * from the existing [routeId]/stops and [routeId]/possible-stops children.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ routeId: string }> }
) {
  try {
    const { routeId } = await params;
    if (!routeId) {
      return NextResponse.json({ error: 'Route id is required' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: route, error } = await supabase
      .from('tms_route')
      .select('*')
      .eq('id', routeId)
      .maybeSingle();

    if (error) {
      console.error('Route detail query error:', error);
      return NextResponse.json({ error: 'Failed to fetch route' }, { status: 500 });
    }
    if (!route) {
      return NextResponse.json({ error: 'Route not found' }, { status: 404 });
    }

    const { data: stops } = await supabase
      .from('tms_route_stop')
      .select('*')
      .eq('route_id', routeId)
      .order('sequence_order', { ascending: true });

    // Occupancy: seats come from the assigned vehicle (tms_route.total_capacity is
    // stale — 0 for most routes); riders are counted live from the allocation
    // (current_passengers is stale too), using the same roster filter as the portals.
    let vehicleCapacity: number | null = null;
    if (route.vehicle_id) {
      const { data: veh } = await supabase
        .from('tms_vehicle')
        .select('capacity')
        .eq('id', route.vehicle_id)
        .maybeSingle();
      vehicleCapacity = (veh as { capacity: number | null } | null)?.capacity ?? null;
    }
    // Learner + staff rider counts, each using the same filter as its roster
    // drill-down. The staff table may be absent in some environments (42P01) —
    // that error just yields a null count, which we treat as zero.
    const [{ count: passengerCount }, { count: staffCount }] = await Promise.all([
      supabase
        .from('learners_profiles')
        .select('id', { count: 'exact', head: true })
        .eq('transport_route_id', routeId)
        .eq('bus_required', true)
        .in('lifecycle_status', [...ACTIVE_LIFECYCLE_STATUSES]),
      supabase
        .from('staff')
        .select('id', { count: 'exact', head: true })
        .eq('transport_route_id', routeId)
        .eq('bus_required', true)
        .eq('is_active', true),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        ...route,
        route_stops: stops ?? [],
        _vehicleCapacity: vehicleCapacity,
        _passengerCount: passengerCount ?? 0,
        _staffCount: staffCount ?? 0,
      },
    });
  } catch (e) {
    console.error('Route detail API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** Granular permission check (copies the modern per-route pattern used across the app). */
async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

/**
 * DELETE one route. Runs with the SERVICE ROLE so it actually bypasses RLS —
 * the previous client path (DatabaseService.deleteRoute, anon key) was silently
 * filtered by the tms_route DELETE policy and deleted zero rows while reporting
 * success, so removed routes kept reappearing.
 *
 * FK behaviour (verified against the DB): deleting a tms_route CASCADES to its
 * stops, possible-stops, service-calendar rows, staff route assignments and
 * booking windows, and NULLs learner/staff/attendance/grievance references.
 * Only tms_booking (ON DELETE NO ACTION) can block the delete — surfaced as 409.
 */
async function deleteRoute(request: NextRequest, auth: AuthContext, routeId: string) {
  try {
    if (!routeId) {
      return NextResponse.json({ error: 'Route id is required' }, { status: 400 });
    }
    if (!(await requirePerm(auth, TMS_PERMISSIONS.ROUTES_DELETE))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const svc = createServiceRoleClient();

    // Existence check + label for the confirmation message / activity log.
    const { data: route, error: fetchErr } = await svc
      .from('tms_route')
      .select('id, route_number, route_name')
      .eq('id', routeId)
      .maybeSingle();
    if (fetchErr) {
      console.error('Route delete: fetch error', fetchErr);
      return NextResponse.json({ error: 'Failed to load route' }, { status: 500 });
    }
    if (!route) {
      return NextResponse.json({ error: 'Route not found' }, { status: 404 });
    }

    const { error: delErr } = await svc.from('tms_route').delete().eq('id', routeId);
    if (delErr) {
      console.error('Route delete error:', delErr);
      // 23503 = FK violation → an ON DELETE NO ACTION child (tms_booking) still references it.
      if (delErr.code === '23503') {
        return NextResponse.json(
          {
            error: `Cannot delete route ${route.route_number}: it still has bookings referencing it. Cancel those bookings first.`,
          },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: 'Failed to delete route' }, { status: 500 });
    }

    await logActivity(auth, request, {
      module: 'routes',
      action: 'delete',
      entityType: 'tms_route',
      entityId: routeId,
      entityLabel: route.route_number ?? route.route_name,
      description: `Deleted route ${route.route_number ?? route.route_name}`,
    });

    return NextResponse.json({
      success: true,
      message: `Route ${route.route_number} (${route.route_name}) has been deleted successfully.`,
    });
  } catch (e) {
    console.error('Route delete API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ routeId: string }> }
) {
  const { routeId } = await params;
  // withAuth gives us typed auth context + defense-in-depth; params is threaded in
  // via the closure since withAuth's wrapper only forwards the request.
  return withAuth((req, auth) => deleteRoute(req, auth, routeId))(request);
}
