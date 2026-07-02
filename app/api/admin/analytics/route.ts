import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { istToday, addDays } from '@/lib/booking/window';

/**
 * Transport analytics, aggregated server-side over the LIVE tms_ / learners /
 * billing tables. Replaces the previous handler that queried dropped legacy
 * tables (students/routes/drivers/bookings/grievances) and returned data the
 * page then overwrote with Math.random().
 *
 * Every figure below traces to a real row. The date range (?from&?to, default
 * last 90 days) scopes the two time-series (revenue trend, bookings trend) and
 * the in-range booking count; structural inventory (routes/vehicles/drivers/
 * learners) is point-in-time "current" and labelled as such in the UI.
 */

const isDate = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isMissingTable = (e: unknown) => (e as { code?: string } | null)?.code === '42P01';
const num = (v: unknown): number => {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
};
const monthKey = (iso: string | null): string | null => (iso ? iso.slice(0, 7) : null);

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

// A transport bill is fee_source='ad_hoc' with a transport_year_id set. Academic
// and hostel bills in the shared billing table belong to sibling apps — excluded.
type BillRow = {
  status: string | null;
  final_amount: number | string | null;
  balance_amount: number | string | null;
  payment_date: string | null;
  created_at: string | null;
  due_date: string | null;
};
type RouteRow = {
  id: string;
  route_name: string | null;
  route_number: string | null;
  status: string | null;
};
type VehicleRow = {
  status: string | null;
  insurance_expiry: string | null;
  fitness_expiry: string | null;
  permit_expiry_date: string | null;
  pollution_expiry_date: string | null;
};

const VOID_STATUSES = new Set(['cancelled', 'superseded']);

async function getAnalytics(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.REPORTS_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const url = new URL(request.url);
    const today = istToday();
    const from = isDate(url.searchParams.get('from')) ? (url.searchParams.get('from') as string) : addDays(today, -90);
    const to = isDate(url.searchParams.get('to')) ? (url.searchParams.get('to') as string) : today;
    const soon = addDays(today, 30); // "expiring soon" horizon for fleet compliance

    const svc = createServiceRoleClient();

    const [
      billsRes,
      bookingsRes,
      routesRes,
      vehiclesRes,
      grievancesRes,
      learnersRouteRes,
      learnersTransportRes,
      learnersActiveRes,
      driversRes,
    ] = await Promise.all([
      svc
        .from('billing_student_bills')
        .select('status, final_amount, balance_amount, payment_date, created_at, due_date')
        .not('transport_year_id', 'is', null),
      svc.from('tms_booking').select('travel_date').gte('travel_date', from).lte('travel_date', to),
      svc.from('tms_route').select('id, route_name, route_number, status'),
      svc
        .from('tms_vehicle')
        .select('status, insurance_expiry, fitness_expiry, permit_expiry_date, pollution_expiry_date'),
      svc.from('tms_grievance').select('status, category'),
      // Route load = active, bus-requiring learners assigned to each route. The
      // tms_route.current_passengers/total_capacity columns are unpopulated (all
      // zero), so learner allocation is the real per-route demand signal.
      svc
        .from('learners_profiles')
        .select('transport_route_id')
        .eq('bus_required', true)
        .eq('lifecycle_status', 'active')
        .not('transport_route_id', 'is', null),
      svc
        .from('learners_profiles')
        .select('*', { count: 'exact', head: true })
        .eq('bus_required', true)
        .eq('lifecycle_status', 'active'),
      svc.from('learners_profiles').select('*', { count: 'exact', head: true }).eq('lifecycle_status', 'active'),
      svc.from('staff').select('*', { count: 'exact', head: true }).eq('role_key', 'driver'),
    ]);

    // A dropped/missing table should degrade to empty, never 500 the whole page.
    const bail = [billsRes, bookingsRes, routesRes, vehiclesRes, grievancesRes].find(
      (r) => r.error && !isMissingTable(r.error)
    );
    if (bail?.error) {
      console.error('Analytics query error:', bail.error);
    }

    const bills = (billsRes.data ?? []) as BillRow[];
    const bookings = (bookingsRes.data ?? []) as { travel_date: string }[];
    const routes = (routesRes.data ?? []) as RouteRow[];
    const vehicles = (vehiclesRes.data ?? []) as VehicleRow[];
    const grievances = (grievancesRes.data ?? []) as { status: string | null; category: string | null }[];

    // ── Financial: transport bills ────────────────────────────────────────────
    const liveBills = bills.filter((b) => !VOID_STATUSES.has(b.status ?? ''));
    let billed = 0;
    let collected = 0;
    let outstanding = 0;
    let overdueAmount = 0;
    const statusAgg: Record<string, { count: number; amount: number }> = {};
    const trend: Record<string, { billed: number; collected: number }> = {};

    for (const b of bills) {
      const s = b.status ?? 'unknown';
      const final = num(b.final_amount);
      const balance = num(b.balance_amount);
      const paid = Math.max(0, final - balance);
      (statusAgg[s] ??= { count: 0, amount: 0 }).count += 1;
      statusAgg[s].amount += final;

      if (!VOID_STATUSES.has(s)) {
        billed += final;
        collected += paid;
        outstanding += balance;
        if (balance > 0 && isDate(b.due_date) && b.due_date! < today) overdueAmount += balance;

        // Billed bucketed by created_at; collected by payment_date (fallback created_at).
        const bMonth = monthKey(b.created_at);
        if (bMonth && bMonth >= from.slice(0, 7) && bMonth <= to.slice(0, 7)) {
          (trend[bMonth] ??= { billed: 0, collected: 0 }).billed += final;
        }
        if (paid > 0) {
          const cMonth = monthKey(b.payment_date) ?? monthKey(b.created_at);
          if (cMonth && cMonth >= from.slice(0, 7) && cMonth <= to.slice(0, 7)) {
            (trend[cMonth] ??= { billed: 0, collected: 0 }).collected += paid;
          }
        }
      }
    }

    const collectionStatus = Object.entries(statusAgg)
      .map(([status, v]) => ({ status, count: v.count, amount: Math.round(v.amount) }))
      .sort((a, b) => b.count - a.count);

    const revenueTrend = Object.entries(trend)
      .map(([month, v]) => ({ month, billed: Math.round(v.billed), collected: Math.round(v.collected) }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // ── Operations: route load (assigned transport learners per route) ──────────
    const learnerRoutes = (learnersRouteRes.data ?? []) as { transport_route_id: string | null }[];
    const loadByRoute: Record<string, number> = {};
    for (const lr of learnerRoutes) {
      if (lr.transport_route_id) loadByRoute[lr.transport_route_id] = (loadByRoute[lr.transport_route_id] ?? 0) + 1;
    }
    const routeName = (r: RouteRow) => r.route_name || (r.route_number ? `Route ${r.route_number}` : 'Route');
    const routeLoad = routes
      .map((r) => ({ name: routeName(r), learners: loadByRoute[r.id] ?? 0 }))
      .filter((r) => r.learners > 0)
      .sort((a, b) => b.learners - a.learners);

    // ── Operations: bookings trend (presence-based; one row = one booking) ──────
    const bookingByDate: Record<string, number> = {};
    for (const bk of bookings) bookingByDate[bk.travel_date] = (bookingByDate[bk.travel_date] ?? 0) + 1;
    const bookingsTrend = Object.entries(bookingByDate)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // ── Operations: fleet compliance (expiry buckets per document type) ─────────
    const docTypes: { key: keyof VehicleRow; label: string }[] = [
      { key: 'insurance_expiry', label: 'Insurance' },
      { key: 'fitness_expiry', label: 'Fitness' },
      { key: 'permit_expiry_date', label: 'Permit' },
      { key: 'pollution_expiry_date', label: 'Pollution' },
    ];
    const fleetCompliance = docTypes.map(({ key, label }) => {
      let expired = 0;
      let expiring = 0;
      let valid = 0;
      let unknown = 0;
      for (const v of vehicles) {
        const d = v[key] as string | null;
        if (!isDate(d)) unknown += 1;
        else if (d! < today) expired += 1;
        else if (d! <= soon) expiring += 1;
        else valid += 1;
      }
      return { type: label, expired, expiring, valid, unknown };
    });

    // ── Grievances (small volume; real) ─────────────────────────────────────────
    const grStatus: Record<string, number> = {};
    const grCategory: Record<string, number> = {};
    for (const g of grievances) {
      grStatus[g.status ?? 'unknown'] = (grStatus[g.status ?? 'unknown'] ?? 0) + 1;
      grCategory[g.category ?? 'other'] = (grCategory[g.category ?? 'other'] ?? 0) + 1;
    }
    const openGrievances = (grStatus['open'] ?? 0) + (grStatus['in_progress'] ?? 0);

    const activeVehicles = vehicles.filter((v) => (v.status ?? '') === 'active').length;
    const activeRoutes = routes.filter((r) => (r.status ?? '') === 'active').length;

    return NextResponse.json({
      success: true,
      data: {
        range: { from, to },
        kpis: {
          billed: Math.round(billed),
          collected: Math.round(collected),
          outstanding: Math.round(outstanding),
          overdue: Math.round(overdueAmount),
          collectionRate: billed > 0 ? Math.round((collected / billed) * 1000) / 10 : 0,
          transportBillCount: liveBills.length,
          learnersWithTransport: learnersTransportRes.count ?? 0,
          learnersActive: learnersActiveRes.count ?? 0,
          activeRoutes,
          totalRoutes: routes.length,
          activeVehicles,
          totalVehicles: vehicles.length,
          drivers: driversRes.count ?? 0,
          openGrievances,
          bookingsInRange: bookings.length,
        },
        collectionStatus,
        revenueTrend,
        routeLoad,
        bookingsTrend,
        fleetCompliance,
        grievances: {
          byStatus: Object.entries(grStatus).map(([status, count]) => ({ status, count })),
          byCategory: Object.entries(grCategory).map(([category, count]) => ({ category, count })),
          total: grievances.length,
        },
      },
    });
  } catch (error) {
    console.error('Analytics API Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth(getAnalytics);
