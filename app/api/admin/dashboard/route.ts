import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { ACTIVE_LIFECYCLE_STATUSES } from '@/lib/passengers/types';
import { istToday, addDays } from '@/lib/booking/window';
import { buildAlerts } from '@/lib/dashboard/alerts';
import type { DashboardPayload, DashboardTrendPoint } from '@/lib/dashboard/types';

// GET /api/admin/dashboard
//
// Every number here is measured against the MODERN tms_ plane. The previous
// version of this route read the legacy `bookings` table — which is DROPPED —
// and wrote `.count || 0`, so "relation does not exist" (42P01) rendered as a
// confident "0 active bookings" while tms_booking held 18k rows. The counting
// helpers below therefore return `null` on error and name the failed key in
// `degraded`, so the UI can show a dash rather than a lie.

type Supa = ReturnType<typeof createServiceRoleClient>;

/** Collects the names of metrics whose query failed, for the degraded banner. */
class Degraded {
  readonly keys: string[] = [];
  note(key: string, error: unknown) {
    if (!this.keys.includes(key)) this.keys.push(key);
    console.error(`[dashboard] ${key} failed:`, error);
  }
}

const TREND_DAYS = 7;
const ACTIVITY_LIMIT = 8;
/** Baseline window for the stat-card trend arrows. */
const TREND_BASELINE_DAYS = 30;
const DAY_MS = 86_400_000;

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

/**
 * A head-count that distinguishes "zero rows" from "query failed".
 * Returns null on error — never 0 — so a dropped table cannot masquerade as
 * an empty one the way the legacy `.count || 0` did.
 */
async function countOf(
  build: () => PromiseLike<{ count: number | null; error: unknown }>,
  key: string,
  degraded: Degraded
): Promise<number | null> {
  try {
    const { count, error } = await build();
    if (error) {
      degraded.note(key, error);
      return null;
    }
    return count ?? 0;
  } catch (e) {
    degraded.note(key, e);
    return null;
  }
}

/** Rows per page when summing a column client-side. */
const SUM_PAGE = 1000;
/** Refuse to walk forever if a filter is broader than intended. */
const SUM_MAX_PAGES = 50;

/**
 * Sums a numeric column over the matching rows, paging explicitly.
 *
 * The paging is not premature optimisation — it is correctness. A single
 * unbounded select is subject to whatever row ceiling the gateway applies, and
 * a truncated page would silently UNDERSTATE a rupee total with no error to
 * notice. `collectedTotal` already spans ~1.9k bills, so this sits right at the
 * edge. Walking with explicit ranges makes the result independent of any
 * server-side default. Null on failure, as with countOf.
 */
async function sumOf(
  build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>,
  column: string,
  key: string,
  degraded: Degraded
): Promise<number | null> {
  try {
    let total = 0;
    for (let page = 0; page < SUM_MAX_PAGES; page++) {
      const from = page * SUM_PAGE;
      const { data, error } = await build(from, from + SUM_PAGE - 1);
      if (error) {
        degraded.note(key, error);
        return null;
      }
      const rows = data ?? [];
      for (const row of rows) {
        total += Number((row as Record<string, unknown>)[column] ?? 0);
      }
      if (rows.length < SUM_PAGE) return total;
    }
    // Ran out of pages: the figure would be short, so report it as unmeasured
    // rather than as a plausible-looking partial sum.
    degraded.note(key, new Error(`exceeded ${SUM_MAX_PAGES} pages`));
    return null;
  } catch (e) {
    degraded.note(key, e);
    return null;
  }
}

/** ISO instant bounding an IST calendar date. */
function istDayStart(date: string): string {
  return `${date}T00:00:00+05:30`;
}
function istDayEnd(date: string): string {
  return `${date}T23:59:59.999+05:30`;
}

async function getDashboard(_request: NextRequest, auth: AuthContext) {
  try {
    const supabase = createServiceRoleClient();
    const degraded = new Degraded();

    const today = istToday();
    const tomorrow = addDays(today, 1);
    const monthStart = `${today.slice(0, 7)}-01`;
    const baseline = new Date(Date.now() - TREND_BASELINE_DAYS * DAY_MS).toISOString();
    const staleBefore = new Date(Date.now() - 3 * DAY_MS).toISOString();

    // The 7-day window ends today and runs backwards, so index 0 is the oldest.
    const trendDates = Array.from({ length: TREND_DAYS }, (_, i) =>
      addDays(today, i - (TREND_DAYS - 1))
    );

    const activeLifecycle = [...ACTIVE_LIFECYCLE_STATUSES];
    const head = { count: 'exact' as const, head: true };

    // Everything below is one parallel batch: wall clock stays a single round
    // trip regardless of how many metrics we add. No metric depends on another,
    // so the barrier costs nothing.
    const [
      learners, learnersPrev,
      drivers, driversPrev,
      routes, routesPrev,
      vehicles, vehiclesPrev,
      bookingsToday, bookingsTomorrow,
      attendanceMarked, presentToday,
      tripsToday, tripsActive,
      paidBills, unpaidBills, overdueBills,
      collectedToday, collectedMonth, collectedTotal, outstanding,
      staleGrievances, openGrievances, ridersWithoutStop, routesWithoutDriver,
      expiredVehicleDocs,
      trendBookings, trendPresent,
      activity,
    ] = await Promise.all([
      // ── Headline counts, each with a 30-day-ago baseline for a REAL trend ──
      // "Learners" is counted exactly as the Passengers > Learners page counts,
      // via the shared allow-list, so the two screens can never drift.
      countOf(() => supabase.from('learners_profiles').select('id', head)
        .eq('bus_required', true).in('lifecycle_status', activeLifecycle), 'learners', degraded),
      countOf(() => supabase.from('learners_profiles').select('id', head)
        .eq('bus_required', true).in('lifecycle_status', activeLifecycle)
        .lt('created_at', baseline), 'learners.previous', degraded),

      // Drivers live in MyJKKN `staff` (role_key='driver'); the legacy `drivers`
      // table is gone. Same source as the /drivers page.
      countOf(() => supabase.from('staff').select('id', head)
        .eq('role_key', 'driver'), 'drivers', degraded),
      countOf(() => supabase.from('staff').select('id', head)
        .eq('role_key', 'driver').lt('created_at', baseline), 'drivers.previous', degraded),

      countOf(() => supabase.from('tms_route').select('id', head), 'routes', degraded),
      countOf(() => supabase.from('tms_route').select('id', head)
        .lt('created_at', baseline), 'routes.previous', degraded),

      countOf(() => supabase.from('tms_vehicle').select('id', head), 'vehicles', degraded),
      countOf(() => supabase.from('tms_vehicle').select('id', head)
        .lt('created_at', baseline), 'vehicles.previous', degraded),

      // ── Today ──
      // tms_booking has no `status` column: a row IS a confirmed booking. The
      // old "confirmedBookings" filter targeted a column that does not exist.
      countOf(() => supabase.from('tms_booking').select('learner_id', head)
        .eq('travel_date', today), 'bookings.today', degraded),
      countOf(() => supabase.from('tms_booking').select('learner_id', head)
        .eq('travel_date', tomorrow), 'bookings.tomorrow', degraded),

      countOf(() => supabase.from('tms_attendance').select('id', head)
        .eq('trip_date', today), 'attendance.marked', degraded),
      countOf(() => supabase.from('tms_attendance').select('id', head)
        .eq('trip_date', today).eq('status', 'present'), 'attendance.present', degraded),

      countOf(() => supabase.from('tms_trip').select('id', head)
        .eq('travel_date', today), 'trips.today', degraded),
      countOf(() => supabase.from('tms_trip').select('id', head)
        .eq('status', 'active'), 'trips.active', degraded),

      // ── Money ──
      // Transport bills are the subset of the shared ledger carrying a
      // transport_year_id; without that filter this would also count the hostel
      // and school fees that belong to other apps.
      countOf(() => supabase.from('billing_student_bills').select('id', head)
        .not('transport_year_id', 'is', null).eq('status', 'paid'), 'bills.paid', degraded),
      countOf(() => supabase.from('billing_student_bills').select('id', head)
        .not('transport_year_id', 'is', null).eq('status', 'unpaid'), 'bills.unpaid', degraded),
      countOf(() => supabase.from('billing_student_bills').select('id', head)
        .not('transport_year_id', 'is', null).eq('status', 'unpaid')
        .lt('due_date', today), 'bills.overdue', degraded),

      // payment_date is timestamptz, so the day boundary must carry the IST
      // offset: a bare date would silently bill 05:30 of tomorrow into today.
      sumOf((from, to) => supabase.from('billing_student_bills').select('final_amount')
        .not('transport_year_id', 'is', null).eq('status', 'paid')
        .gte('payment_date', istDayStart(today)).lte('payment_date', istDayEnd(today))
        .order('id', { ascending: true }).range(from, to),
        'final_amount', 'finance.today', degraded),
      sumOf((from, to) => supabase.from('billing_student_bills').select('final_amount')
        .not('transport_year_id', 'is', null).eq('status', 'paid')
        .gte('payment_date', istDayStart(monthStart))
        .order('id', { ascending: true }).range(from, to),
        'final_amount', 'finance.month', degraded),
      sumOf((from, to) => supabase.from('billing_student_bills').select('final_amount')
        .not('transport_year_id', 'is', null).eq('status', 'paid')
        .order('id', { ascending: true }).range(from, to),
        'final_amount', 'finance.total', degraded),
      sumOf((from, to) => supabase.from('billing_student_bills').select('final_amount')
        .not('transport_year_id', 'is', null).eq('status', 'unpaid')
        .order('id', { ascending: true }).range(from, to),
        'final_amount', 'finance.outstanding', degraded),

      // ── Alert inputs ──
      countOf(() => supabase.from('tms_grievance').select('id', head)
        .in('status', ['open', 'in_progress'])
        .lt('created_at', staleBefore), 'grievances.stale', degraded),
      countOf(() => supabase.from('tms_grievance').select('id', head)
        .in('status', ['open', 'in_progress']), 'grievances.open', degraded),
      countOf(() => supabase.from('learners_profiles').select('id', head)
        .eq('bus_required', true).in('lifecycle_status', activeLifecycle)
        .is('transport_stop_id', null), 'learners.noStop', degraded),
      countOf(() => supabase.from('tms_route').select('id', head)
        .eq('status', 'active').is('driver_id', null), 'routes.noDriver', degraded),
      countOf(() => supabase.from('tms_vehicle').select('id', head)
        .or([
          `insurance_expiry.lt.${today}`,
          `fitness_expiry.lt.${today}`,
          `permit_expiry_date.lt.${today}`,
          `pollution_expiry_date.lt.${today}`,
        ].join(',')), 'vehicles.expiredDocs', degraded),

      // ── 7-day trend ──
      // Order keys are the tables' primary keys: tms_booking is (learner_id,
      // travel_date), tms_attendance is (id).
      trendRows(supabase, 'tms_booking', 'travel_date', ['travel_date', 'learner_id'],
        trendDates, degraded, 'trend.bookings'),
      trendRows(supabase, 'tms_attendance', 'trip_date', ['id'],
        trendDates, degraded, 'trend.present', 'present'),

      // ── Recent activity ──
      recentActivity(supabase, auth, degraded),
    ]);

    const trend: DashboardTrendPoint[] = trendDates.map((date) => ({
      date,
      bookings: trendBookings?.get(date) ?? 0,
      present: trendPresent?.get(date) ?? 0,
    }));

    const marked = attendanceMarked ?? 0;
    const present = presentToday ?? 0;

    const payload: DashboardPayload = {
      counts: {
        learners: { current: learners ?? 0, previous: learnersPrev },
        drivers: { current: drivers ?? 0, previous: driversPrev },
        routes: { current: routes ?? 0, previous: routesPrev },
        vehicles: { current: vehicles ?? 0, previous: vehiclesPrev },
      },
      today: {
        date: today,
        bookings: bookingsToday ?? 0,
        bookingsTomorrow: bookingsTomorrow ?? 0,
        attendanceMarked: marked,
        present,
        // Derived from the SAME two counts, so the parts always sum to the whole.
        absent: Math.max(0, marked - present),
        tripsToday: tripsToday ?? 0,
        tripsActive: tripsActive ?? 0,
      },
      finance: {
        collectedToday: collectedToday ?? 0,
        collectedMonth: collectedMonth ?? 0,
        collectedTotal: collectedTotal ?? 0,
        outstanding: outstanding ?? 0,
        paidBills: paidBills ?? 0,
        unpaidBills: unpaidBills ?? 0,
        overdueBills: overdueBills ?? 0,
      },
      alerts: buildAlerts({
        overdueBills,
        staleGrievances,
        openGrievances,
        ridersWithoutStop,
        expiredVehicleDocs,
        routesWithoutDriver,
      }),
      trend,
      activity,
      degraded: degraded.keys,
    };

    return NextResponse.json({ success: true, data: payload });
  } catch (error) {
    console.error('Dashboard API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Counts rows per day across the trend window.
 *
 * Only the date column is selected, so each row is one short string rather than
 * a full booking. Paged for the same reason the money sums are: a week spans
 * roughly 6.5k bookings, well past any gateway row ceiling, and a truncated
 * page would quietly flatten the tail of the chart instead of erroring.
 */
async function trendRows(
  supabase: Supa,
  table: string,
  dateColumn: string,
  /** Columns forming a unique key — see the ordering note in the loop. */
  orderKey: string[],
  dates: string[],
  degraded: Degraded,
  key: string,
  statusFilter?: string
): Promise<Map<string, number> | null> {
  try {
    const counts = new Map<string, number>();

    for (let page = 0; page < SUM_MAX_PAGES; page++) {
      const from = page * SUM_PAGE;
      let query = supabase
        .from(table)
        .select(dateColumn)
        .gte(dateColumn, dates[0])
        .lte(dateColumn, dates[dates.length - 1])
        .range(from, from + SUM_PAGE - 1);
      // Paging without a total order is undefined in Postgres: rows can repeat
      // or vanish across pages, which would corrupt the counts silently.
      // Ordering on the primary key makes the walk deterministic.
      for (const col of orderKey) query = query.order(col, { ascending: true });
      if (statusFilter) query = query.eq('status', statusFilter);

      const { data, error } = await query;
      if (error) {
        degraded.note(key, error);
        return null;
      }
      const rows = (data ?? []) as unknown as Array<Record<string, string>>;
      for (const row of rows) {
        const day = row[dateColumn];
        if (day) counts.set(day, (counts.get(day) ?? 0) + 1);
      }
      if (rows.length < SUM_PAGE) return counts;
    }

    degraded.note(key, new Error(`exceeded ${SUM_MAX_PAGES} pages`));
    return null;
  } catch (e) {
    degraded.note(key, e);
    return null;
  }
}

/**
 * The newest audit-log entries, replacing the four hardcoded "2 minutes ago"
 * rows the panel used to render.
 *
 * Gated on tms.activity.view: an admin who may not open the Activity Log page
 * must not read the same rows through the dashboard. Lacking the permission
 * yields an empty feed, which is a normal state — not a degraded one.
 */
async function recentActivity(
  supabase: Supa,
  auth: AuthContext,
  degraded: Degraded
): Promise<DashboardPayload['activity']> {
  try {
    if (!(await requirePerm(auth, 'tms.activity.view'))) return [];

    const { data, error } = await supabase
      .from('tms_activity_log')
      .select('id, module, action, entity_label, description, actor_email, created_at')
      .order('created_at', { ascending: false })
      .limit(ACTIVITY_LIMIT);

    if (error) {
      degraded.note('activity', error);
      return [];
    }
    return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      module: String(r.module ?? ''),
      action: String(r.action ?? ''),
      entityLabel: (r.entity_label as string) ?? null,
      description: (r.description as string) ?? null,
      actorEmail: (r.actor_email as string) ?? null,
      createdAt: String(r.created_at),
    }));
  } catch (e) {
    degraded.note('activity', e);
    return [];
  }
}

export const GET = withAuth(getDashboard);
