import { NextResponse, type NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { denyUnlessPerm } from '@/lib/auth/require-perm';
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

/**
 * GET one learner's FULL boarding history for the admin learner detail page.
 *
 * Unlike /api/student/attendance (last 60 rows) this returns every row, because
 * the page totals them — a capped list would under-count present/absent. The
 * busiest learner has ~90 rows, so no paging is needed. Rows keep the student
 * endpoint's shape so the page can reuse its columns. Not wrapped in withAuth:
 * it cannot forward Next's dynamic `params`.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ learnerId: string }> }
) {
  try {
    const denied = await denyUnlessPerm(request, TMS_PERMISSIONS.ATTENDANCE_VIEW);
    if (denied) return denied;

    const { learnerId } = await params;
    if (!learnerId) {
      return NextResponse.json({ error: 'Learner id is required' }, { status: 400 });
    }

    const svc = createServiceRoleClient();
    const res = await svc
      .from('tms_attendance')
      .select('id, trip_date, direction, status, method, route_id, stop_id, scanned_at')
      .eq('learner_id', learnerId)
      .order('trip_date', { ascending: false })
      .order('scanned_at', { ascending: false });

    if (res.error) {
      if ((res.error as { code?: string }).code === '42P01') {
        return NextResponse.json({ success: true, data: [] });
      }
      console.error('Learner attendance query error:', res.error);
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
    console.error('Learner attendance API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
