import { describe, expect, it } from 'vitest';
import {
  countFlagged, decorateRoutes, filterRoutes, loadOf, routeState, sortRoutes, turnoutOf,
} from './route-state';
import type { DashboardRouteRow } from './types';

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

describe('routeState', () => {
  it('flags a route with no bus above everything else', () => {
    // Real case: route 07 POOLAMPATTI is active with 50 bookings and no bus.
    const s = routeState(route({ vehicleRegistration: null, capacity: null, booked: 50, boarded: 0 }));
    expect(s.kind).toBe('no-bus');
  });

  it('flags a booked route where nobody was scanned', () => {
    // Real case: route 23 ELAMPILLAI, 43 booked, 0 boarded.
    const s = routeState(route({ booked: 43, boarded: 0 }));
    expect(s.kind).toBe('none-boarded');
    expect(s.note).toBe('Nobody scanned');
  });

  it('does not cry "nobody scanned" on a route with no bookings', () => {
    expect(routeState(route({ booked: 0, boarded: 0 })).kind).toBe('quiet');
  });

  it('reports walk-ups when more boarded than booked', () => {
    // Real case: route 40 EADAPPADI, 46 booked, 77 boarded.
    const s = routeState(route({ booked: 46, boarded: 77 }));
    expect(s.kind).toBe('walk-ups');
    expect(s.note).toBe('31 unbooked riders');
  });

  it('singularises a single walk-up', () => {
    expect(routeState(route({ booked: 10, boarded: 11 })).note).toBe('1 unbooked rider');
  });

  it('flags a missing driver', () => {
    expect(routeState(route({ hasDriver: false })).kind).toBe('no-driver');
  });

  it('leaves a healthy route unflagged with no note', () => {
    const s = routeState(route());
    expect(s.kind).toBe('ok');
    expect(s.note).toBe('');
  });

  it('prefers the no-bus reason over the missing driver on the same route', () => {
    const s = routeState(route({ vehicleRegistration: null, hasDriver: false }));
    expect(s.kind).toBe('no-bus');
  });
});

describe('sortRoutes', () => {
  const rows = decorateRoutes([
    route({ id: 'ok', routeNumber: '16', booked: 41, boarded: 37 }),
    route({ id: 'quiet', routeNumber: '02', booked: 0, boarded: 0 }),
    route({ id: 'nobus', routeNumber: '07', vehicleRegistration: null, capacity: null, booked: 50, boarded: 0 }),
    route({ id: 'nonboarded', routeNumber: '23', booked: 43, boarded: 0 }),
  ]);

  it('puts problems first and ranks a quiet route last', () => {
    expect(sortRoutes(rows, 'attention').map((x) => x.route.id)).toEqual([
      'nobus', 'nonboarded', 'ok', 'quiet',
    ]);
  });

  it('sorts by bookings descending when asked for busiest', () => {
    expect(sortRoutes(rows, 'busiest').map((x) => x.route.booked)).toEqual([50, 43, 41, 0]);
  });

  it('sorts route numbers numerically, not as text', () => {
    // Plain string sort would put '16' before '2'.
    expect(sortRoutes(rows, 'number').map((x) => x.route.routeNumber)).toEqual([
      '02', '07', '16', '23',
    ]);
  });

  it('does not mutate the input array', () => {
    const before = rows.map((x) => x.route.id);
    sortRoutes(rows, 'busiest');
    expect(rows.map((x) => x.route.id)).toEqual(before);
  });
});

describe('countFlagged', () => {
  it('counts only real problems, not quiet or healthy routes', () => {
    const rows = decorateRoutes([
      route({ booked: 0, boarded: 0 }),
      route(),
      route({ vehicleRegistration: null }),
      route({ booked: 43, boarded: 0 }),
    ]);
    expect(countFlagged(rows)).toBe(2);
  });
});

describe('turnoutOf', () => {
  it('is boarded over booked', () => {
    expect(turnoutOf(route({ booked: 66, boarded: 47 }))).toBe(71);
  });

  it('exceeds 100 for walk-ups rather than clamping', () => {
    expect(turnoutOf(route({ booked: 46, boarded: 77 }))).toBe(167);
  });

  it('is null with no bookings to divide by', () => {
    expect(turnoutOf(route({ booked: 0, boarded: 0 }))).toBeNull();
  });
});

describe('loadOf', () => {
  it('is booked over seats', () => {
    expect(loadOf(route({ booked: 40, capacity: 59 }))).toBe(68);
  });

  it('is null when no bus is assigned, since there is no denominator', () => {
    expect(loadOf(route({ capacity: null }))).toBeNull();
  });
});

describe('filterRoutes', () => {
  const rows = decorateRoutes([
    route({ id: 'a', routeNumber: '05', routeName: 'METTUR', routeCode: 'METTUR NO 5', driverName: 'GUNASEGARAN V', vehicleRegistration: 'TN59BX7286' }),
    route({ id: 'b', routeNumber: '23', routeName: 'ELAMPILLAI', routeCode: 'ELAMPILLAI NO 23', driverName: 'RAVI R', vehicleRegistration: 'TN33AL0237', booked: 43, boarded: 0 }),
    route({ id: 'c', routeNumber: '07', routeName: 'POOLAMPATTI', vehicleRegistration: null, capacity: null }),
  ]);

  it('returns everything when nothing is asked for', () => {
    expect(filterRoutes(rows)).toHaveLength(3);
  });

  it('matches on route number', () => {
    expect(filterRoutes(rows, { query: '23' }).map((x) => x.route.id)).toEqual(['b']);
  });

  it('matches on destination, case-insensitively', () => {
    expect(filterRoutes(rows, { query: 'mettur' }).map((x) => x.route.id)).toEqual(['a']);
  });

  it('matches on driver name', () => {
    expect(filterRoutes(rows, { query: 'ravi' }).map((x) => x.route.id)).toEqual(['b']);
  });

  it('matches on bus registration', () => {
    expect(filterRoutes(rows, { query: 'tn59' }).map((x) => x.route.id)).toEqual(['a']);
  });

  it('ignores surrounding whitespace', () => {
    expect(filterRoutes(rows, { query: '  mettur  ' }).map((x) => x.route.id)).toEqual(['a']);
  });

  it('keeps only flagged routes when issuesOnly is set', () => {
    expect(filterRoutes(rows, { issuesOnly: true }).map((x) => x.route.id).sort()).toEqual(['b', 'c']);
  });

  it('combines the query with issuesOnly', () => {
    expect(filterRoutes(rows, { query: 'poolampatti', issuesOnly: true }).map((x) => x.route.id)).toEqual(['c']);
  });

  it('returns nothing when the query matches no route', () => {
    expect(filterRoutes(rows, { query: 'chennai' })).toEqual([]);
  });
});
