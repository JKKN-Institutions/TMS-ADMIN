import { describe, it, expect } from 'vitest';
import { planManualMoves, type MoveRequest, type RouteCapacity, type CurrentAllocation } from './allocate';

const routes = new Map<string, RouteCapacity>([
  ['U', { routeId: 'U', active: true, capacity: 60, occupancy: 6 }],
  ['H', { routeId: 'H', active: true, capacity: 60, occupancy: 59 }], // 1 spare
  ['X', { routeId: 'X', active: false, capacity: 60, occupancy: 0 }],
]);
const current = new Map<string, CurrentAllocation>([
  ['l1', { routeId: 'U', stopId: 's-u-pp', stopName: 'Pallipalayam', learnerName: 'A Kumar', learnerRoll: '21CS01' }],
  ['l2', { routeId: 'U', stopId: 's-u-gobi', stopName: 'Gobi', learnerName: 'R Devi', learnerRoll: '21CS02' }],
  ['l3', { routeId: 'V', stopId: null, stopName: null, learnerName: 'Stale', learnerRoll: null }],
]);
const stopMap = new Map<string, Map<string, string>>([
  ['H', new Map([['pallipalayam', 's-h-pp']])], // H serves Pallipalayam (id s-h-pp), not Gobi
]);

describe('planManualMoves', () => {
  it('moves a learner and resolves the target stop by name', () => {
    const reqs: MoveRequest[] = [{ learnerId: 'l1', fromRouteId: 'U', toRouteId: 'H' }];
    const { moves, skipped } = planManualMoves(reqs, routes, current, stopMap);
    expect(skipped).toHaveLength(0);
    expect(moves[0]).toMatchObject({ learnerId: 'l1', fromRouteId: 'U', fromStopId: 's-u-pp', toRouteId: 'H', toStopId: 's-h-pp', learnerLabel: 'A Kumar (21CS01)' });
  });

  it('sets toStopId null when the target does not serve the stop', () => {
    const reqs: MoveRequest[] = [{ learnerId: 'l2', fromRouteId: 'U', toRouteId: 'H' }];
    const { moves } = planManualMoves(reqs, routes, current, stopMap);
    expect(moves[0].toStopId).toBeNull();
  });

  it('blocks overfill across the batch (H has 1 spare)', () => {
    const reqs: MoveRequest[] = [
      { learnerId: 'l1', fromRouteId: 'U', toRouteId: 'H' },
      { learnerId: 'l2', fromRouteId: 'U', toRouteId: 'H' },
    ];
    const { moves, skipped } = planManualMoves(reqs, routes, current, stopMap);
    expect(moves).toHaveLength(1);
    expect(skipped).toEqual([{ learnerId: 'l2', reason: 'Target route is full' }]);
  });

  it('skips when the source route changed since load', () => {
    const reqs: MoveRequest[] = [{ learnerId: 'l3', fromRouteId: 'U', toRouteId: 'H' }];
    const { skipped } = planManualMoves(reqs, routes, current, stopMap);
    expect(skipped[0].reason).toBe('Source route changed since load');
  });

  it('skips an inactive target route', () => {
    const reqs: MoveRequest[] = [{ learnerId: 'l1', fromRouteId: 'U', toRouteId: 'X' }];
    const { skipped } = planManualMoves(reqs, routes, current, stopMap);
    expect(skipped[0].reason).toBe('Target route not active');
  });
});
