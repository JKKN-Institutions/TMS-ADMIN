/**
 * Route Optimization — analysis engine (pure, no Supabase).
 *
 * Given the routes, their stops, and the bookings for one travel_date, it:
 *   1. computes per-route occupancy (booked passengers / capacity),
 *   2. classifies each route empty / under-utilized / healthy,
 *   3. proposes consolidations: for each empty or under-utilized route, can its
 *      passengers be moved onto a HEALTHY route that already serves their
 *      boarding stop and has a free seat? If all can move (or there are none),
 *      the bus can be cancelled.
 *
 * Design choices (Phase 1, read-only):
 *   - Capacity comes from the assigned vehicle, falling back to the route's
 *     own total_capacity, then a default. Live data shows total_capacity is
 *     largely unmaintained while vehicle.capacity is populated (~58-60).
 *   - Transfer TARGETS are restricted to HEALTHY routes only. This keeps the
 *     suggestion conservative and avoids cascading/circular cancellations
 *     (route A emptied into B while B is also being emptied into A).
 *   - Stop matching is by NORMALIZED STOP NAME. The modern tms_booking stores a
 *     real stop_id → tms_route_stop, so we match concrete stop identities, not
 *     the legacy free-text fuzzy town-name heuristic. Geo matching (lat/long)
 *     is deferred until stops are geocoded.
 *   - "Savings" is a clearly-labeled ESTIMATE and is only credited when a bus
 *     can be fully removed from the road.
 */

import type {
  AnalysisOptions,
  ConsolidationClass,
  ConsolidationSuggestion,
  OptimizationAnalysis,
  PassengerRelocation,
  RawBooking,
  RawRoute,
  RawStop,
  RouteAnalysis,
  RouteClassification,
} from './types';

export const DEFAULT_OPTIONS: AnalysisOptions = {
  underUtilizedMaxPercent: 50,
  defaultCapacity: 60,
  defaultDailyBusCost: 2500,
};

/** Lowercase, strip punctuation, collapse whitespace — for stop-name equality. */
export function normalizeStopName(name: string | null | undefined): string {
  return (name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** vehicle capacity → route total_capacity → default. */
export function resolveCapacity(route: RawRoute, opts: AnalysisOptions): number {
  if (route.vehicle_capacity && route.vehicle_capacity > 0) return route.vehicle_capacity;
  if (route.total_capacity && route.total_capacity > 0) return route.total_capacity;
  return opts.defaultCapacity;
}

function classifyRoute(
  count: number,
  capacity: number,
  opts: AnalysisOptions
): RouteClassification {
  if (count === 0) return 'empty';
  const threshold = Math.max(1, Math.floor((capacity * opts.underUtilizedMaxPercent) / 100));
  return count <= threshold ? 'under_utilized' : 'healthy';
}

function estimatedDailyBusCost(route: RawRoute, opts: AnalysisOptions): number {
  const cost = route.operating_cost_per_km ?? 0;
  const dist = route.distance ?? 0;
  if (cost > 0 && dist > 0) {
    // Round trip for the day.
    return Math.round(cost * dist * 2);
  }
  return opts.defaultDailyBusCost;
}

function displayName(route: RawRoute): string {
  return route.route_name?.trim() || `Route ${route.route_number ?? route.id.slice(0, 8)}`;
}

export function analyzeOptimization(
  routes: RawRoute[],
  stops: RawStop[],
  bookings: RawBooking[],
  date: string,
  optionsOverride: Partial<AnalysisOptions> = {}
): OptimizationAnalysis {
  const options: AnalysisOptions = { ...DEFAULT_OPTIONS, ...optionsOverride };

  const activeRoutes = routes.filter((r) => (r.status ?? 'active') === 'active');

  // Per-route bookings.
  const bookingsByRoute = new Map<string, RawBooking[]>();
  for (const b of bookings) {
    const list = bookingsByRoute.get(b.route_id);
    if (list) list.push(b);
    else bookingsByRoute.set(b.route_id, [b]);
  }

  // Per-route map of normalized stop-name → stop id. Used both to test whether a
  // target route serves a stop AND to know which stop the booking moves to.
  const stopMapByRoute = new Map<string, Map<string, string>>();
  for (const s of stops) {
    const key = normalizeStopName(s.stop_name);
    if (!key) continue;
    let m = stopMapByRoute.get(s.route_id);
    if (!m) {
      m = new Map();
      stopMapByRoute.set(s.route_id, m);
    }
    if (!m.has(key)) m.set(key, s.id); // first stop with this name wins
  }

  // Per-route capacity + occupancy + classification.
  const capacityByRoute = new Map<string, number>();
  const countByRoute = new Map<string, number>();
  const classByRoute = new Map<string, RouteClassification>();
  const routeAnalysis: RouteAnalysis[] = [];

  for (const route of activeRoutes) {
    const count = bookingsByRoute.get(route.id)?.length ?? 0;
    const capacity = resolveCapacity(route, options);
    const classification = classifyRoute(count, capacity, options);
    capacityByRoute.set(route.id, capacity);
    countByRoute.set(route.id, count);
    classByRoute.set(route.id, classification);
    routeAnalysis.push({
      routeId: route.id,
      routeName: displayName(route),
      routeNumber: route.route_number,
      status: route.status,
      currentPassengers: count,
      capacity,
      utilizationPercent: capacity > 0 ? Math.round((count / capacity) * 100) : 0,
      classification,
      departureTime: route.departure_time,
      arrivalTime: route.arrival_time,
    });
  }

  // Spare seats on each route. Targets consume spare as we assign, so two
  // source routes can't both be told to dump into the same last free seat.
  const spareByRoute = new Map<string, number>();
  for (const route of activeRoutes) {
    spareByRoute.set(
      route.id,
      Math.max(0, (capacityByRoute.get(route.id) ?? 0) - (countByRoute.get(route.id) ?? 0))
    );
  }

  // Candidate targets: HEALTHY routes only (see header note).
  const healthyTargets = activeRoutes.filter((r) => classByRoute.get(r.id) === 'healthy');

  // Sources: empty or under-utilized, processed smallest-first so the easiest
  // buses to empty claim target seats before the harder ones.
  const sources = activeRoutes
    .filter((r) => {
      const c = classByRoute.get(r.id);
      return c === 'empty' || c === 'under_utilized';
    })
    .sort((a, b) => (countByRoute.get(a.id) ?? 0) - (countByRoute.get(b.id) ?? 0));

  const suggestions: ConsolidationSuggestion[] = [];

  for (const source of sources) {
    const passengers = bookingsByRoute.get(source.id) ?? [];
    const capacity = capacityByRoute.get(source.id) ?? options.defaultCapacity;
    const relocations: PassengerRelocation[] = [];
    let relocatable = 0;

    for (const p of passengers) {
      const stopKey = normalizeStopName(p.stop_name);
      const name = p.learner_name?.trim() || 'Unknown learner';

      // Best healthy target that serves this stop and still has a free seat.
      let best: RawRoute | null = null;
      let bestSpare = 0;
      let bestStopId: string | null = null;
      if (stopKey) {
        for (const target of healthyTargets) {
          if (target.id === source.id) continue;
          const spare = spareByRoute.get(target.id) ?? 0;
          if (spare <= 0) continue;
          const targetStopId = stopMapByRoute.get(target.id)?.get(stopKey);
          if (!targetStopId) continue;
          if (spare > bestSpare) {
            best = target;
            bestSpare = spare;
            bestStopId = targetStopId;
          }
        }
      }

      if (best) {
        spareByRoute.set(best.id, (spareByRoute.get(best.id) ?? 0) - 1);
        relocatable++;
        relocations.push({
          learnerId: p.learner_id,
          learnerName: name,
          learnerRoll: p.learner_roll,
          boardingStop: p.stop_name,
          fromStopId: p.stop_id,
          feasible: true,
          targetRouteId: best.id,
          targetRouteName: displayName(best),
          targetRouteNumber: best.route_number,
          toStopId: bestStopId,
          matchedStop: p.stop_name,
          reason: null,
        });
      } else {
        relocations.push({
          learnerId: p.learner_id,
          learnerName: name,
          learnerRoll: p.learner_roll,
          boardingStop: p.stop_name,
          fromStopId: p.stop_id,
          feasible: false,
          targetRouteId: null,
          targetRouteName: null,
          targetRouteNumber: null,
          toStopId: null,
          matchedStop: null,
          reason: stopKey
            ? 'No healthy route serves this boarding stop with a free seat'
            : 'Booking has no boarding stop recorded',
        });
      }
    }

    const count = passengers.length;
    const canCancelBus = count === 0 || relocatable === count;
    let classification: ConsolidationClass;
    if (count === 0) classification = 'cancel_empty';
    else if (relocatable === count) classification = 'full_transfer';
    else if (relocatable > 0) classification = 'partial_transfer';
    else classification = 'no_transfer';

    const estimatedSavings = canCancelBus ? estimatedDailyBusCost(source, options) : 0;

    suggestions.push({
      routeId: source.id,
      routeName: displayName(source),
      routeNumber: source.route_number,
      currentPassengers: count,
      capacity,
      relocatablePassengers: relocatable,
      classification,
      canCancelBus,
      estimatedSavings,
      relocations,
    });
  }

  // Summary.
  const totalBookings = bookings.length;
  const emptyRoutes = routeAnalysis.filter((r) => r.classification === 'empty').length;
  const underUtilizedRoutes = routeAnalysis.filter(
    (r) => r.classification === 'under_utilized'
  ).length;
  const healthyRoutes = routeAnalysis.filter((r) => r.classification === 'healthy').length;
  const cancellableBuses = suggestions.filter((s) => s.canCancelBus).length;
  const fullTransfers = suggestions.filter((s) => s.classification === 'full_transfer').length;
  const partialTransfers = suggestions.filter(
    (s) => s.classification === 'partial_transfer'
  ).length;
  const relocatablePassengers = suggestions.reduce((sum, s) => sum + s.relocatablePassengers, 0);
  const estimatedSavings = suggestions.reduce((sum, s) => sum + s.estimatedSavings, 0);

  // Most actionable first: cancellable, then most passengers movable.
  suggestions.sort((a, b) => {
    if (a.canCancelBus !== b.canCancelBus) return a.canCancelBus ? -1 : 1;
    return b.relocatablePassengers - a.relocatablePassengers;
  });
  routeAnalysis.sort((a, b) => a.utilizationPercent - b.utilizationPercent);

  return {
    date,
    options,
    summary: {
      totalRoutes: routes.length,
      activeRoutes: activeRoutes.length,
      routesWithBookings: bookingsByRoute.size,
      totalBookings,
      emptyRoutes,
      underUtilizedRoutes,
      healthyRoutes,
      cancellableBuses,
      fullTransfers,
      partialTransfers,
      relocatablePassengers,
      estimatedSavings,
    },
    routes: routeAnalysis,
    suggestions,
  };
}
