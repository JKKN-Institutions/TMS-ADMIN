import { describe, expect, it } from 'vitest';
import { biggestNoShows, busiestRoutes, summariseRoutes } from './analytics';
import type { DashboardRouteRow } from '@/lib/dashboard/types';

function route(over: Partial<DashboardRouteRow> = {}): DashboardRouteRow {
  return {
    id: 'r1',
    routeNumber: '01',
    routeName: 'SALEM',
    routeCode: 'SALEM NO 1',
    startLocation: 'SALEM',
    endLocation: 'COLLEGE',
    departureTime: '07:30:00',
    arrivalTime: '08:55:00',
    duration: '1h 25m',
    stops: 17,
    vehicleRegistration: 'TN59BX7286',
    capacity: 59,
    hasDriver: true,
    driverName: 'GUNASEGARAN V',
    tripStatus: null,
    booked: 40,
    boarded: 35,
    ...over,
  };
}

describe('summariseRoutes', () => {
  it('rolls up counts across the fleet', () => {
    const s = summariseRoutes([
      route({ id: 'a', booked: 40, boarded: 35, capacity: 59, stops: 17 }),
      route({ id: 'b', booked: 60, boarded: 55, capacity: 60, stops: 20 }),
    ]);
    expect(s.totalRoutes).toBe(2);
    expect(s.totalBooked).toBe(100);
    expect(s.totalBoarded).toBe(90);
    expect(s.seatsRunning).toBe(119);
    expect(s.totalStops).toBe(37);
  });

  it('counts turnout and seat utilisation as whole percentages', () => {
    const s = summariseRoutes([route({ booked: 50, boarded: 40, capacity: 100 })]);
    expect(s.turnout).toBe(80);
    expect(s.seatUtilisation).toBe(50);
  });

  it('reports turnout as null, not 0, when nothing was booked', () => {
    // "Nothing to measure" must not read as "everybody stayed home".
    const s = summariseRoutes([route({ booked: 0, boarded: 0 })]);
    expect(s.turnout).toBeNull();
  });

  it('reports seat utilisation as null when no bus is assigned anywhere', () => {
    const s = summariseRoutes([route({ capacity: null, vehicleRegistration: null })]);
    expect(s.seatUtilisation).toBeNull();
  });

  it('excludes unassigned buses from the seats being run', () => {
    // Route 07 is active with 50 bookings and no bus: its seats are not
    // capacity we are running, so they must not inflate the denominator.
    const s = summariseRoutes([
      route({ id: 'a', capacity: 59, booked: 40 }),
      route({ id: 'b', capacity: null, vehicleRegistration: null, booked: 50 }),
    ]);
    expect(s.seatsRunning).toBe(59);
    expect(s.routesWithoutBus).toBe(1);
  });

  it('counts routes missing a driver', () => {
    const s = summariseRoutes([route({ hasDriver: false }), route({ id: 'b' })]);
    expect(s.routesWithoutDriver).toBe(1);
  });

  it('counts only routes that actually have bookings as running', () => {
    const s = summariseRoutes([route({ booked: 0, boarded: 0 }), route({ id: 'b', booked: 5 })]);
    expect(s.routesRunning).toBe(1);
  });

  it('allows fleet turnout above 100 when walk-ups exceed bookings', () => {
    const s = summariseRoutes([route({ booked: 46, boarded: 77 })]);
    expect(s.turnout).toBe(167);
  });

  it('handles an empty fleet without dividing by zero', () => {
    const s = summariseRoutes([]);
    expect(s.totalRoutes).toBe(0);
    expect(s.turnout).toBeNull();
    expect(s.seatUtilisation).toBeNull();
  });
});

describe('busiestRoutes', () => {
  it('ranks by bookings descending', () => {
    const rows = busiestRoutes([
      route({ id: 'a', routeNumber: '16', booked: 41 }),
      route({ id: 'b', routeNumber: '31', booked: 66 }),
      route({ id: 'c', routeNumber: '07', booked: 50 }),
    ]);
    expect(rows.map((r) => r.routeNumber)).toEqual(['31', '07', '16']);
  });

  it('drops routes with no bookings rather than charting zero bars', () => {
    const rows = busiestRoutes([route({ booked: 0 }), route({ id: 'b', booked: 5 })]);
    expect(rows).toHaveLength(1);
  });

  it('respects the limit', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      route({ id: `r${i}`, routeNumber: String(i), booked: i + 1 })
    );
    expect(busiestRoutes(many, 5)).toHaveLength(5);
  });
});

describe('biggestNoShows', () => {
  it('ranks by the absolute rider gap, not the percentage', () => {
    // 20 no-shows on a full bus wastes more capacity than 2 on a quiet one,
    // even though the quiet route's percentage is worse.
    const rows = biggestNoShows([
      route({ id: 'big', routeNumber: '31', booked: 60, boarded: 40 }),
      route({ id: 'small', routeNumber: '02', booked: 4, boarded: 2 }),
    ]);
    expect(rows[0].routeNumber).toBe('31');
  });

  it('ignores routes where everyone boarded', () => {
    expect(biggestNoShows([route({ booked: 30, boarded: 30 })])).toEqual([]);
  });

  it('ignores walk-up routes that boarded more than booked', () => {
    expect(biggestNoShows([route({ booked: 46, boarded: 77 })])).toEqual([]);
  });
});
