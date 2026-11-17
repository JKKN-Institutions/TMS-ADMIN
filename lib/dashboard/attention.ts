import type { SupabaseClient } from '@supabase/supabase-js';
import { ACTIVE_LIFECYCLE_STATUSES } from '@/lib/passengers/types';
import type { AlertInputs } from './alerts';
import type { DashboardRouteRow } from './types';

// The measurements behind the "Needs attention" list.
//
// They live here rather than inside /api/admin/dashboard because that route is
// only reachable by a signed-in admin, and the daily mail to the transport
// heads runs from a scheduled job with no session. Both now read these same
// queries, so the mail can never quote a different number from the dashboard.
//
// House rule, unchanged: a query that FAILS returns null and names itself in
// `degraded`. It must never come back as 0, because for the mail a false zero
// is worse than for the dashboard — it would silence the mail altogether.

const DAY_MS = 86_400_000;
/** Rows fetched when listing today's bookings/scans to find silent routes. */
const SCAN_ROWS = 4000;

/**
 * The statutory documents a bus must hold. Listed once so the "expired" and
 * "due soon" checks can never drift apart.
 */
export const DOC_EXPIRY_COLUMNS = [
  'insurance_expiry',
  'fitness_expiry',
  'permit_expiry_date',
  'pollution_expiry_date',
] as const;

export interface AttentionCounts {
  overdueBills: number | null;
  staleGrievances: number | null;
  openGrievances: number | null;
  ridersWithoutStop: number | null;
  /** Buses with at least one expired document, named. */
  expiredDocs: { count: number; registrations: string[] } | null;
  /** Routes booked today with no morning boarding scan at all, named. */
  nobodyScanned: { count: number; numbers: string[] } | null;
  /** Keys of failed queries, using the dashboard's existing key names. */
  degraded: string[];
}

/** Collects failed keys and logs each failure once. */
class Failures {
  readonly keys: string[] = [];
  note(key: string, error: unknown) {
    if (!this.keys.includes(key)) this.keys.push(key);
    console.error(`[attention] ${key} failed:`, error);
  }
}

async function countOf(
  build: () => PromiseLike<{ count: number | null; error: unknown }>,
  key: string,
  failures: Failures
): Promise<number | null> {
  try {
    const { count, error } = await build();
    if (error) {
      failures.note(key, error);
      return null;
    }
    return count ?? 0;
  } catch (e) {
    failures.note(key, e);
    return null;
  }
}

/**
 * Runs every count behind the alert list, in one parallel batch.
 *
 * `today` is the IST calendar date (YYYY-MM-DD). The route checks ("no bus",
 * "no driver") are NOT here: they derive from the route board, which the
 * dashboard already loads for its own panels — see toAlertInputs.
 */
export async function loadAttentionCounts(
  supabase: SupabaseClient,
  today: string
): Promise<AttentionCounts> {
  const failures = new Failures();
  const head = { count: 'exact' as const, head: true };
  const activeLifecycle = [...ACTIVE_LIFECYCLE_STATUSES];
  const staleBefore = new Date(Date.now() - 3 * DAY_MS).toISOString();

  const [overdueBills, staleGrievances, openGrievances, ridersWithoutStop, expiredDocs, nobodyScanned] =
    await Promise.all([
      // Transport bills are the subset of the shared ledger carrying a
      // transport_year_id; without it this would count hostel and school fees.
      countOf(() => supabase.from('billing_student_bills').select('id', head)
        .not('transport_year_id', 'is', null).eq('status', 'unpaid')
        .lt('due_date', today), 'bills.overdue', failures),
      countOf(() => supabase.from('tms_grievance').select('id', head)
        .in('status', ['open', 'in_progress'])
        .lt('created_at', staleBefore), 'grievances.stale', failures),
      countOf(() => supabase.from('tms_grievance').select('id', head)
        .in('status', ['open', 'in_progress']), 'grievances.open', failures),
      countOf(() => supabase.from('learners_profiles').select('id', head)
        .eq('bus_required', true).in('lifecycle_status', activeLifecycle)
        .is('transport_stop_id', null), 'learners.noStop', failures),
      expiredDocVehicles(supabase, today, failures),
      routesWithNoScans(supabase, today, failures),
    ]);

  return {
    overdueBills,
    staleGrievances,
    openGrievances,
    ridersWithoutStop,
    expiredDocs,
    nobodyScanned,
    degraded: failures.keys,
  };
}

/**
 * Combines the counts with the route board into what buildAlerts consumes.
 *
 * "No bus" means no RESOLVABLE vehicle, not merely a null vehicle_id — some
 * active routes point at a tms_vehicle row that no longer exists, and the board
 * already resolves that.
 *
 * When the board itself failed it returns an empty route list. Counting that
 * would report "0 routes without a bus", so the two route checks are left
 * unmeasured instead. The same goes for "no bus" when only the vehicle lookup
 * failed: the board then leaves every registration null, and counting that
 * would report every active route as having no bus. Degraded trips or driver
 * names do not affect either check and are ignored here.
 */
export function toAlertInputs(
  counts: AttentionCounts,
  board: { routes: DashboardRouteRow[]; degraded: string[] }
): AlertInputs {
  const boardFailed = board.degraded.includes('routes') || board.degraded.includes('board');
  const busUnknown = boardFailed || board.degraded.includes('vehicles');
  const noBus = busUnknown ? [] : board.routes.filter((r) => !r.vehicleRegistration);
  const noDriver = board.routes.filter((r) => !r.hasDriver);

  return {
    overdueBills: counts.overdueBills,
    staleGrievances: counts.staleGrievances,
    openGrievances: counts.openGrievances,
    ridersWithoutStop: counts.ridersWithoutStop,
    expiredVehicleDocs: counts.expiredDocs?.count ?? null,
    expiredVehicleDocsRegistrations: counts.expiredDocs?.registrations,
    routesNobodyScanned: counts.nobodyScanned?.count ?? null,
    routesNobodyScannedNumbers: counts.nobodyScanned?.numbers,
    routesWithoutBus: busUnknown ? null : noBus.length,
    routesWithoutBusNumbers: noBus.map((r) => r.routeNumber),
    routesWithoutDriver: boardFailed ? null : noDriver.length,
    routesWithoutDriverNumbers: noDriver.map((r) => r.routeNumber),
  };
}

/**
 * Buses holding at least one expired statutory document, named.
 *
 * One `.or()` of per-column `lt today`. The fleet is 35 buses, so there is no
 * paging concern. Null on failure, never 0.
 */
async function expiredDocVehicles(
  supabase: SupabaseClient,
  today: string,
  failures: Failures
): Promise<{ count: number; registrations: string[] } | null> {
  try {
    const { data, error } = await supabase
      .from('tms_vehicle')
      .select('id, registration_number')
      .or(DOC_EXPIRY_COLUMNS.map((c) => `${c}.lt.${today}`).join(','));

    if (error) {
      failures.note('vehicles.expiredDocs', error);
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
    failures.note('vehicles.expiredDocs', e);
    return null;
  }
}

/**
 * Routes that had bookings today but no boarding scans at all.
 *
 * It usually means an in-charge is not marking attendance, so the roster for
 * that bus is blind. Morning only (`direction = 'onward'`): an evening-only
 * scan must not hide a route whose morning trip was never marked.
 */
async function routesWithNoScans(
  supabase: SupabaseClient,
  date: string,
  failures: Failures
): Promise<{ count: number; numbers: string[] } | null> {
  try {
    const [bookedRes, scannedRes, routesRes] = await Promise.all([
      supabase.from('tms_booking').select('route_id').eq('travel_date', date)
        .order('travel_date', { ascending: true }).order('learner_id', { ascending: true })
        .range(0, SCAN_ROWS - 1),
      supabase.from('tms_attendance').select('route_id').eq('trip_date', date)
        .eq('status', 'present').eq('direction', 'onward')
        .order('id', { ascending: true })
        .range(0, SCAN_ROWS - 1),
      supabase.from('tms_route').select('id, route_number').eq('status', 'active'),
    ]);

    if (bookedRes.error || scannedRes.error || routesRes.error) {
      failures.note('routes.noScans', bookedRes.error ?? scannedRes.error ?? routesRes.error);
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
    failures.note('routes.noScans', e);
    return null;
  }
}
