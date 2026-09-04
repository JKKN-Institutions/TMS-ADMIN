import type { DashboardRouteRow } from './types';

// Seat-utilisation helpers for the dashboard's "Bus utilisation" bars and the
// low-occupancy count in the attention band.

/**
 * A route below this share of its bus's seats is running under-used.
 *
 * 50% is chosen against the measured spread on 2026-09-04: of the 19 routes
 * that actually have a bus, occupancy ran from 19% to 114%, averaging 63%. A
 * 70% threshold would flag 13 of 19 and stop meaning anything; 50% flags 6.
 */
export const LOW_OCCUPANCY_PCT = 50;

export interface RouteOccupancy {
  id: string;
  routeNumber: string;
  routeName: string;
  booked: number;
  capacity: number;
  /** Booked as a share of seats. Can exceed 100 — buses do get overloaded. */
  occupancy: number;
}

/**
 * Occupancy for routes that have a bus, highest first.
 *
 * Routes without a resolvable vehicle are excluded rather than shown at 0%:
 * they have no denominator, so "0% full" would be a claim we cannot support
 * and would drag the fleet average down with a number that isn't a measurement.
 */
export function routeOccupancy(routes: DashboardRouteRow[]): RouteOccupancy[] {
  return routes
    .filter((r) => (r.capacity ?? 0) > 0)
    .map((r) => ({
      id: r.id,
      routeNumber: r.routeNumber,
      routeName: r.routeName,
      booked: r.booked,
      capacity: r.capacity as number,
      occupancy: Math.round((r.booked / (r.capacity as number)) * 100),
    }))
    .sort((a, b) => b.occupancy - a.occupancy);
}

/** Routes running under LOW_OCCUPANCY_PCT of their seats. */
export function lowOccupancyRoutes(routes: DashboardRouteRow[]): RouteOccupancy[] {
  return routeOccupancy(routes).filter((r) => r.occupancy < LOW_OCCUPANCY_PCT);
}

/**
 * Mean occupancy across routes that have a bus, or null when none do.
 * Null rather than 0, so the UI omits the figure instead of reporting an
 * empty fleet as perfectly idle.
 */
export function averageOccupancy(routes: DashboardRouteRow[]): number | null {
  const rows = routeOccupancy(routes);
  if (rows.length === 0) return null;
  return Math.round(rows.reduce((sum, r) => sum + r.occupancy, 0) / rows.length);
}
