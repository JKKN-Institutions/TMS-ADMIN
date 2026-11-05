import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { requirePerm } from '@/lib/auth/require-perm';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { loadPassengerRefs } from '@/lib/passengers/refs';
import { isMonthKey, istMonth } from '@/lib/attendance/month-summary';
import { parseRiderKind, type RiderKind } from '@/lib/attendance/rider-kind';

interface MonthRpcRow {
  learner_id: string;
  name: string | null;
  roll_number: string | null;
  institution_id: string | null;
  route_id: string | null;
  rider_kind: string | null;
  days_travelled: number;
  onward_present: number;
  return_present: number;
  both_trip_days: number;
  staff_absent: number;
  auto_absent: number;
  without_booking: number;
  last_travel: string | null;
}

export interface LearnerRegisterRow {
  learnerId: string;
  name: string;
  rollNumber: string | null;
  institution: string | null;
  routeId: string | null;
  routeLabel: string | null;
  riderKind: RiderKind;
  daysTravelled: number;
  onwardPresent: number;
  returnPresent: number;
  bothTripDays: number;
  staffAbsent: number;
  autoAbsent: number;
  withoutBooking: number;
  lastTravel: string | null;
}

/**
 * GET /api/admin/attendance/learners?month=YYYY-MM — the Learner register.
 *
 * One row per learner with any attendance in the month, aggregated in SQL
 * (tms_learner_attendance_month) so ~100k trip rows become ~2,000 learner
 * rows. Filtering by bus / rider type happens in the table on the page.
 */
async function getRegister(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const raw = new URL(request.url).searchParams.get('month');
    const month = raw ?? istMonth();
    if (!isMonthKey(month)) {
      return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 });
    }

    const svc = createServiceRoleClient();
    const { data, error } = await svc.rpc('tms_learner_attendance_month', { p_month: `${month}-01` });
    if (error) {
      console.error('learner register error:', error);
      return NextResponse.json({ error: 'Failed to load the learner register' }, { status: 500 });
    }
    const raws = (data ?? []) as MonthRpcRow[];

    const refs = await loadPassengerRefs(svc, {
      institutionIds: raws.map((r) => r.institution_id),
      departmentIds: [],
      routeIds: raws.map((r) => r.route_id),
      stopIds: [],
    });

    const rows: LearnerRegisterRow[] = raws.map((r) => {
      const route = r.route_id ? refs.routes.get(r.route_id) : null;
      return {
        learnerId: r.learner_id,
        name: r.name ?? 'Learner',
        rollNumber: r.roll_number,
        institution: r.institution_id ? refs.institutions.get(r.institution_id) ?? null : null,
        routeId: r.route_id,
        routeLabel: route ? `${route.routeNumber} · ${route.routeName}` : null,
        riderKind: parseRiderKind(r.rider_kind) ?? 'transport',
        daysTravelled: r.days_travelled,
        onwardPresent: r.onward_present,
        returnPresent: r.return_present,
        bothTripDays: r.both_trip_days,
        staffAbsent: r.staff_absent,
        autoAbsent: r.auto_absent,
        withoutBooking: r.without_booking,
        lastTravel: r.last_travel,
      };
    });

    return NextResponse.json({ success: true, data: { month, rows } });
  } catch (e) {
    console.error('learner register error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getRegister(request, auth));
