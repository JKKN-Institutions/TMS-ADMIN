/**
 * Route-level tests for the daily pre-trip check (review on TMS-ADMIN #27):
 *   - POST /api/driver/trips refuses the first trip of the day without a check (428)
 *   - POST /api/driver/pre-trip-check: duplicate same-day check, transport-head alert
 *   - the migration gives clients no write path (no storage.objects policy, no insert
 *     policy, anon revoked)
 * Supabase is a fake that records calls; no network, no database.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const AUTH = {
  userId: 'user-1',
  email: 'driver@x.in',
  userRole: 'driver',
  isSuperAdmin: true, // skips the permission RPC; permissions are not under test here
  institutionId: null,
  supabase: {} as never,
};

vi.mock('@/lib/api/with-auth', () => ({
  withAuth: (h: (req: unknown, auth: unknown) => unknown) => (req: unknown) => h(req, AUTH),
}));
vi.mock('@/lib/driver/identity', () => ({
  getDriverForUser: vi.fn(async () => ({ id: 'drv-1', staff_id: 'staff-1', assigned_route_id: null })),
}));
vi.mock('@/lib/driver/routes', () => ({
  getDriverRoutes: vi.fn(async () => [
    { id: 'route-1', label: '36 · ERODE', vehicleId: 'veh-1', arrivalTime: '09:00:00' },
  ]),
}));
vi.mock('@/lib/tracking/settings', () => ({ loadTrackingSettings: vi.fn(async () => ({})) }));
vi.mock('@/lib/tracking/trips', () => ({
  TRIP_SELECT: 'id',
  expireStaleTrips: vi.fn(async () => 0),
  getActiveTripForDriver: vi.fn(async () => null),
}));
vi.mock('@/lib/activity/log', () => ({ logActivity: vi.fn(async () => undefined) }));
const dispatchNotification = vi.fn(async (..._args: unknown[]) => ({ id: 'n-1', recipientCount: 2 }));
vi.mock('@/lib/notifications/dispatch', () => ({
  dispatchNotification: (...args: unknown[]) => dispatchNotification(...args),
}));

// ── Fake service-role client ────────────────────────────────────────────────
type Result = { data: unknown; error: { code?: string; message?: string } | null };
interface FakeConfig {
  /** lookupTodayCheck → maybeSingle on tms_pre_trip_check */
  checkLookup: Result;
  /** insert into tms_pre_trip_check → single */
  checkInsert: Result;
}
let cfg: FakeConfig;
const calls: { table: string; op: string; arg?: unknown }[] = [];
const upload = vi.fn(async (..._a: unknown[]) => ({ error: null }));
const remove = vi.fn(async (..._a: unknown[]) => ({ error: null }));

const ok = (data: unknown): Result => ({ data, error: null });

function builder(table: string) {
  let op = 'select';
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'is', 'order', 'limit']) b[m] = () => b;
  b.insert = (row: unknown) => {
    op = 'insert';
    calls.push({ table, op, arg: row });
    return b;
  };
  b.update = (row: unknown) => {
    op = 'update';
    calls.push({ table, op, arg: row });
    return b;
  };
  b.maybeSingle = async (): Promise<Result> => {
    if (table === 'tms_pre_trip_check') return cfg.checkLookup;
    if (table === 'custom_roles') return ok({ id: 'role-th' });
    if (table === 'tms_vehicle') return ok({ registration_number: 'TN28 AB 1234' });
    if (table === 'staff') return ok({ first_name: 'Ravi', last_name: 'K' });
    return ok(null);
  };
  b.single = async (): Promise<Result> => {
    if (table === 'tms_pre_trip_check' && op === 'insert') return cfg.checkInsert;
    if (table === 'tms_trip' && op === 'insert') return ok({ id: 'trip-1', route_id: 'route-1' });
    return ok(null);
  };
  b.then = (resolve: (v: Result) => unknown) => {
    if (table === 'user_roles') return resolve(ok([{ user_id: 'p-head-1' }]));
    if (table === 'profiles') return resolve(ok([{ id: 'p-head-2' }]));
    return resolve(ok([]));
  };
  return b;
}

const svc = {
  from: (table: string) => builder(table),
  storage: { from: () => ({ upload, remove }) },
  rpc: vi.fn(async () => ok(null)),
};
vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => svc }));

import { NextRequest } from 'next/server';
import { POST as startTripPOST } from '@/app/api/driver/trips/route';
import { POST as checkPOST } from '@/app/api/driver/pre-trip-check/route';

const CHECK_ROW = {
  id: 'chk-1',
  driver_id: 'drv-1',
  vehicle_id: 'veh-1',
  tyres_ok: true,
  brakes_ok: true,
  lights_ok: true,
  horn_ok: true,
  fuel_level_ok: true,
  first_aid_box_ok: true,
  any_issue: false,
  notes: null,
};

function startTripRequest() {
  return new NextRequest('http://localhost/api/driver/trips', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ routeId: 'route-1' }),
  });
}

function checkRequest(answers: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set('routeId', 'route-1');
  for (const k of ['tyres_ok', 'brakes_ok', 'lights_ok', 'horn_ok', 'fuel_level_ok', 'first_aid_box_ok']) {
    fd.set(k, answers[k] ?? 'yes');
  }
  fd.set('odometer_km', '124530');
  fd.set('photo', new File([new Uint8Array([0xff, 0xd8, 0xff])], 'odo.jpg', { type: 'image/jpeg' }));
  return new NextRequest('http://localhost/api/driver/pre-trip-check', { method: 'POST', body: fd });
}

const inserts = (table: string) => calls.filter((c) => c.table === table && c.op === 'insert');

beforeEach(() => {
  calls.length = 0;
  upload.mockClear();
  remove.mockClear();
  dispatchNotification.mockClear();
  cfg = { checkLookup: ok(null), checkInsert: ok(CHECK_ROW) };
});

describe('POST /api/driver/trips — check before start', () => {
  it('refuses the first trip of the day with 428 when there is no check, and starts nothing', async () => {
    cfg.checkLookup = ok(null);
    const res = await startTripPOST(startTripRequest());
    expect(res.status).toBe(428);
    const body = await res.json();
    expect(body.code).toBe('pre_trip_check_required');
    expect(body.data).toEqual({ routeId: 'route-1', vehicleId: 'veh-1' });
    expect(inserts('tms_trip')).toHaveLength(0);
  });

  it('starts the trip when today\'s check exists and links the check to the trip', async () => {
    cfg.checkLookup = ok({ id: 'chk-1' });
    const res = await startTripPOST(startTripRequest());
    expect(res.status).toBe(201);
    expect(inserts('tms_trip')).toHaveLength(1);
    const link = calls.find((c) => c.table === 'tms_pre_trip_check' && c.op === 'update');
    expect(link?.arg).toEqual({ trip_id: 'trip-1' });
  });

  it('still starts trips when the check table is not deployed yet', async () => {
    cfg.checkLookup = { data: null, error: { code: 'PGRST205', message: 'not found' } };
    const res = await startTripPOST(startTripRequest());
    expect(res.status).toBe(201);
  });

  it('returns 500, not a free pass, on any other lookup error', async () => {
    cfg.checkLookup = { data: null, error: { code: '57014', message: 'timeout' } };
    const res = await startTripPOST(startTripRequest());
    expect(res.status).toBe(500);
    expect(inserts('tms_trip')).toHaveLength(0);
  });
});

describe('POST /api/driver/pre-trip-check', () => {
  it('saves an all-OK check with the server-resolved bus and sends no alert', async () => {
    const res = await checkPOST(checkRequest());
    expect(res.status).toBe(201);
    const row = inserts('tms_pre_trip_check')[0]?.arg as Record<string, unknown>;
    expect(row.vehicle_id).toBe('veh-1');
    expect(row.created_by).toBe('user-1');
    expect(String(row.odometer_photo_path)).toMatch(/^user-1\/\d{4}-\d{2}-\d{2}\/.+\.jpg$/);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(dispatchNotification).not.toHaveBeenCalled();
  });

  it('a second check the same day returns the saved one and removes the orphan photo', async () => {
    cfg.checkInsert = { data: null, error: { code: '23505', message: 'duplicate key' } };
    cfg.checkLookup = ok(CHECK_ROW);
    const res = await checkPOST(checkRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.alreadyDone).toBe(true);
    expect(body.data.check.id).toBe('chk-1');
    const uploadedPath = upload.mock.calls[0]?.[0];
    expect(remove).toHaveBeenCalledWith([uploadedPath]);
    expect(dispatchNotification).not.toHaveBeenCalled();
  });

  it('a NOT OK alerts every transport_head holder (user_roles + legacy profiles.role)', async () => {
    cfg.checkInsert = ok({ ...CHECK_ROW, brakes_ok: false, horn_ok: false, any_issue: true });
    const res = await checkPOST(checkRequest({ brakes_ok: 'no', horn_ok: 'no' }));
    expect(res.status).toBe(201);
    expect((await res.json()).data.alerted).toBe(2);

    expect(dispatchNotification).toHaveBeenCalledTimes(1);
    const input = dispatchNotification.mock.calls[0][1] as Record<string, any>;
    expect(input.targeting).toEqual({ type: 'users', user_ids: ['p-head-1', 'p-head-2'] });
    expect(input.category).toBe('alert');
    expect(input.priority).toBe('high');
    expect(input.idempotencyKey).toBe('pre_trip_check:chk-1');
    expect(input.body).toContain('Brakes, Horn');
    expect(input.title).toContain('TN28 AB 1234');
  });

  it('rejects a check without a photo before touching storage or the table', async () => {
    const fd = await checkRequest().formData();
    fd.delete('photo');
    const res = await checkPOST(new NextRequest('http://localhost/api/driver/pre-trip-check', { method: 'POST', body: fd }));
    expect(res.status).toBe(400);
    expect(upload).not.toHaveBeenCalled();
    expect(inserts('tms_pre_trip_check')).toHaveLength(0);
  });
});

describe('migration: clients have no write path', () => {
  const sql = readFileSync(
    fileURLToPath(new URL('../../supabase/migrations/20261107220000_tms_pre_trip_check.sql', import.meta.url)),
    'utf8'
  )
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
    .toLowerCase();

  it('creates no storage.objects policy for the photo bucket', () => {
    expect(sql).not.toMatch(/create\s+policy[^;]*on\s+storage\.objects/);
    expect(sql).toContain("'tms-pre-trip-photos'");
  });

  it('gives the table read policies only — no insert, update or delete', () => {
    const policies = [...sql.matchAll(/create\s+policy\s+\w+\s+on\s+public\.tms_pre_trip_check\s+for\s+(\w+)/g)].map((m) => m[1]);
    expect(policies.length).toBeGreaterThan(0);
    expect(new Set(policies)).toEqual(new Set(['select']));
  });

  it('revokes everything from anon', () => {
    expect(sql).toMatch(/revoke\s+all\s+on\s+public\.tms_pre_trip_check\s+from\s+anon/);
  });
});
