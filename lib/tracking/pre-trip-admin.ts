/**
 * Transport-head view of the drivers' daily pre-trip checks — pure helpers, no I/O.
 * Used by GET /api/admin/pre-trip-checks and the /pre-trip-checks page; unit-tested
 * in ./pre-trip-admin.test.ts.
 */
import { PRE_TRIP_ITEMS, issueLabels, type PreTripItemKey } from './pre-trip-check';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar date 'YYYY-MM-DD', else the fallback (today in IST). */
export function parseCheckDate(raw: string | null | undefined, fallback: string): string {
  if (!raw || !DATE_RE.test(raw)) return fallback;
  const d = new Date(`${raw}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === raw ? raw : fallback;
}

export interface AdminCheckRow {
  id: string;
  checkDate: string;
  createdAt: string;
  driverId: string;
  driverName: string;
  vehicleId: string;
  busRegistration: string | null;
  skipped: boolean;
  skipReason: string | null;
  items: Record<PreTripItemKey, boolean | null>;
  odometerKm: number | null;
  hasPhoto: boolean;
  anyIssue: boolean;
  notes: string | null;
  tripId: string | null;
}

export type CheckBadge =
  | { kind: 'skipped'; label: string }
  | { kind: 'issue'; label: string }
  | { kind: 'ok'; label: string };

/** The badge on a row: "skipped: <reason>", "issue: Brakes, Horn", or "all OK". */
export function checkBadge(row: Pick<AdminCheckRow, 'skipped' | 'skipReason' | 'items'>): CheckBadge {
  if (row.skipped) return { kind: 'skipped', label: `skipped: ${row.skipReason ?? 'no reason given'}` };
  const bad = issueLabels(row.items);
  if (bad.length > 0) return { kind: 'issue', label: `issue: ${bad.join(', ')}` };
  return { kind: 'ok', label: 'all OK' };
}

/** "Issues and skips only": anything flagged by the database's any_issue. */
export function filterChecks(rows: AdminCheckRow[], issuesOnly: boolean): AdminCheckRow[] {
  return issuesOnly ? rows.filter((r) => r.anyIssue) : rows;
}

/** Shape a database row (plus looked-up names) for the page. */
export function toAdminRow(
  r: {
    id: string;
    check_date: string;
    created_at: string;
    driver_id: string;
    vehicle_id: string;
    trip_id: string | null;
    skipped: boolean;
    skip_reason: string | null;
    odometer_km: number | string | null;
    odometer_photo_path: string | null;
    any_issue: boolean;
    notes: string | null;
  } & Partial<Record<PreTripItemKey, boolean | null>>,
  names: { driverName: string | null; busRegistration: string | null }
): AdminCheckRow {
  const items = {} as Record<PreTripItemKey, boolean | null>;
  for (const { key } of PRE_TRIP_ITEMS) items[key] = r[key] ?? null;
  return {
    id: r.id,
    checkDate: r.check_date,
    createdAt: r.created_at,
    driverId: r.driver_id,
    driverName: names.driverName || 'Unknown driver',
    vehicleId: r.vehicle_id,
    busRegistration: names.busRegistration,
    skipped: r.skipped,
    skipReason: r.skip_reason,
    items,
    odometerKm: r.odometer_km == null ? null : Number(r.odometer_km),
    hasPhoto: !!r.odometer_photo_path,
    anyIssue: r.any_issue,
    notes: r.notes,
    tripId: r.trip_id,
  };
}

// ── The day, bus by bus ──────────────────────────────────────────────────────

/** A route as the day view needs it (tms_route, active routes only). */
export interface DayRoute {
  id: string;
  routeNumber: string | null;
  routeName: string | null;
  vehicleId: string | null;
  /** staff.id of the driver set on the route (Routes → Edit → Driver). */
  driverStaffId: string | null;
}

/**
 * The route a check belongs to. The check row stores only the bus, so:
 *   1. the route of the trip it is linked to, when there is one;
 *   2. otherwise the route that bus is assigned to. If two routes share the
 *      bus, the one this driver is assigned to wins, then the lowest number.
 * Null when neither says (the bus has no route any more).
 */
export function resolveCheckRoute(
  check: { tripId: string | null; vehicleId: string; driverStaffId?: string | null },
  tripRouteId: ReadonlyMap<string, string>,
  routes: readonly DayRoute[]
): DayRoute | null {
  if (check.tripId) {
    const viaTrip = routes.find((r) => r.id === tripRouteId.get(check.tripId as string));
    if (viaTrip) return viaTrip;
  }
  const onBus = routes
    .filter((r) => r.vehicleId === check.vehicleId)
    .sort((a, b) => (a.routeNumber ?? '').localeCompare(b.routeNumber ?? '', undefined, { numeric: true }));
  if (onBus.length === 0) return null;
  return (check.driverStaffId && onBus.find((r) => r.driverStaffId === check.driverStaffId)) || onBus[0];
}

export type PreTripStatus = 'ok' | 'issue' | 'skipped' | 'not_done';

export const PRE_TRIP_STATUS_LABEL: Record<PreTripStatus, string> = {
  ok: 'All OK',
  issue: 'Issue',
  skipped: 'Skipped',
  not_done: 'Not done',
};

/** One line of the day view: a check that was done, or a bus that has none. */
export interface PreTripDayRow {
  /** Stable row id: the check id, or `route:<id>` for a bus with no check. */
  key: string;
  status: PreTripStatus;
  routeId: string | null;
  routeNumber: string | null;
  routeName: string | null;
  vehicleId: string | null;
  busRegistration: string | null;
  driverName: string | null;
  /** Null on a "Not done" row. */
  check: AdminCheckRow | null;
}

export function checkStatus(row: Pick<AdminCheckRow, 'skipped' | 'anyIssue'>): Exclude<PreTripStatus, 'not_done'> {
  if (row.skipped) return 'skipped';
  return row.anyIssue ? 'issue' : 'ok';
}

/** A bus that is expected to do a check: an active route with a bus on it. */
export interface ExpectedBus {
  route: DayRoute;
  busRegistration: string | null;
  driverName: string | null;
}

/**
 * Every check of the day (with its route), plus a "Not done" line for each
 * expected bus that has no check. A bus counts as checked when any check that
 * day is on that bus or resolved to that route. Sorted by route number; checks
 * whose route is unknown go last.
 */
export function buildDayRows(
  checks: readonly { check: AdminCheckRow; route: DayRoute | null }[],
  expected: readonly ExpectedBus[]
): PreTripDayRow[] {
  const rows: PreTripDayRow[] = checks.map(({ check, route }) => ({
    key: check.id,
    status: checkStatus(check),
    routeId: route?.id ?? null,
    routeNumber: route?.routeNumber ?? null,
    routeName: route?.routeName ?? null,
    vehicleId: check.vehicleId,
    busRegistration: check.busRegistration,
    driverName: check.driverName,
    check,
  }));

  const checkedBuses = new Set(checks.map((c) => c.check.vehicleId));
  const checkedRoutes = new Set(checks.map((c) => c.route?.id).filter(Boolean));
  for (const e of expected) {
    if (checkedRoutes.has(e.route.id)) continue;
    if (e.route.vehicleId && checkedBuses.has(e.route.vehicleId)) continue;
    rows.push({
      key: `route:${e.route.id}`,
      status: 'not_done',
      routeId: e.route.id,
      routeNumber: e.route.routeNumber,
      routeName: e.route.routeName,
      vehicleId: e.route.vehicleId,
      busRegistration: e.busRegistration,
      driverName: e.driverName,
      check: null,
    });
  }

  return rows.sort((a, b) => {
    if ((a.routeNumber == null) !== (b.routeNumber == null)) return a.routeNumber == null ? 1 : -1;
    return (a.routeNumber ?? '').localeCompare(b.routeNumber ?? '', undefined, { numeric: true });
  });
}

export interface PreTripDayTotals {
  /** Lines in the day view: buses expected to check, plus any extra checks. */
  buses: number;
  checked: number;
  ok: number;
  issue: number;
  skipped: number;
  notDone: number;
}

export function dayTotals(rows: readonly PreTripDayRow[]): PreTripDayTotals {
  const n = (s: PreTripStatus) => rows.filter((r) => r.status === s).length;
  const notDone = n('not_done');
  return { buses: rows.length, checked: rows.length - notDone, ok: n('ok'), issue: n('issue'), skipped: n('skipped'), notDone };
}

/** Short-lived on purpose: the link is minted per tap and never stored. */
export const PHOTO_URL_TTL_SECONDS = 120;
