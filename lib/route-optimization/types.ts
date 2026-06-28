/**
 * Route Optimization — shared types.
 *
 * The engine (engine.ts) operates on these plain shapes and is intentionally
 * Supabase-agnostic. The API route (app/api/admin/route-optimization/route.ts)
 * is the only place that talks to the database; it maps tms_ rows into these
 * Raw* inputs and returns an OptimizationAnalysis.
 *
 * Optimization basis: DAILY BOOKINGS (tms_booking) for a given travel_date —
 * NOT the legacy `bookings`/`students` tables (dropped) and not annual learner
 * allocations. Occupancy = count of tms_booking rows per route for the date.
 */

export type RouteClassification = 'empty' | 'under_utilized' | 'healthy';

export type ConsolidationClass =
  | 'cancel_empty' // 0 bookings — bus need not run at all
  | 'full_transfer' // every booked passenger can move elsewhere → cancel bus
  | 'partial_transfer' // some can move, bus still required
  | 'no_transfer'; // none can move

/** A route as the engine needs it (tms_route + its assigned vehicle's capacity). */
export interface RawRoute {
  id: string;
  route_number: string | null;
  route_name: string | null;
  status: string | null;
  total_capacity: number | null;
  distance: number | null;
  departure_time: string | null;
  arrival_time: string | null;
  /** tms_vehicle.capacity of the assigned vehicle, when one is assigned. */
  vehicle_capacity: number | null;
  /** tms_vehicle.operating_cost_per_km of the assigned vehicle, when present. */
  operating_cost_per_km: number | null;
}

/** A stop as the engine needs it (tms_route_stop). */
export interface RawStop {
  id: string;
  route_id: string;
  stop_name: string | null;
  sequence_order: number | null;
  is_major_stop: boolean | null;
  /** Morning pickup time ('HH:MM[:SS]') — populated for all stops; primary match signal. */
  stop_time: string | null;
  /** Evening time ('HH:MM[:SS]'). */
  evening_time: string | null;
  /** Geo coordinates — currently unpopulated; enables proximity matching once geocoded. */
  lat: number | null;
  long: number | null;
}

/** A booking for the analyzed date (tms_booking) with display fields resolved. */
export interface RawBooking {
  route_id: string;
  learner_id: string;
  stop_id: string | null;
  /** Resolved from tms_route_stop via stop_id. */
  stop_name: string | null;
  /** Resolved from learners_profiles. */
  learner_name: string | null;
  learner_roll: string | null;
}

export interface AnalysisOptions {
  /** Routes at or below this % of capacity (and >0 bookings) are "under-utilized". */
  underUtilizedMaxPercent: number;
  /** Fallback when neither vehicle nor route capacity is known. */
  defaultCapacity: number;
  /** Fallback daily operating cost when vehicle cost/route distance is unknown. */
  defaultDailyBusCost: number;
  /** ± minutes a target stop's pickup time may differ for a compatible transfer. */
  timeWindowMin: number;
  /** Max distance (km) to accept a differently-named but nearby (geocoded) stop. */
  proximityKm: number;
  /** Allow under-utilized routes (not just healthy) as per-passenger transfer targets. */
  allowUnderUtilizedTargets: boolean;
}

export interface PassengerRelocation {
  learnerId: string;
  learnerName: string;
  learnerRoll: string | null;
  boardingStop: string | null;
  /** The booking's current stop_id on the SOURCE route (snapshot for rollback). */
  fromStopId: string | null;
  feasible: boolean;
  targetRouteId: string | null;
  targetRouteName: string | null;
  targetRouteNumber: string | null;
  /** The matching stop's id ON THE TARGET route (what the booking moves to). */
  toStopId: string | null;
  matchedStop: string | null;
  reason: string | null;
}

export interface ConsolidationSuggestion {
  routeId: string;
  routeName: string;
  routeNumber: string | null;
  currentPassengers: number;
  capacity: number;
  relocatablePassengers: number;
  classification: ConsolidationClass;
  /** True when the bus can be taken off the road for this date. */
  canCancelBus: boolean;
  /** Labeled ESTIMATE — only non-zero when the bus can be fully cancelled. */
  estimatedSavings: number;
  relocations: PassengerRelocation[];
}

/** One passenger's planned hop when a whole route is merged into a survivor. */
export interface MergeRelocation {
  learnerId: string;
  learnerName: string;
  learnerRoll: string | null;
  fromStopId: string | null;
  toStopId: string | null;
  matchedReason: string;
}

/** A proposal to fold an under-utilized route entirely into a survivor route. */
export interface MergeSuggestion {
  survivorRouteId: string;
  survivorRouteName: string;
  survivorRouteNumber: string | null;
  mergedRouteId: string;
  mergedRouteName: string;
  mergedRouteNumber: string | null;
  /** Survivor's load after absorbing this route. */
  combinedPassengers: number;
  survivorCapacity: number;
  /** Distinct survivor stops the merged passengers map onto. */
  overlapStops: number;
  relocations: MergeRelocation[];
  /** Buses taken off the road by this merge (always 1 here). */
  busesFreed: number;
  /** Labeled ESTIMATE — the merged route's daily operating cost. */
  estimatedSavings: number;
}

export type RightsizeKind = 'downsize' | 'upsize' | 'no_fit';

/** A proposal to swap a route's assigned vehicle to better fit demand. */
export interface RightsizeSuggestion {
  routeId: string;
  routeName: string;
  routeNumber: string | null;
  demand: number;
  currentVehicleId: string | null;
  currentCapacity: number;
  kind: RightsizeKind;
  recommendedVehicleId: string | null;
  recommendedCapacity: number | null;
  recommendedLabel: string | null;
  reason: string;
}

export interface RouteAnalysis {
  routeId: string;
  routeName: string;
  routeNumber: string | null;
  status: string | null;
  currentPassengers: number;
  capacity: number;
  utilizationPercent: number;
  classification: RouteClassification;
  departureTime: string | null;
  arrivalTime: string | null;
}

export interface OptimizationSummary {
  totalRoutes: number;
  activeRoutes: number;
  routesWithBookings: number;
  totalBookings: number;
  emptyRoutes: number;
  underUtilizedRoutes: number;
  healthyRoutes: number;
  cancellableBuses: number;
  fullTransfers: number;
  partialTransfers: number;
  relocatablePassengers: number;
  /** Labeled ESTIMATE — sum of daily cost of buses that can be cancelled. */
  estimatedSavings: number;
  /** Count of whole-route merges proposed (buses freed by combining). */
  mergeableBuses: number;
}

export interface OptimizationAnalysis {
  date: string;
  options: AnalysisOptions;
  summary: OptimizationSummary;
  routes: RouteAnalysis[];
  suggestions: ConsolidationSuggestion[];
  merges: MergeSuggestion[];
  rightsize: RightsizeSuggestion[];
}
