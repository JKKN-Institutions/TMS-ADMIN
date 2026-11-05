import { describe, it, expect } from 'vitest';
import { planRouteAssignment, parseRouteChoice } from './route-assignment';

const routes = [
  { id: 'r12', vehicle_id: 'busA' },
  { id: 'r20', vehicle_id: 'busB' },
  { id: 'r30', vehicle_id: null },
];

describe('planRouteAssignment', () => {
  it('moves the bus from its old route to the chosen free route', () => {
    expect(planRouteAssignment('busA', 'r30', routes)).toEqual({
      clearRouteIds: ['r12'], setRouteId: 'r30', displacedVehicleId: null, changed: true,
    });
  });

  it('taking a route that has another bus displaces that bus', () => {
    expect(planRouteAssignment('busA', 'r20', routes)).toEqual({
      clearRouteIds: ['r12'], setRouteId: 'r20', displacedVehicleId: 'busB', changed: true,
    });
  });

  it('choosing the route the bus already has changes nothing', () => {
    expect(planRouteAssignment('busA', 'r12', routes)).toEqual({
      clearRouteIds: [], setRouteId: null, displacedVehicleId: null, changed: false,
    });
  });

  it('"no route" removes the bus from every route it is on', () => {
    expect(planRouteAssignment('busA', null, [...routes, { id: 'r40', vehicle_id: 'busA' }])).toEqual({
      clearRouteIds: ['r12', 'r40'], setRouteId: null, displacedVehicleId: null, changed: true,
    });
  });

  it('a bus with no route and "no route" chosen changes nothing', () => {
    expect(planRouteAssignment('busC', null, routes).changed).toBe(false);
  });

  it('an unknown route id is refused', () => {
    expect(() => planRouteAssignment('busA', 'nope', routes)).toThrow('Route not found');
  });
});

describe('parseRouteChoice', () => {
  it('distinguishes "not sent" from "no route"', () => {
    expect(parseRouteChoice({})).toEqual({ provided: false });
    expect(parseRouteChoice({ route_id: '' })).toEqual({ provided: true, routeId: null });
    expect(parseRouteChoice({ route_id: null })).toEqual({ provided: true, routeId: null });
    expect(parseRouteChoice({ route_id: 'r12' })).toEqual({ provided: true, routeId: 'r12' });
  });
});
