/**
 * Route Optimization — vehicle right-sizing (pure).
 *
 * Matches each route's assigned vehicle to its actual demand:
 *   - DOWNSIZE: demand is well below capacity and a smaller spare bus still fits
 *     (with headroom) → free the bigger bus for a busier route.
 *   - UPSIZE: demand exceeds capacity → recommend the smallest spare bus that fits.
 *   - NO_FIT: demand exceeds capacity and no spare bus is large enough.
 * Routes that are already a good fit produce no suggestion. Each spare vehicle is
 * recommended at most once per analysis. Pure — no Supabase.
 */
import type { RightsizeSuggestion } from './types';

export interface FleetVehicle {
  id: string;
  capacity: number;
  label: string | null; // registration number
}

export interface RightsizeRouteInput {
  routeId: string;
  routeName: string;
  routeNumber: string | null;
  /** Demand for the horizon (daily booking count, or planning peak). */
  demand: number;
  currentVehicleId: string | null;
  currentCapacity: number;
}

export interface RightsizeOptions {
  /** Require chosen capacity ≥ demand × (1 + headroom%). */
  headroomPercent: number;
  /** Ignore routes with demand below this (too small to bother). */
  minDemand: number;
}

const fmt = (s: RightsizeSuggestion) => s;

export function recommendRightsizing(
  routes: RightsizeRouteInput[],
  fleet: FleetVehicle[],
  opts: RightsizeOptions
): RightsizeSuggestion[] {
  const spares = [...fleet].sort((a, b) => a.capacity - b.capacity); // smallest-fit first
  const used = new Set<string>();
  const out: RightsizeSuggestion[] = [];

  for (const r of routes) {
    if (r.demand < opts.minDemand) continue;
    const required = Math.max(r.demand, Math.ceil(r.demand * (1 + opts.headroomPercent / 100)));

    if (r.currentCapacity < r.demand) {
      // Over capacity — must upsize.
      const pick = spares.find((v) => !used.has(v.id) && v.capacity >= required && v.capacity > r.currentCapacity);
      if (pick) {
        used.add(pick.id);
        out.push(fmt({
          routeId: r.routeId, routeName: r.routeName, routeNumber: r.routeNumber,
          demand: r.demand, currentVehicleId: r.currentVehicleId, currentCapacity: r.currentCapacity,
          kind: 'upsize', recommendedVehicleId: pick.id, recommendedCapacity: pick.capacity, recommendedLabel: pick.label,
          reason: `${r.demand} booked exceeds ${r.currentCapacity} seats — use a ${pick.capacity}-seat bus${pick.label ? ` (${pick.label})` : ''}`,
        }));
      } else {
        out.push(fmt({
          routeId: r.routeId, routeName: r.routeName, routeNumber: r.routeNumber,
          demand: r.demand, currentVehicleId: r.currentVehicleId, currentCapacity: r.currentCapacity,
          kind: 'no_fit', recommendedVehicleId: null, recommendedCapacity: null, recommendedLabel: null,
          reason: `${r.demand} booked exceeds ${r.currentCapacity} seats — no spare vehicle is large enough`,
        }));
      }
    } else if (r.currentCapacity > required) {
      // Over-provisioned — downsize if a smaller spare still fits.
      const pick = spares.find((v) => !used.has(v.id) && v.capacity >= required && v.capacity < r.currentCapacity);
      if (pick) {
        used.add(pick.id);
        out.push(fmt({
          routeId: r.routeId, routeName: r.routeName, routeNumber: r.routeNumber,
          demand: r.demand, currentVehicleId: r.currentVehicleId, currentCapacity: r.currentCapacity,
          kind: 'downsize', recommendedVehicleId: pick.id, recommendedCapacity: pick.capacity, recommendedLabel: pick.label,
          reason: `Only ${r.demand} booked — a ${pick.capacity}-seat bus${pick.label ? ` (${pick.label})` : ''} fits (current ${r.currentCapacity})`,
        }));
      }
    }
    // else: good fit — no suggestion.
  }

  return out;
}
