import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { requirePerm } from '@/lib/auth/require-perm';
import { DATE_RE, UUID_RE, selectIn } from '@/lib/route-check/admin';

const LIMIT = 200;

type CheckRow = {
  id: string;
  route_id: string;
  vehicle_id: string | null;
  checker_id: string;
  check_date: string;
  leg: 'onward' | 'return';
  status: 'draft' | 'submitted';
  headcount: number | null;
  unknown_count: number | null;
  registered: number | null;
  booked: number | null;
  present: number | null;
  unpaid: number | null;
  without_booking: number | null;
  not_on_route: number | null;
  started_at: string;
  submitted_at: string | null;
};

// GET ?routeId&from&to&status — route check history, newest first (max 200).
async function listChecks(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.ROUTE_CHECK_MANAGE))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const sp = new URL(request.url).searchParams;
    const routeId = sp.get('routeId')?.trim() || '';
    const from = sp.get('from')?.trim() || '';
    const to = sp.get('to')?.trim() || '';
    const status = sp.get('status')?.trim() || '';
    if (routeId && !UUID_RE.test(routeId)) return NextResponse.json({ error: 'Invalid route id' }, { status: 400 });
    if ((from && !DATE_RE.test(from)) || (to && !DATE_RE.test(to))) {
      return NextResponse.json({ error: 'Dates must be YYYY-MM-DD' }, { status: 400 });
    }
    if (status && status !== 'draft' && status !== 'submitted' && status !== 'all') {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const svc = createServiceRoleClient();
    let query = svc
      .from('tms_route_check')
      .select(
        'id, route_id, vehicle_id, checker_id, check_date, leg, status, headcount, unknown_count, registered, booked, present, unpaid, without_booking, not_on_route, started_at, submitted_at'
      );
    if (routeId) query = query.eq('route_id', routeId);
    if (from) query = query.gte('check_date', from);
    if (to) query = query.lte('check_date', to);
    if (status === 'draft' || status === 'submitted') query = query.eq('status', status);
    const { data, error } = await query
      .order('check_date', { ascending: false })
      .order('started_at', { ascending: false })
      .limit(LIMIT);
    if (error) {
      console.error('route-checks list error:', error);
      return NextResponse.json({ error: 'Failed to load route checks' }, { status: 500 });
    }
    const checks = (data ?? []) as CheckRow[];

    const [routes, vehicles, profiles, persons] = await Promise.all([
      selectIn<{ id: string; route_number: string | null; route_name: string | null }>(
        svc, 'tms_route', 'id, route_number, route_name', 'id', checks.map((c) => c.route_id)
      ),
      selectIn<{ id: string; registration_number: string | null }>(
        svc, 'tms_vehicle', 'id, registration_number', 'id', checks.map((c) => c.vehicle_id ?? '')
      ),
      selectIn<{ id: string; full_name: string | null; email: string | null }>(
        svc, 'profiles', 'id, full_name, email', 'id', checks.map((c) => c.checker_id)
      ),
      selectIn<{ check_id: string; outcome: string }>(
        svc, 'tms_route_check_person', 'check_id, outcome', 'check_id', checks.map((c) => c.id)
      ),
    ]);
    const routeById = new Map(routes.map((r) => [r.id, r]));
    const vehicleById = new Map(vehicles.map((v) => [v.id, v]));
    const profileById = new Map(profiles.map((p) => [p.id, p]));
    const personCount = new Map<string, number>();
    const issueCount = new Map<string, number>();
    for (const p of persons) {
      personCount.set(p.check_id, (personCount.get(p.check_id) ?? 0) + 1);
      if (p.outcome !== 'ok') issueCount.set(p.check_id, (issueCount.get(p.check_id) ?? 0) + 1);
    }

    const rows = checks.map((c) => {
      const route = routeById.get(c.route_id);
      const checker = profileById.get(c.checker_id);
      return {
        id: c.id,
        routeId: c.route_id,
        routeNumber: route?.route_number ?? null,
        routeName: route?.route_name ?? null,
        vehicleId: c.vehicle_id,
        busRegistration: c.vehicle_id ? vehicleById.get(c.vehicle_id)?.registration_number ?? null : null,
        checkerId: c.checker_id,
        checkerName: checker?.full_name ?? null,
        checkerEmail: checker?.email ?? null,
        checkDate: c.check_date,
        leg: c.leg,
        status: c.status,
        headcount: c.headcount,
        unknownCount: c.unknown_count,
        counts: {
          registered: c.registered,
          booked: c.booked,
          present: c.present,
          unpaid: c.unpaid,
          withoutBooking: c.without_booking,
          notOnRoute: c.not_on_route,
        },
        personCount: personCount.get(c.id) ?? 0,
        issueCount: issueCount.get(c.id) ?? 0,
        startedAt: c.started_at,
        submittedAt: c.submitted_at,
      };
    });
    return NextResponse.json({ success: true, data: rows, count: rows.length, limit: LIMIT });
  } catch (e) {
    console.error('route-checks list error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => listChecks(request, auth));
