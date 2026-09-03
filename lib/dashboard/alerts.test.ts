import { describe, expect, it } from 'vitest';
import { buildAlerts, isAllClear, type AlertInputs } from './alerts';

const clean: AlertInputs = {
  overdueBills: 0,
  staleGrievances: 0,
  openGrievances: 0,
  ridersWithoutStop: 0,
  expiredVehicleDocs: 0,
  routesWithoutDriver: 0,
};

describe('buildAlerts', () => {
  it('emits nothing when every check is clean', () => {
    expect(buildAlerts(clean)).toEqual([]);
  });

  it('drops unmeasured (null) checks instead of reporting them as zero', () => {
    const alerts = buildAlerts({ ...clean, overdueBills: null });
    expect(alerts).toEqual([]);
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

  it('gives every alert a destination to act on', () => {
    const alerts = buildAlerts({
      overdueBills: 1,
      staleGrievances: 1,
      openGrievances: 1,
      ridersWithoutStop: 1,
      expiredVehicleDocs: 1,
      routesWithoutDriver: 1,
    });
    expect(alerts).toHaveLength(6);
    expect(alerts.every((a) => a.href.startsWith('/'))).toBe(true);
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
