/**
 * Route Optimization — whole-route merge planner (pure).
 *
 * "Combine the buses": fold an under-utilized route entirely into a SURVIVOR
 * route when (a) the survivor has capacity for everyone, and (b) every passenger
 * on the merged route has a name/time/geo-compatible stop on the survivor. The
 * merged bus is then freed for the day. Greedy, smallest-first, with two guards:
 *   - a route chosen as a survivor can never also be merged away (no chains),
 *   - a merged-away route can never be a survivor.
 * Multiple small routes can fold into the same survivor while its running
 * occupancy still fits capacity.
 *
 * Pure — no Supabase. Applying a merge reuses the per-passenger move path
 * (expand each relocation into a booking/allocation move).
 */
import { bestStopMatch, type MatchStop } from './match';
import type { MergeRelocation, MergeSuggestion, RouteClassification } from './types';

export interface MergePassenger {
  learnerId: string;
  learnerName: string;
  learnerRoll: string | null;
  stop: MatchStop | null;
}

export interface MergeRouteInput {
  routeId: string;
  routeName: string;
  routeNumber: string | null;
  capacity: number;
  occupancy: number;
  classification: RouteClassification;
  /** This route's estimated daily operating cost (for savings). */
  dailyCost: number;
  stops: MatchStop[];
  passengers: MergePassenger[];
}

export interface MergeOptions {
  timeWindowMin: number;
  proximityKm: number;
  /** Minimum distinct survivor stops the merged passengers must map onto. */
  minOverlapStops: number;
}

export function findMerges(routes: MergeRouteInput[], opts: MergeOptions): MergeSuggestion[] {
  const mergedAway = new Set<string>();
  const survivorSet = new Set<string>();
  const occ = new Map<string, number>();
  for (const r of routes) occ.set(r.routeId, r.occupancy);

  const matchOpts = { timeWindowMin: opts.timeWindowMin, proximityKm: opts.proximityKm };

  // Sources: under-utilized routes WITH passengers, smallest first (easiest to fold).
  const sources = routes
    .filter((r) => r.classification === 'under_utilized' && r.passengers.length > 0)
    .sort((a, b) => a.occupancy - b.occupancy);

  const suggestions: MergeSuggestion[] = [];

  for (const source of sources) {
    if (mergedAway.has(source.routeId) || survivorSet.has(source.routeId)) continue;

    let best: { survivor: MergeRouteInput; relocations: MergeRelocation[]; overlap: number } | null = null;

    for (const survivor of routes) {
      if (survivor.routeId === source.routeId) continue;
      if (mergedAway.has(survivor.routeId)) continue;
      const survOcc = occ.get(survivor.routeId) ?? survivor.occupancy;
      if (survOcc + source.passengers.length > survivor.capacity) continue;

      // Every source passenger must map onto a survivor stop, or it's not a clean merge.
      const relocations: MergeRelocation[] = [];
      const matchedStops = new Set<string>();
      let allMatched = true;
      for (const p of source.passengers) {
        if (!p.stop) { allMatched = false; break; }
        const m = bestStopMatch(p.stop, survivor.stops, matchOpts);
        if (!m) { allMatched = false; break; }
        matchedStops.add(m.stopId);
        relocations.push({
          learnerId: p.learnerId,
          learnerName: p.learnerName,
          learnerRoll: p.learnerRoll,
          fromStopId: p.stop.id,
          toStopId: m.stopId,
          matchedReason: m.reason,
        });
      }
      if (!allMatched || matchedStops.size < opts.minOverlapStops) continue;

      const overlap = matchedStops.size;
      if (!best || overlap > best.overlap) best = { survivor, relocations, overlap };
    }

    if (best) {
      mergedAway.add(source.routeId);
      survivorSet.add(best.survivor.routeId);
      const newOcc = (occ.get(best.survivor.routeId) ?? best.survivor.occupancy) + source.passengers.length;
      occ.set(best.survivor.routeId, newOcc);
      suggestions.push({
        survivorRouteId: best.survivor.routeId,
        survivorRouteName: best.survivor.routeName,
        survivorRouteNumber: best.survivor.routeNumber,
        mergedRouteId: source.routeId,
        mergedRouteName: source.routeName,
        mergedRouteNumber: source.routeNumber,
        combinedPassengers: newOcc,
        survivorCapacity: best.survivor.capacity,
        overlapStops: best.overlap,
        relocations: best.relocations,
        busesFreed: 1,
        estimatedSavings: source.dailyCost,
      });
    }
  }

  return suggestions;
}
