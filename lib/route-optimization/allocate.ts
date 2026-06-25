/**
 * Route Optimization — pure manual-move planner.
 *
 * Validates admin-chosen moves against current allocations and route capacity,
 * resolves each target stop by name, and reports skips with reasons. No Supabase:
 * the DB executor (apply.ts) gathers inputs and runs the resulting UPDATEs.
 */
import { normalizeStopName } from './engine';

export interface MoveRequest {
  learnerId: string;
  fromRouteId: string;
  toRouteId: string;
}
export interface RouteCapacity {
  routeId: string;
  active: boolean;
  capacity: number;
  occupancy: number;
}
export interface CurrentAllocation {
  routeId: string | null;
  stopId: string | null;
  stopName: string | null;
  learnerName: string;
  learnerRoll: string | null;
}
export interface PlannedMove {
  learnerId: string;
  learnerLabel: string;
  fromRouteId: string;
  fromStopId: string | null;
  toRouteId: string;
  toStopId: string | null;
}
export interface SkippedMove {
  learnerId: string;
  reason: string;
}
export interface PlanResult {
  moves: PlannedMove[];
  skipped: SkippedMove[];
}

export function planManualMoves(
  requests: MoveRequest[],
  routes: Map<string, RouteCapacity>,
  current: Map<string, CurrentAllocation>,
  stopNameToIdByRoute: Map<string, Map<string, string>>
): PlanResult {
  const moves: PlannedMove[] = [];
  const skipped: SkippedMove[] = [];

  const spare = new Map<string, number>();
  for (const [id, r] of routes) spare.set(id, Math.max(0, r.capacity - r.occupancy));

  for (const req of requests) {
    const cur = current.get(req.learnerId);
    if (!cur) {
      skipped.push({ learnerId: req.learnerId, reason: 'No current booking/allocation found' });
      continue;
    }
    if (cur.routeId !== req.fromRouteId) {
      skipped.push({ learnerId: req.learnerId, reason: 'Source route changed since load' });
      continue;
    }
    if (req.toRouteId === req.fromRouteId) {
      skipped.push({ learnerId: req.learnerId, reason: 'Target equals source' });
      continue;
    }
    const target = routes.get(req.toRouteId);
    if (!target || !target.active) {
      skipped.push({ learnerId: req.learnerId, reason: 'Target route not active' });
      continue;
    }
    const s = spare.get(req.toRouteId) ?? 0;
    if (s <= 0) {
      skipped.push({ learnerId: req.learnerId, reason: 'Target route is full' });
      continue;
    }
    spare.set(req.toRouteId, s - 1);

    const norm = normalizeStopName(cur.stopName);
    const toStopId = norm ? stopNameToIdByRoute.get(req.toRouteId)?.get(norm) ?? null : null;

    moves.push({
      learnerId: req.learnerId,
      learnerLabel: cur.learnerRoll ? `${cur.learnerName} (${cur.learnerRoll})` : cur.learnerName,
      fromRouteId: req.fromRouteId,
      fromStopId: cur.stopId,
      toRouteId: req.toRouteId,
      toStopId,
    });
  }

  return { moves, skipped };
}
