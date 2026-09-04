import type { DashboardRouteRow } from '@/lib/dashboard/types';
import { decorateRoutes, countFlagged } from '@/lib/dashboard/route-state';

// Fleet-level roll-up for Routes > Analytics.
//
// Every ratio here returns null rather than 0 when its denominator is missing.
// A fleet with no bookings has no turnout; reporting "0%" would read as
// "everybody stayed home" instead of "nothing to measure".

export interface RouteAnalyticsSummary {
  totalRoutes: number;
  /** Routes an officer needs to look at (no bus / nobody scanned / no driver / walk-ups). */
  flagged: number;
  routesWithoutBus: number;
  routesWithoutDriver: number;
  /** Routes with at least one booking today. */
  routesRunning: number;

  totalBooked: number;
  totalBoarded: number;
  /** Boarded / booked across the fleet. Uncapped — walk-ups can push it over 100. */
  turnout: number | null;

  /** Seats on assigned buses only, so it means "capacity we are actually running". */
  seatsRunning: number;
  /** Booked / seatsRunning. */
  seatUtilisation: number | null;

  totalStops: number;
}

export function summariseRoutes(routes: DashboardRouteRow[]): RouteAnalyticsSummary {
  const decorated = decorateRoutes(routes);

  const totalBooked = sum(routes, (r) => r.booked);
  const totalBoarded = sum(routes, (r) => r.boarded);
  const seatsRunning = sum(routes, (r) => r.capacity ?? 0);

  return {
    totalRoutes: routes.length,
    flagged: countFlagged(decorated),
    routesWithoutBus: routes.filter((r) => !r.vehicleRegistration).length,
    routesWithoutDriver: routes.filter((r) => !r.hasDriver).length,
    routesRunning: routes.filter((r) => r.booked > 0).length,

    totalBooked,
    totalBoarded,
    turnout: ratio(totalBoarded, totalBooked),

    seatsRunning,
    seatUtilisation: ratio(totalBooked, seatsRunning),

    totalStops: sum(routes, (r) => r.stops),
  };
}

export interface RouteRankRow {
  routeNumber: string;
  routeName: string;
  booked: number;
  boarded: number;
}

/**
 * The busiest routes, for the bar chart.
 *
 * Routes with no bookings are dropped rather than padding the chart with zero
 * bars — an empty route is a fact for the table, not a data point worth ink.
 */
export function busiestRoutes(routes: DashboardRouteRow[], limit = 10): RouteRankRow[] {
  return routes
    .filter((r) => r.booked > 0)
    .sort((a, b) => b.booked - a.booked || a.routeNumber.localeCompare(b.routeNumber))
    .slice(0, limit)
    .map((r) => ({
      routeNumber: r.routeNumber,
      routeName: r.routeName,
      booked: r.booked,
      boarded: r.boarded,
    }));
}

/**
 * Routes whose turnout is furthest BELOW their bookings — where seats were
 * reserved and not used. Ranked by the gap in absolute riders, because 20
 * no-shows on a full bus wastes more capacity than 2 on a quiet one.
 */
export function biggestNoShows(routes: DashboardRouteRow[], limit = 5): RouteRankRow[] {
  return routes
    .filter((r) => r.booked > 0 && r.boarded < r.booked)
    .sort((a, b) => (b.booked - b.boarded) - (a.booked - a.boarded))
    .slice(0, limit)
    .map((r) => ({
      routeNumber: r.routeNumber,
      routeName: r.routeName,
      booked: r.booked,
      boarded: r.boarded,
    }));
}

function sum(routes: DashboardRouteRow[], pick: (r: DashboardRouteRow) => number): number {
  return routes.reduce((acc, r) => acc + pick(r), 0);
}

/** Whole-number percentage, or null when there is nothing to divide by. */
function ratio(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return Math.round((part / whole) * 100);
}
