import type { DashboardRouteRow } from './types';

// Operational triage for the dashboard's route board: what is wrong with each
// route right now, and in what order should an officer deal with it.
//
// Kept out of the component so the ordering rules are testable. The colour for
// each kind belongs to the view, not here.

export type RouteStateKind =
  | 'no-bus'
  | 'none-boarded'
  | 'no-driver'
  | 'walk-ups'
  | 'quiet'
  | 'ok';

export interface RouteState {
  kind: RouteStateKind;
  /** Plain-language reason, empty when the route is fine. */
  note: string;
}

/**
 * Classifies one route. The order of these checks is the priority order — the
 * first thing true is what the officer is told, because a route with no bus
 * assigned does not also need to be told nobody boarded it.
 */
export function routeState(r: DashboardRouteRow): RouteState {
  if (!r.vehicleRegistration) {
    return { kind: 'no-bus', note: 'No bus assigned' };
  }
  if (r.booked > 0 && r.boarded === 0) {
    return { kind: 'none-boarded', note: 'Nobody scanned' };
  }
  if (!r.hasDriver) {
    return { kind: 'no-driver', note: 'No driver assigned' };
  }
  if (r.boarded > r.booked) {
    // Not an error: walk-up riders are scanned without a booking, so boarded
    // legitimately exceeds booked. Worth surfacing, not worth alarming over.
    const extra = r.boarded - r.booked;
    return { kind: 'walk-ups', note: `${extra} unbooked ${extra === 1 ? 'rider' : 'riders'}` };
  }
  if (r.booked === 0) {
    return { kind: 'quiet', note: 'No bookings today' };
  }
  return { kind: 'ok', note: '' };
}

/** Lower sorts first. 'quiet' ranks last: a route nobody booked is not a fault. */
const ATTENTION_RANK: Record<RouteStateKind, number> = {
  'no-bus': 0,
  'none-boarded': 1,
  'no-driver': 2,
  'walk-ups': 3,
  ok: 4,
  quiet: 5,
};

export type RouteSortKey = 'attention' | 'busiest' | 'number';

export interface DecoratedRoute {
  route: DashboardRouteRow;
  state: RouteState;
}

export function decorateRoutes(routes: DashboardRouteRow[]): DecoratedRoute[] {
  return routes.map((route) => ({ route, state: routeState(route) }));
}

/** Sorts a copy; never mutates the input. */
export function sortRoutes(rows: DecoratedRoute[], sort: RouteSortKey): DecoratedRoute[] {
  const byBusiest = (a: DecoratedRoute, b: DecoratedRoute) => b.route.booked - a.route.booked;

  if (sort === 'busiest') return [...rows].sort(byBusiest);

  if (sort === 'number') {
    // Route numbers are text ('07', '31', and occasionally non-numeric), so
    // compare numerically where possible and fall back to text.
    return [...rows].sort((a, b) =>
      a.route.routeNumber.localeCompare(b.route.routeNumber, undefined, { numeric: true })
    );
  }

  return [...rows].sort(
    (a, b) => ATTENTION_RANK[a.state.kind] - ATTENTION_RANK[b.state.kind] || byBusiest(a, b)
  );
}

/**
 * Free-text + issues-only filtering for the board.
 *
 * A board with no way to filter is the named anti-pattern for a data-dense
 * screen: 25 rows is already past what someone scans reliably when they are
 * hunting one specific bus. Matching covers every identifier an officer might
 * type from memory — the route number, its code, the destination, the bus
 * registration, or the driver's name.
 */
export function filterRoutes(
  rows: DecoratedRoute[],
  opts: { query?: string; issuesOnly?: boolean } = {}
): DecoratedRoute[] {
  const q = (opts.query ?? '').trim().toLowerCase();

  return rows.filter(({ route, state }) => {
    if (opts.issuesOnly && (state.kind === 'ok' || state.kind === 'quiet')) return false;
    if (!q) return true;

    return [
      route.routeNumber,
      route.routeCode,
      route.routeName,
      route.startLocation,
      route.endLocation,
      route.vehicleRegistration,
      route.driverName,
    ].some((field) => (field ?? '').toLowerCase().includes(q));
  });
}

/** How many routes an officer actually needs to look at. */
export function countFlagged(rows: DecoratedRoute[]): number {
  return rows.filter((x) => x.state.kind !== 'ok' && x.state.kind !== 'quiet').length;
}

/**
 * Boarded as a percentage of booked, or null when there is no denominator.
 * NOT clamped to 100: walk-ups make genuine turnouts above 100% possible, and
 * hiding that would misreport a real operational fact.
 */
export function turnoutOf(r: DashboardRouteRow): number | null {
  if (r.booked <= 0) return null;
  return Math.round((r.boarded / r.booked) * 100);
}

/** Booked as a percentage of the assigned bus's seats, or null when no bus. */
export function loadOf(r: DashboardRouteRow): number | null {
  if (!r.capacity || r.capacity <= 0) return null;
  return Math.round((r.booked / r.capacity) * 100);
}
