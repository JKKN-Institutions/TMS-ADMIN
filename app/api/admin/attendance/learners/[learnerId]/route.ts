import { parseRiderKind, type RiderKind } from '@/lib/attendance/rider-kind';
import { NextResponse, type NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { denyUnlessPerm } from '@/lib/auth/require-perm';
import { loadPassengerRefs } from '@/lib/passengers/refs';
import { loadMarkerNames } from '@/lib/boarding/identity';
import { LEARNER_SELECT, mapLearner, type LearnerRow } from '@/lib/passengers/types';
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
  scanned_by: string | null;
  rider_kind: string | null;
}

/** Who the report is about. Null when the learner record no longer exists. */
export interface LearnerReportIdentity {
  id: string;
  name: string;
  rollNumber: string | null;
  institution: string | null;
  department: string | null;
  /** The bus the learner is assigned to; null for hostel and irregular riders. */
  routeLabel: string | null;
  stopLabel: string | null;
}

export interface LearnerReportRow {
  id: string;
  tripDate: string;
  direction: string;
  status: string;
  method: string;
  routeLabel: string | null;
  stopLabel: string | null;
  scannedAt: string;
  /** Who scanned or marked it (the in-charge). Null for automatic marks or a deleted profile. */
  markedByName: string | null;
  riderKind: RiderKind | null;
}

export interface LearnerReportResponse {
  learner: LearnerReportIdentity | null;
  rows: LearnerReportRow[];
}

/**
 * GET /api/admin/attendance/learners/[learnerId] — one learner's attendance
 * report: who they are, and their FULL boarding history.
 *
 * Every row is returned, not a recent page, because the report totals them — a
 * capped list would under-count present/absent. The busiest learner has ~90
 * rows, so no paging is needed. Rows keep /api/student/attendance's shape so the
 * page can reuse its columns.
 *
 * The identity comes with the rows so the page needs only tms.attendance.view,
 * and so a hostel or irregular rider (who is not in the Learners module) still
 * gets a name. Not wrapped in withAuth: it cannot forward Next's dynamic `params`.
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
    const [att, who] = await Promise.all([
      svc
        .from('tms_attendance')
        .select('id, trip_date, direction, status, method, route_id, stop_id, scanned_at, scanned_by, rider_kind')
        .eq('learner_id', learnerId)
        .order('trip_date', { ascending: false })
        .order('scanned_at', { ascending: false }),
      svc.from('learners_profiles').select(LEARNER_SELECT).eq('id', learnerId).maybeSingle(),
    ]);

    let rows: AttRow[] = [];
    if (att.error) {
      // A missing table reads as "no attendance yet"; anything else is a failure.
      if ((att.error as { code?: string }).code !== '42P01') {
        console.error('Learner attendance query error:', att.error);
        return NextResponse.json({ error: 'Failed to load attendance' }, { status: 500 });
      }
    } else {
      rows = (att.data ?? []) as AttRow[];
    }

    // The identity is a header, not the report: if it cannot be read the rows
    // still go out and the page falls back to a generic title.
    if (who.error) console.error('Learner identity query error:', who.error);
    const learnerRow = who.error ? null : ((who.data as unknown as LearnerRow | null) ?? null);

    const [refs, markerNames] = await Promise.all([
      loadPassengerRefs(svc, {
        institutionIds: [learnerRow?.institution_id ?? null],
        departmentIds: [learnerRow?.department_id ?? null],
        routeIds: [...rows.map((r) => r.route_id), learnerRow?.transport_route_id ?? null],
        stopIds: [...rows.map((r) => r.stop_id), learnerRow?.transport_stop_id ?? null],
      }),
      loadMarkerNames(svc, rows.map((r) => r.scanned_by)),
    ]);

    let learner: LearnerReportIdentity | null = null;
    if (learnerRow) {
      const m = mapLearner(learnerRow, refs);
      learner = {
        id: m.id,
        name: m.name,
        rollNumber: m.rollNumber,
        institution: m.institutionName,
        department: m.departmentName,
        routeLabel: m.routeLabel,
        stopLabel: m.stopLabel,
      };
    }

    const data: LearnerReportResponse = {
      learner,
      rows: rows.map((r) => {
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
          markedByName: r.scanned_by ? markerNames.get(r.scanned_by) ?? null : null,
          riderKind: parseRiderKind(r.rider_kind),
        };
      }),
    };

    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error('Learner attendance API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
