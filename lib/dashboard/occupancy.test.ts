import { describe, expect, it } from 'vitest';
import { averageOccupancy, lowOccupancyRoutes, routeOccupancy } from './occupancy';
import type { DashboardRouteRow } from './types';

function route(over: Partial<DashboardRouteRow> = {}): DashboardRouteRow {
  return {
    id: 'r1',
    routeNumber: '01',
    routeName: 'SALEM',
    routeCode: null,
    startLocation: null,
    endLocation: null,
    departureTime: null,
    arrivalTime: null,
    duration: null,
    stops: 0,
    vehicleRegistration: 'TN59BX7286',
    capacity: 60,
    hasDriver: true,
    driverName: null,
    tripStatus: null,
    booked: 30,
    boarded: 30,
    ...over,
  };
}

describe('routeOccupancy', () => {
  it('is booked over seats, as a whole percentage', () => {
    expect(routeOccupancy([route({ booked: 30, capacity: 60 })])[0].occupancy).toBe(50);
  });

  it('ranks the fullest route first', () => {
    const rows = routeOccupancy([
      route({ id: 'a', routeNumber: '01', booked: 20, capacity: 60 }),
      route({ id: 'b', routeNumber: '02', booked: 55, capacity: 60 }),
    ]);
    expect(rows.map((r) => r.routeNumber)).toEqual(['02', '01']);
  });

  it('excludes routes with no bus rather than charting them at 0%', () => {
    // 6 active routes have no resolvable vehicle. They have no denominator, so
    // "0% full" would be a claim we cannot support.
    const rows = routeOccupancy([
      route({ id: 'a' }),
      route({ id: 'b', capacity: null, vehicleRegistration: null, booked: 50 }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('a');
  });

  it('allows occupancy above 100 — buses do get overloaded', () => {
    // Measured 2026-09-04: the busiest route ran at 113.6% of seats.
    expect(routeOccupancy([route({ booked: 68, capacity: 60 })])[0].occupancy).toBe(113);
  });

  it('treats a zero capacity as no denominator, not division by zero', () => {
    expect(routeOccupancy([route({ capacity: 0 })])).toEqual([]);
  });
});

describe('lowOccupancyRoutes', () => {
  it('flags routes below the 50% threshold', () => {
    const rows = lowOccupancyRoutes([
      route({ id: 'low', booked: 20, capacity: 60 }),
      route({ id: 'ok', booked: 40, capacity: 60 }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(['low']);
  });

  it('does not flag a route sitting exactly on the threshold', () => {
    expect(lowOccupancyRoutes([route({ booked: 30, capacity: 60 })])).toEqual([]);
  });
});

describe('averageOccupancy', () => {
  it('averages only the routes that have a bus', () => {
    const avg = averageOccupancy([
      route({ id: 'a', booked: 30, capacity: 60 }),
      route({ id: 'b', booked: 60, capacity: 60 }),
      route({ id: 'c', capacity: null, vehicleRegistration: null, booked: 99 }),
    ]);
    expect(avg).toBe(75);
  });

  it('is null when no route has a bus', () => {
    expect(averageOccupancy([route({ capacity: null, vehicleRegistration: null })])).toBeNull();
  });

  it('is null for an empty fleet', () => {
    expect(averageOccupancy([])).toBeNull();
  });
});
