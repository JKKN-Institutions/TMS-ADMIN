import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { ACTIVE_LIFECYCLE_STATUSES } from '@/lib/passengers/types';
import { istToday, addDays } from '@/lib/booking/window';
import { buildAlerts } from '@/lib/dashboard/alerts';
import { loadRouteBoard } from '@/lib/routes/board';
import { LOW_OCCUPANCY_PCT, lowOccupancyRoutes } from '@/lib/dashboard/occupancy';
import type {
  DashboardHourBucket, DashboardPayload, DashboardTrendPoint,
} from '@/lib/dashboard/types';

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

const TREND_DAYS = 14;
const ACTIVITY_LIMIT = 8;
/** Baseline window for the stat-card trend arrows. */
const TREND_BASELINE_DAYS = 30;
const DAY_MS = 86_400_000;

/**
 * The statutory documents a bus must hold. Listed once so the "expired" and
 * "due soon" checks can never drift apart.
 */
const DOC_EXPIRY_COLUMNS = [
  'insurance_expiry',
  'fitness_expiry',
  'permit_expiry_date',
  'pollution_expiry_date',
] as const;

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
    /** Documents falling due inside this window count as "due soon". */
    const soon = addDays(today, 60);

    // The demand window ends today and runs backwards, so index 0 is the oldest.
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
      staleGrievances, openGrievances, ridersWithoutStop,
      expiredDocs,
      trendBookings, trendPresent,
      activity,
      hourly, board, nobodyScanned, yesterday, busPass, docsDueSoon,
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

      // Morning only: a learner can now also have an evening `direction =
      // 'return'` row the same day, and this figure means the morning trip.
      countOf(() => supabase.from('tms_attendance').select('id', head)
        .eq('trip_date', today).eq('direction', 'onward'), 'attendance.marked', degraded),
      countOf(() => supabase.from('tms_attendance').select('id', head)
        .eq('trip_date', today).eq('status', 'present')
        .eq('direction', 'onward'), 'attendance.present', degraded),

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
      // Selected rather than head-counted: the alert row names the buses, and
      // at 35 vehicles the registrations cost nothing over the count alone.
      expiredDocVehicles(supabase, today, degraded),

      // ── 7-day trend ──
      // Order keys are the tables' primary keys: tms_booking is (learner_id,
      // travel_date), tms_attendance is (id).
      trendRows(supabase, 'tms_booking', 'travel_date', ['travel_date', 'learner_id'],
        trendDates, degraded, 'trend.bookings'),
      // Morning only, same reason as attendance.marked/present above — this
      // trend line means the morning trip, not every attendance row.
      trendRows(supabase, 'tms_attendance', 'trip_date', ['id'],
        trendDates, degraded, 'trend.present', 'present', [['direction', 'onward']]),

      // ── Recent activity ──
      recentActivity(supabase, auth, degraded),

      // ── Panels added for the operations-console layout ──
      hourlyScans(supabase, today, degraded),
      // One shared loader for route figures: the dashboard and Routes >
      // Analytics must never quote different numbers for the same route, and
      // it carries the dangling-vehicle_id handling in one place.
      loadRouteBoard(today),
      routesWithNoScans(supabase, today, degraded),
      previousDay(supabase, today, degraded),
      busPassRequests(supabase, degraded),
      // "Due soon" must be range-checked PER COLUMN, inside and(...) groups.
      // Two chained .or() calls would mean "(any column >= today) AND (any
      // column <= soon)", which a bus with valid insurance and an already
      // EXPIRED pollution certificate satisfies — measured, that returned 11
      // by counting the 9 expired buses again, contradicting the expired tile
      // right next to it. The correct answer is 2.
      countOf(() => supabase.from('tms_vehicle').select('id', head)
        .or(DOC_EXPIRY_COLUMNS
          .map((c) => `and(${c}.gte.${today},${c}.lte.${soon})`)
          .join(',')), 'vehicles.docsDueSoon', degraded),
    ]);

    const routeRows = board.routes;
    // null (not 0) when the query failed, so an unmeasurable check stays
    // unmeasured all the way to the alert row.
    const expiredVehicleDocs = expiredDocs?.count ?? null;
    for (const key of board.degraded) degraded.note(`board.${key}`, 'see routes board');
    const lowOccupancy = lowOccupancyRoutes(routeRows);
    // "No bus" means no RESOLVABLE vehicle, not merely a null vehicle_id — 4
    // active routes point at a tms_vehicle row that no longer exists. Derived
    // once so the fleet tile and the alert row can never disagree.
    const routesNoBus = routeRows.filter((r) => !r.vehicleRegistration);
    const routesNoDriver = routeRows.filter((r) => !r.hasDriver);
    const withCapacity = routeRows.filter((r) => (r.capacity ?? 0) > 0).length;

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
        hourly,
      },
      yesterday,
      attention: {
        busPassOpen: busPass?.open ?? 0,
        busPassLast30: busPass?.last30 ?? 0,
        busPassPrev30: busPass?.prev30 ?? 0,
        docsExpired: expiredVehicleDocs ?? 0,
        docsDueSoon: docsDueSoon ?? 0,
        lowOccupancy: lowOccupancy.length,
        routesWithCapacity: withCapacity,
      },
      fleet: {
        buses: vehicles ?? 0,
        expiredDocs: expiredVehicleDocs ?? 0,
        routesActive: routeRows.length || (routes ?? 0),
        routesWithoutBus: routesNoBus.length,
        routesWithoutDriver: routesNoDriver.length,
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
      routes: routeRows,
      alerts: buildAlerts({
        overdueBills,
        staleGrievances,
        openGrievances,
        ridersWithoutStop,
        expiredVehicleDocs,
        routesWithoutDriver: routesNoDriver.length,
        routesWithoutBus: routesNoBus.length,
        routesNobodyScanned: nobodyScanned?.count ?? null,
        routesNobodyScannedNumbers: nobodyScanned?.numbers,
        routesWithoutBusNumbers: routesNoBus.map((r) => r.routeNumber),
        routesWithoutDriverNumbers: routesNoDriver.map((r) => r.routeNumber),
        expiredVehicleDocsRegistrations: expiredDocs?.registrations,
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
  statusFilter?: string,
  /** Extra equality filters, e.g. `[['direction', 'onward']]`. */
  extraFilters?: Array<[string, string]>
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
      if (extraFilters) for (const [col, val] of extraFilters) query = query.eq(col, val);

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
 * Bus Pass service requests: how many are still open, and the last 30 days
 * against the 30 before that so the change shown is measured.
 *
 * These live in the shared MyJKKN `service_requests` table, joined through
 * `service_types`, not in a tms_ table — the bus pass is one service type among
 * many (Gate Outpass and others share the queue), so the type filter is what
 * keeps this transport-only.
 */
async function busPassRequests(
  supabase: Supa,
  degraded: Degraded
): Promise<{ open: number; last30: number; prev30: number } | null> {
  try {
    const typeRes = await supabase
      .from('service_types')
      .select('id')
      .eq('name', 'Bus Pass Request')
      .limit(1);

    if (typeRes.error) {
      degraded.note('busPass.type', typeRes.error);
      return null;
    }
    const typeId = (typeRes.data ?? [])[0]?.id;
    // No such service type configured is a legitimate state, not a failure.
    if (!typeId) return { open: 0, last30: 0, prev30: 0 };

    const now = Date.now();
    const d30 = new Date(now - 30 * DAY_MS).toISOString();
    const d60 = new Date(now - 60 * DAY_MS).toISOString();
    const head = { count: 'exact' as const, head: true };

    const [openRes, last30Res, prev30Res] = await Promise.all([
      // 'draft' and 'submitted' are the only pre-fulfilment states in the
      // service_request_status enum; 'pending' is NOT a member of it.
      supabase.from('service_requests').select('id', head)
        .eq('service_type_id', typeId).in('status', ['draft', 'submitted']),
      supabase.from('service_requests').select('id', head)
        .eq('service_type_id', typeId).gte('created_at', d30),
      supabase.from('service_requests').select('id', head)
        .eq('service_type_id', typeId).gte('created_at', d60).lt('created_at', d30),
    ]);

    if (openRes.error || last30Res.error || prev30Res.error) {
      degraded.note('busPass', openRes.error ?? last30Res.error ?? prev30Res.error);
      return null;
    }

    return {
      open: openRes.count ?? 0,
      last30: last30Res.count ?? 0,
      prev30: prev30Res.count ?? 0,
    };
  } catch (e) {
    degraded.note('busPass', e);
    return null;
  }
}

/**
 * Today's boarding scans bucketed by IST hour.
 *
 * Boarding here is a short morning burst, not an all-day flow (measured on
 * 2026-09-04: 138 scans in the 7am hour, 1,094 in the 8am hour). Only hours
 * that actually contain scans are returned, so the UI plots the real shape
 * rather than padding a 24-hour axis with zeros.
 */
async function hourlyScans(
  supabase: Supa,
  date: string,
  degraded: Degraded
): Promise<DashboardHourBucket[]> {
  try {
    const buckets = new Map<number, { marks: number; present: number }>();

    for (let page = 0; page < SUM_MAX_PAGES; page++) {
      const from = page * SUM_PAGE;
      // Morning only, same reason as attendance.marked/present above — an
      // evening scan burst would otherwise land in this same chart and be
      // read as a second morning peak.
      const { data, error } = await supabase
        .from('tms_attendance')
        .select('scanned_at, status')
        .eq('trip_date', date)
        .eq('direction', 'onward')
        .order('id', { ascending: true })
        .range(from, from + SUM_PAGE - 1);

      if (error) {
        degraded.note('today.hourly', error);
        return [];
      }
      const rows = (data ?? []) as unknown as Array<Record<string, string | null>>;
      for (const row of rows) {
        if (!row.scanned_at) continue;
        // scanned_at is timestamptz; shift into IST before taking the hour, or
        // the 8am peak lands at 02:00 on a UTC server.
        const ist = new Date(new Date(row.scanned_at).getTime() + 330 * 60_000);
        const hour = ist.getUTCHours();
        const b = buckets.get(hour) ?? { marks: 0, present: 0 };
        b.marks += 1;
        if (row.status === 'present') b.present += 1;
        buckets.set(hour, b);
      }
      if (rows.length < SUM_PAGE) break;
    }

    return [...buckets.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([hour, b]) => ({ hour, marks: b.marks, present: b.present }));
  } catch (e) {
    degraded.note('today.hourly', e);
    return [];
  }
}

/**
 * Routes that had bookings today but no boarding scans at all.
 *
 * This is the single most actionable signal on the page: it usually means an
 * in-charge is not marking attendance, so the roster for that bus is blind.
 * Returns the route numbers too — a count says something is wrong, the numbers
 * say where to look.
 */
/**
 * Buses holding at least one expired statutory document, named.
 *
 * The filter is identical to the head-count it replaced — one `.or()` of
 * per-column `lt today` — so the number this returns is the same number the
 * "Document expiry" tile has always shown. Only the registrations are new, and
 * the fleet is 35 buses, so there is no paging concern.
 *
 * Null on failure, never 0, exactly like countOf.
 */
async function expiredDocVehicles(
  supabase: Supa,
  today: string,
  degraded: Degraded
): Promise<{ count: number; registrations: string[] } | null> {
  try {
    const { data, error } = await supabase
      .from('tms_vehicle')
      .select('id, registration_number')
      .or(DOC_EXPIRY_COLUMNS.map((c) => `${c}.lt.${today}`).join(','));

    if (error) {
      degraded.note('vehicles.expiredDocs', error);
      return null;
    }

    const rows = (data ?? []) as unknown as Array<{ registration_number: string | null }>;
    const registrations = rows
      .map((r) => (r.registration_number ?? '').trim())
      .filter((r) => r.length > 0)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    // The count is the ROW count, not the registration count: a bus with a
    // blank registration is still a bus with an expired document.
    return { count: rows.length, registrations };
  } catch (e) {
    degraded.note('vehicles.expiredDocs', e);
    return null;
  }
}

async function routesWithNoScans(
  supabase: Supa,
  date: string,
  degraded: Degraded
): Promise<{ count: number; numbers: string[] } | null> {
  try {
    const [bookedRes, scannedRes, routesRes] = await Promise.all([
      supabase.from('tms_booking').select('route_id').eq('travel_date', date)
        .order('travel_date', { ascending: true }).order('learner_id', { ascending: true })
        .range(0, SUM_PAGE * 4 - 1),
      // Morning only, same reason as attendance.marked/present above — an
      // evening-only scan must not hide a route whose morning trip was
      // never marked.
      supabase.from('tms_attendance').select('route_id').eq('trip_date', date)
        .eq('status', 'present').eq('direction', 'onward')
        .order('id', { ascending: true })
        .range(0, SUM_PAGE * 4 - 1),
      supabase.from('tms_route').select('id, route_number').eq('status', 'active'),
    ]);

    if (bookedRes.error || scannedRes.error || routesRes.error) {
      degraded.note('routes.noScans', bookedRes.error ?? scannedRes.error ?? routesRes.error);
      return null;
    }

    const booked = new Set<string>();
    for (const r of (bookedRes.data ?? []) as unknown as Array<{ route_id: string | null }>) {
      if (r.route_id) booked.add(r.route_id);
    }
    const scanned = new Set<string>();
    for (const r of (scannedRes.data ?? []) as unknown as Array<{ route_id: string | null }>) {
      if (r.route_id) scanned.add(r.route_id);
    }

    const numbers: string[] = [];
    for (const r of (routesRes.data ?? []) as unknown as Array<{ id: string; route_number: string }>) {
      if (booked.has(r.id) && !scanned.has(r.id)) numbers.push(String(r.route_number));
    }
    numbers.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    return { count: numbers.length, numbers };
  } catch (e) {
    degraded.note('routes.noScans', e);
    return null;
  }
}

/**
 * The most recent EARLIER day that actually has bookings, for the KPI deltas.
 *
 * Deliberately not "yesterday" literally: buses do not run on Sundays or
 * declared off-days, so comparing Monday against a blank Sunday would show a
 * fake collapse. Walking back to the last day with data compares like with
 * like. Gives up after a fortnight rather than scanning forever.
 */
async function previousDay(
  supabase: Supa,
  today: string,
  degraded: Degraded
): Promise<DashboardPayload['yesterday']> {
  try {
    for (let back = 1; back <= 14; back++) {
      const date = addDays(today, -back);
      // Morning only, same reason as attendance.marked/present above — this
      // figure means the morning trip, not every attendance row that day.
      const [bookedRes, presentRes, markedRes] = await Promise.all([
        supabase.from('tms_booking').select('learner_id', { count: 'exact', head: true })
          .eq('travel_date', date),
        supabase.from('tms_attendance').select('id', { count: 'exact', head: true })
          .eq('trip_date', date).eq('status', 'present').eq('direction', 'onward'),
        supabase.from('tms_attendance').select('id', { count: 'exact', head: true })
          .eq('trip_date', date).eq('direction', 'onward'),
      ]);

      if (bookedRes.error) {
        degraded.note('yesterday', bookedRes.error);
        return null;
      }
      const bookings = bookedRes.count ?? 0;
      if (bookings === 0) continue;

      const present = presentRes.count ?? 0;
      const marked = markedRes.count ?? 0;
      return { date, bookings, present, absent: Math.max(0, marked - present) };
    }
    return null;
  } catch (e) {
    degraded.note('yesterday', e);
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
