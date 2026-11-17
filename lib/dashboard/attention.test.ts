import { describe, it, expect } from 'vitest';
import { toAlertInputs, type AttentionCounts } from './attention';
import type { DashboardRouteRow } from './types';

const counts: AttentionCounts = {
  overdueBills: 172,
  staleGrievances: 14,
  openGrievances: 14,
  ridersWithoutStop: 9,
  expiredDocs: { count: 2, registrations: ['TN 33 A 1', 'TN 33 B 2'] },
  nobodyScanned: { count: 1, numbers: ['12'] },
  degraded: [],
};

const row = (n: string, reg: string | null, hasDriver: boolean) =>
  ({ routeNumber: n, vehicleRegistration: reg, hasDriver }) as DashboardRouteRow;

describe('toAlertInputs', () => {
  it('derives the route checks from the board', () => {
    const i = toAlertInputs(counts, {
      routes: [row('4', null, true), row('9', 'TN1', false)],
      degraded: [],
    });
    expect(i.routesWithoutBus).toBe(1);
    expect(i.routesWithoutBusNumbers).toEqual(['4']);
    expect(i.routesWithoutDriver).toBe(1);
    expect(i.routesWithoutDriverNumbers).toEqual(['9']);
    expect(i.expiredVehicleDocs).toBe(2);
    expect(i.expiredVehicleDocsRegistrations).toEqual(['TN 33 A 1', 'TN 33 B 2']);
    expect(i.routesNobodyScanned).toBe(1);
    expect(i.routesNobodyScannedNumbers).toEqual(['12']);
    expect(i.overdueBills).toBe(172);
    expect(i.ridersWithoutStop).toBe(9);
  });

  it.each(['routes', 'board'])(
    'leaves route checks unmeasured when the board failed (%s)',
    (key) => {
      const i = toAlertInputs(counts, { routes: [], degraded: [key] });
      expect(i.routesWithoutBus).toBeNull();
      expect(i.routesWithoutDriver).toBeNull();
    }
  );

  it('still measures the route checks when only a side lookup degraded', () => {
    const i = toAlertInputs(counts, { routes: [row('4', 'TN1', true)], degraded: ['trips'] });
    expect(i.routesWithoutBus).toBe(0);
    expect(i.routesWithoutDriver).toBe(0);
  });

  it('keeps a failed count null', () => {
    const i = toAlertInputs(
      { ...counts, expiredDocs: null, nobodyScanned: null, overdueBills: null },
      { routes: [], degraded: [] }
    );
    expect(i.expiredVehicleDocs).toBeNull();
    expect(i.routesNobodyScanned).toBeNull();
    expect(i.overdueBills).toBeNull();
  });
});
