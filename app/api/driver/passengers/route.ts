import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getDriverForUser } from '@/lib/driver/identity';
import { getDriverRoutes } from '@/lib/driver/routes';
import { loadPassengerRefs } from '@/lib/passengers/refs';
import {
  LEARNER_SELECT,
  ACTIVE_LIFECYCLE_STATUSES,
  mapLearner,
  type LearnerRow,
} from '@/lib/passengers/types';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

/**
 * GET /api/driver/passengers — the bus-required, actively-enrolled learners allocated
 * to the signed-in driver's route(s), grouped per route and ordered by stop sequence.
 * Reuses the Passenger module's LEARNER_SELECT + mapLearner + loadPassengerRefs so the
 * roster definition stays consistent with the admin Learners page.
 */
async function getPassengers(_request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.DRIVER_SELF_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const drv = await getDriverForUser(auth);
    if (!drv) {
      return NextResponse.json({ error: 'Driver profile not found' }, { status: 404 });
    }

    const routes = await getDriverRoutes(drv.staff_id, drv.assigned_route_id);
    const routeIds = routes.map((r) => r.id);
    if (routeIds.length === 0) {
      return NextResponse.json({ success: true, data: { totalPassengers: 0, routes: [] } });
    }

    const svc = createServiceRoleClient();
    const lres = await svc
      .from('learners_profiles')
      .select(LEARNER_SELECT)
      .in('transport_route_id', routeIds)
      .eq('bus_required', true)
      .in('lifecycle_status', [...ACTIVE_LIFECYCLE_STATUSES]);
    const rows = (lres.data ?? []) as unknown as LearnerRow[];

    const refs = await loadPassengerRefs(svc, {
      institutionIds: rows.map((r) => r.institution_id),
      departmentIds: rows.map((r) => r.department_id),
      routeIds,
      stopIds: rows.map((r) => r.transport_stop_id),
      programIds: rows.map((r) => r.program_id),
      semesterIds: rows.map((r) => r.semester_id),
    });

    // stopId → sequence order (for sorting the roster by boarding order)
    const stopOrder = new Map<string, number | null>();
    for (const rt of routes) for (const s of rt.stops) stopOrder.set(s.id, s.order);

    const result = routes.map((rt) => {
      const passengers = rows
        .filter((r) => r.transport_route_id === rt.id)
        .map((r) => ({
          ...mapLearner(r, refs),
          stopOrder: r.transport_stop_id ? stopOrder.get(r.transport_stop_id) ?? null : null,
        }))
        .sort((a, b) => {
          const ao = a.stopOrder ?? 9999;
          const bo = b.stopOrder ?? 9999;
          if (ao !== bo) return ao - bo;
          return a.name.localeCompare(b.name);
        });
      return { id: rt.id, label: rt.label, passengers };
    });

    return NextResponse.json({
      success: true,
      data: { totalPassengers: rows.length, routes: result },
    });
  } catch (e) {
    console.error('driver/passengers error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getPassengers(request, auth));
