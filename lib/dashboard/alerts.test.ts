import { describe, expect, it } from 'vitest';
import { buildAlerts, isAllClear, type AlertInputs } from './alerts';

const clean: AlertInputs = {
  overdueBills: 0,
  staleGrievances: 0,
  openGrievances: 0,
  ridersWithoutStop: 0,
  expiredVehicleDocs: 0,
  routesWithoutDriver: 0,
  routesWithoutBus: 0,
  routesNobodyScanned: 0,
};

describe('buildAlerts', () => {
  it('emits nothing when every check is clean', () => {
    expect(buildAlerts(clean)).toEqual([]);
  });

  it('reports an unmeasured check as unknown rather than as a zero', () => {
    // The old behaviour dropped the check entirely, which made a failed query
    // indistinguishable from a passing one.
    const alerts = buildAlerts({ ...clean, overdueBills: null });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].id).toBe('checks-unmeasured');
    expect(alerts[0].severity).toBe('unknown');
    expect(alerts[0].items).toEqual(['Overdue bills']);
  });

  it('names every check that could not run in one grey row', () => {
    const alerts = buildAlerts({ ...clean, overdueBills: null, routesNobodyScanned: null });
    const [a] = alerts;
    expect(a.count).toBe(2);
    expect(a.label).toBe('2 checks could not run');
    expect(a.items).toEqual(['Overdue bills', 'Boarding scans today']);
  });

  it('sorts the unmeasured row last, below real problems', () => {
    const alerts = buildAlerts({ ...clean, overdueBills: null, expiredVehicleDocs: 9 });
    expect(alerts.map((a) => a.id)).toEqual(['expired-docs', 'checks-unmeasured']);
  });

  it('leaves the unmeasured row without a destination', () => {
    // There is no page that fixes "the query failed", so the row must not
    // pretend to link anywhere.
    const [a] = buildAlerts({ ...clean, overdueBills: null });
    expect(a.href).toBeUndefined();
  });

  it('orders critical before warning before info', () => {
    const alerts = buildAlerts({
      ...clean,
      openGrievances: 12,
      staleGrievances: 11,
      overdueBills: 1119,
    });
    expect(alerts.map((a) => a.id)).toEqual([
      'overdue-bills',
      'stale-grievances',
      'open-grievances',
    ]);
  });

  it('orders by count descending within the same severity', () => {
    const alerts = buildAlerts({ ...clean, staleGrievances: 3, ridersWithoutStop: 67 });
    expect(alerts.map((a) => a.id)).toEqual(['riders-no-stop', 'stale-grievances']);
  });

  it('singularises a count of one', () => {
    const [a] = buildAlerts({ ...clean, overdueBills: 1 });
    expect(a.label).toBe('1 overdue transport bill');
  });

  it('pluralises counts above one', () => {
    const [a] = buildAlerts({ ...clean, overdueBills: 1119 });
    expect(a.label).toBe('1119 overdue transport bills');
  });

  it('splits the count off the subject so the row can lead with it', () => {
    // The row renders the count as its own bold identifier, the way a tracking
    // row leads with the route number, so the subject must not repeat it.
    const [a] = buildAlerts({ ...clean, overdueBills: 1119 });
    expect(a.subject).toBe('overdue transport bills');
    expect(a.label).toBe(`${a.count} ${a.subject}`);
  });

  it('gives every alert a state chip and a plain-English reason', () => {
    const alerts = buildAlerts({
      overdueBills: 1,
      staleGrievances: 1,
      openGrievances: 1,
      ridersWithoutStop: 1,
      expiredVehicleDocs: 1,
      routesWithoutDriver: 1,
      routesWithoutBus: 1,
      routesNobodyScanned: 1,
    });
    expect(alerts).toHaveLength(8);
    expect(alerts.every((a) => a.state.length > 0)).toBe(true);
    expect(alerts.every((a) => a.reason.endsWith('.'))).toBe(true);
  });

  it('gives every alert a destination to act on', () => {
    const alerts = buildAlerts({
      overdueBills: 1,
      staleGrievances: 1,
      openGrievances: 1,
      ridersWithoutStop: 1,
      expiredVehicleDocs: 1,
      routesWithoutDriver: 1,
      routesWithoutBus: 1,
      routesNobodyScanned: 1,
    });
    expect(alerts.every((a) => a.href?.startsWith('/'))).toBe(true);
  });

  it('names the affected routes when nobody scanned them', () => {
    // Real case 2026-09-03: routes 10, 23 and 37 had bookings and no scans.
    const [a] = buildAlerts({
      ...clean,
      routesNobodyScanned: 3,
      routesNobodyScannedNumbers: ['10', '23', '37'],
    });
    expect(a.label).toBe('3 routes booked but nobody scanned');
    expect(a.items).toEqual(['10', '23', '37']);
    expect(a.itemsLabel).toBe('Routes');
  });

  it('names the routes missing a bus and the routes missing a driver', () => {
    const alerts = buildAlerts({
      ...clean,
      routesWithoutBus: 2,
      routesWithoutBusNumbers: ['12', '31'],
      routesWithoutDriver: 1,
      routesWithoutDriverNumbers: ['40'],
    });
    expect(alerts.find((a) => a.id === 'routes-no-bus')?.items).toEqual(['12', '31']);
    expect(alerts.find((a) => a.id === 'routes-no-driver')?.items).toEqual(['40']);
  });

  it('names the buses whose documents expired', () => {
    const [a] = buildAlerts({
      ...clean,
      expiredVehicleDocs: 2,
      expiredVehicleDocsRegistrations: ['TN 34 AB 1234', 'TN 34 CD 5678'],
    });
    expect(a.items).toEqual(['TN 34 AB 1234', 'TN 34 CD 5678']);
    expect(a.itemsLabel).toBe('Buses');
  });

  it('omits an empty item list rather than rendering an empty section', () => {
    const [a] = buildAlerts({ ...clean, routesWithoutBus: 2, routesWithoutBusNumbers: [] });
    expect(a.items).toBeUndefined();
  });

  it('carries a recommended action on actionable alerts', () => {
    const [a] = buildAlerts({ ...clean, overdueBills: 1119 });
    expect(a.action).toBe('Send a payment reminder');
  });

  it('pluralises bus correctly rather than emitting "buss"', () => {
    const [a] = buildAlerts({ ...clean, expiredVehicleDocs: 9 });
    expect(a.label).toBe('9 buses with an expired document');
  });
});

describe('isAllClear', () => {
  it('is true only when every check ran and passed', () => {
    expect(isAllClear(clean)).toBe(true);
  });

  it('is false when a check could not be measured', () => {
    // "we do not know" must never render as a green all-clear.
    expect(isAllClear({ ...clean, overdueBills: null })).toBe(false);
  });

  it('is false when any check is dirty', () => {
    expect(isAllClear({ ...clean, overdueBills: 1 })).toBe(false);
  });
});
