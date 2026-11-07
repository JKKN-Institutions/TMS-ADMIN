import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { requirePerm } from '@/lib/auth/require-perm';
import { selectIn, staffName } from '@/lib/route-check/admin';
import { istToday } from '@/lib/booking/window';
import { filterChecks, parseCheckDate, toAdminRow } from '@/lib/tracking/pre-trip-admin';

/** Every column except the photo path, which never leaves the server. */
const SELECT =
  'id, check_date, created_at, driver_id, vehicle_id, trip_id, skipped, skip_reason, tyres_ok, brakes_ok, lights_ok, horn_ok, fuel_level_ok, first_aid_box_ok, odometer_km, odometer_photo_path, any_issue, notes';

type DbRow = Parameters<typeof toAdminRow>[0];

/**
 * GET /api/admin/pre-trip-checks?date=YYYY-MM-DD&issues=1
 *
 * The drivers' pre-trip checks for one IST date (default today), newest first.
 * issues=1 keeps only rows with a NOT OK or a skip. Gated on tms.dashboard.view —
 * the same permission as the table's read policy (held by transport_head; super
 * admins pass). The photo path is replaced by hasPhoto; the photo itself is only
 * reachable through /api/admin/pre-trip-checks/<id>/photo.
 */
async function listChecks(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.DASHBOARD_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const sp = new URL(request.url).searchParams;
    const today = istToday();
    const date = parseCheckDate(sp.get('date'), today);
    const issuesOnly = sp.get('issues') === '1';

    const svc = createServiceRoleClient();
    const { data, error } = await svc
      .from('tms_pre_trip_check')
      .select(SELECT)
      .eq('check_date', date)
      .order('created_at', { ascending: false });
    if (error) throw error;
    const rows = (data ?? []) as unknown as DbRow[];

    const drivers = await selectIn<{ id: string; staff_id: string | null }>(
      svc,
      'tms_driver',
      'id, staff_id',
      'id',
      rows.map((r) => r.driver_id)
    );
    const [staff, vehicles] = await Promise.all([
      selectIn<{ id: string; first_name: string | null; last_name: string | null }>(
        svc,
        'staff',
        'id, first_name, last_name',
        'id',
        drivers.map((d) => d.staff_id ?? '')
      ),
      selectIn<{ id: string; registration_number: string | null }>(
        svc,
        'tms_vehicle',
        'id, registration_number',
        'id',
        rows.map((r) => r.vehicle_id)
      ),
    ]);
    const staffById = new Map(staff.map((s) => [s.id, staffName(s)]));
    const nameByDriver = new Map(drivers.map((d) => [d.id, d.staff_id ? staffById.get(d.staff_id) ?? null : null]));
    const regByVehicle = new Map(vehicles.map((v) => [v.id, v.registration_number]));

    const all = rows.map((r) =>
      toAdminRow(r, {
        driverName: nameByDriver.get(r.driver_id) ?? null,
        busRegistration: regByVehicle.get(r.vehicle_id) ?? null,
      })
    );

    return NextResponse.json({
      success: true,
      data: {
        date,
        today,
        totals: { all: all.length, flagged: all.filter((r) => r.anyIssue).length },
        rows: filterChecks(all, issuesOnly),
      },
    });
  } catch (e) {
    console.error('admin/pre-trip-checks GET error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => listChecks(request, auth));
