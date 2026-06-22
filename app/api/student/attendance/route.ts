import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getLearnerRowForUser } from '@/lib/student/identity';
import { loadPassengerRefs } from '@/lib/passengers/refs';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';

interface AttRow {
  id: string;
  trip_date: string;
  direction: string;
  status: string;
  method: string;
  route_id: string | null;
  stop_id: string | null;
  scanned_at: string;
}

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

async function getAttendance(_request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.PASSENGER_SELF_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const learner = await getLearnerRowForUser(auth);
    if (!learner) return NextResponse.json({ error: 'Learner profile not found' }, { status: 404 });

    const svc = createServiceRoleClient();
    const res = await svc
      .from('tms_attendance')
      .select('id, trip_date, direction, status, method, route_id, stop_id, scanned_at')
      .eq('learner_id', learner.id)
      .order('trip_date', { ascending: false })
      .order('scanned_at', { ascending: false })
      .limit(60);

    if (res.error) {
      if ((res.error as { code?: string }).code === '42P01') {
        return NextResponse.json({ success: true, data: [] });
      }
      console.error('student/attendance error:', res.error);
      return NextResponse.json({ error: 'Failed to load attendance' }, { status: 500 });
    }

    const rows = (res.data ?? []) as AttRow[];
    const refs = await loadPassengerRefs(svc, {
      institutionIds: [],
      departmentIds: [],
      routeIds: rows.map((r) => r.route_id),
      stopIds: rows.map((r) => r.stop_id),
    });

    const data = rows.map((r) => {
      const route = r.route_id ? refs.routes.get(r.route_id) : null;
      return {
        id: r.id,
        tripDate: r.trip_date,
        direction: r.direction,
        status: r.status,
        method: r.method,
        routeLabel: route ? `${route.routeNumber} · ${route.routeName}` : null,
        stopLabel: r.stop_id ? refs.stops.get(r.stop_id) ?? null : null,
        scannedAt: r.scanned_at,
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error('student/attendance error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getAttendance(request, auth));
