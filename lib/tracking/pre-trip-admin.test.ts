import { describe, it, expect } from 'vitest';
import { checkBadge, filterChecks, parseCheckDate, toAdminRow, type AdminCheckRow } from './pre-trip-admin';

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
