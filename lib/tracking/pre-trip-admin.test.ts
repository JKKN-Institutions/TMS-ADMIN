import { describe, it, expect } from 'vitest';
import {
  buildDayRows, checkBadge, checkStatus, dayTotals, filterChecks, parseCheckDate, resolveCheckRoute, toAdminRow,
  type AdminCheckRow, type DayRoute,
} from './pre-trip-admin';

const ALL_OK = { tyres_ok: true, brakes_ok: true, lights_ok: true, horn_ok: true, fuel_level_ok: true, first_aid_box_ok: true };
const BASE = {
  id: 'c1',
  check_date: '2026-11-08',
  created_at: '2026-11-08T01:30:00Z',
  driver_id: 'd1',
  vehicle_id: 'v1',
  trip_id: null,
  skipped: false,
  skip_reason: null,
  odometer_km: '124530.5',
  odometer_photo_path: 'u/2026-11-08/x.jpg',
  any_issue: false,
  notes: null,
};
const names = { driverName: 'Ravi K', busRegistration: 'TN28 AB 1234' };

describe('parseCheckDate', () => {
  it('keeps a real date and falls back to today otherwise', () => {
    expect(parseCheckDate('2026-11-07', '2026-11-08')).toBe('2026-11-07');
    expect(parseCheckDate(null, '2026-11-08')).toBe('2026-11-08');
    expect(parseCheckDate('2026-02-30', '2026-11-08')).toBe('2026-11-08');
    expect(parseCheckDate("2026-11-07'; drop", '2026-11-08')).toBe('2026-11-08');
  });
});

describe('toAdminRow', () => {
  it('shapes a row and never exposes the photo path', () => {
    const r = toAdminRow({ ...BASE, ...ALL_OK }, names);
    expect(r.odometerKm).toBe(124530.5);
    expect(r.hasPhoto).toBe(true);
    expect(JSON.stringify(r)).not.toContain('x.jpg');
    expect(r.driverName).toBe('Ravi K');
  });

  it('a skip has empty items, no km and no photo', () => {
    const r = toAdminRow({ ...BASE, skipped: true, skip_reason: 'No network', odometer_km: null, odometer_photo_path: null, any_issue: true }, names);
    expect(r.items.tyres_ok).toBeNull();
    expect(r.odometerKm).toBeNull();
    expect(r.hasPhoto).toBe(false);
  });
});

describe('checkBadge', () => {
  it('says "skipped: <reason>" for a skip', () => {
    const r = toAdminRow({ ...BASE, skipped: true, skip_reason: 'Emergency trip', odometer_photo_path: null, any_issue: true }, names);
    expect(checkBadge(r)).toEqual({ kind: 'skipped', label: 'skipped: Emergency trip' });
  });

  it('names the NOT OK items for an issue', () => {
    const r = toAdminRow({ ...BASE, ...ALL_OK, brakes_ok: false, horn_ok: false, any_issue: true }, names);
    expect(checkBadge(r)).toEqual({ kind: 'issue', label: 'issue: Brakes, Horn' });
  });

  it('is "all OK" otherwise', () => {
    expect(checkBadge(toAdminRow({ ...BASE, ...ALL_OK }, names)).kind).toBe('ok');
  });
});

describe('filterChecks (issues and skips only)', () => {
  const rows = [
    toAdminRow({ ...BASE, id: 'ok', ...ALL_OK }, names),
    toAdminRow({ ...BASE, id: 'bad', ...ALL_OK, lights_ok: false, any_issue: true }, names),
    toAdminRow({ ...BASE, id: 'skip', skipped: true, skip_reason: 'No network', any_issue: true }, names),
  ] as AdminCheckRow[];

  it('keeps issues and skips when on, everything when off', () => {
    expect(filterChecks(rows, true).map((r) => r.id)).toEqual(['bad', 'skip']);
    expect(filterChecks(rows, false)).toHaveLength(3);
  });
});

const route = (id: string, n: string, vehicleId: string | null, driverStaffId: string | null = null): DayRoute => ({
  id, routeNumber: n, routeName: `R${n}`, vehicleId, driverStaffId,
});

describe('resolveCheckRoute', () => {
  const routes = [route('r18', '18', 'v1', 's1'), route('r31', '31', 'v2'), route('r40', '40', 'v1', 's9')];
  const trips = new Map([['t1', 'r31']]);

  it('uses the route of the linked trip first, even on another bus', () => {
    expect(resolveCheckRoute({ tripId: 't1', vehicleId: 'v1' }, trips, routes)?.id).toBe('r31');
  });

  it('falls back to the route the bus is on', () => {
    expect(resolveCheckRoute({ tripId: null, vehicleId: 'v2' }, trips, routes)?.id).toBe('r31');
    expect(resolveCheckRoute({ tripId: 'gone', vehicleId: 'v2' }, trips, routes)?.id).toBe('r31');
  });

  it('when two routes share the bus, the driver decides, then the lowest number', () => {
    expect(resolveCheckRoute({ tripId: null, vehicleId: 'v1', driverStaffId: 's9' }, trips, routes)?.id).toBe('r40');
    expect(resolveCheckRoute({ tripId: null, vehicleId: 'v1' }, trips, routes)?.id).toBe('r18');
  });

  it('is null when the bus has no route', () => {
    expect(resolveCheckRoute({ tripId: null, vehicleId: 'v404' }, trips, routes)).toBeNull();
  });
});

describe('buildDayRows / dayTotals', () => {
  const okCheck = toAdminRow({ ...BASE, ...ALL_OK }, names);
  const issue = toAdminRow({ ...BASE, id: 'c2', vehicle_id: 'v2', ...ALL_OK, brakes_ok: false, any_issue: true }, names);
  const skip = toAdminRow(
    { ...BASE, id: 'c3', vehicle_id: 'v3', skipped: true, skip_reason: 'No network', odometer_km: null, odometer_photo_path: null, any_issue: true },
    names
  );
  const r2 = route('r2', '2', 'v2');
  const r10 = route('r10', '10', 'v1');
  const r7 = route('r7', '7', 'v7');
  const expected = [r2, r10, r7].map((r) => ({ route: r, busRegistration: 'TN 1', driverName: 'Mani' }));

  it('names the status of a check', () => {
    expect([checkStatus(okCheck), checkStatus(issue), checkStatus(skip)]).toEqual(['ok', 'issue', 'skipped']);
  });

  it('adds a Not done line only for buses with no check, sorted by route number', () => {
    const rows = buildDayRows([{ check: okCheck, route: r10 }, { check: issue, route: r2 }], expected);
    expect(rows.map((r) => [r.routeNumber, r.status])).toEqual([['2', 'issue'], ['7', 'not_done'], ['10', 'ok']]);
    expect(rows[1]).toMatchObject({ key: 'route:r7', check: null, driverName: 'Mani' });
  });

  it('a check whose route is unknown still counts its bus as checked, and sorts last', () => {
    const rows = buildDayRows([{ check: okCheck, route: null }, { check: skip, route: null }], expected);
    // okCheck is on v1 (route 10's bus): no Not done line for route 10.
    expect(rows.map((r) => [r.routeNumber, r.status])).toEqual([
      ['2', 'not_done'], ['7', 'not_done'], [null, 'ok'], [null, 'skipped'],
    ]);
  });

  it('totals add up', () => {
    const rows = buildDayRows([{ check: okCheck, route: r10 }, { check: issue, route: r2 }], expected);
    expect(dayTotals(rows)).toEqual({ buses: 3, checked: 2, ok: 1, issue: 1, skipped: 0, notDone: 1 });
    expect(dayTotals([])).toEqual({ buses: 0, checked: 0, ok: 0, issue: 0, skipped: 0, notDone: 0 });
  });
});
