/**
 * GET /api/admin/pre-trip-checks and /api/admin/pre-trip-checks/<id>/photo.
 * Supabase is a fake; no network, no database.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const AUTH = { userId: 'head-1', email: null, userRole: 'transport_head', isSuperAdmin: false, institutionId: null, supabase: {} as never };
vi.mock('@/lib/api/with-auth', () => ({
  withAuth: (h: (req: unknown, auth: unknown) => unknown) => (req: unknown) => h(req, AUTH),
}));
let allowed = true;
const requirePerm = vi.fn(async (..._a: unknown[]) => allowed);
vi.mock('@/lib/auth/require-perm', () => ({ requirePerm: (...a: unknown[]) => requirePerm(...a) }));

type Result = { data: unknown; error: unknown };
const ok = (data: unknown): Result => ({ data, error: null });
const ALL_OK = { tyres_ok: true, brakes_ok: true, lights_ok: true, horn_ok: true, fuel_level_ok: true, first_aid_box_ok: true };
const NONE = { tyres_ok: null, brakes_ok: null, lights_ok: null, horn_ok: null, fuel_level_ok: null, first_aid_box_ok: null };
const ROWS = [
  { id: 'c-ok', check_date: '2026-11-08', created_at: '2026-11-08T01:00:00Z', driver_id: 'd1', vehicle_id: 'v1', trip_id: null, skipped: false, skip_reason: null, ...ALL_OK, odometer_km: 100, odometer_photo_path: 'h/2026-11-08/a.jpg', any_issue: false, notes: null },
  { id: 'c-skip', check_date: '2026-11-08', created_at: '2026-11-08T02:00:00Z', driver_id: 'd2', vehicle_id: 'v2', trip_id: 't1', skipped: true, skip_reason: 'No network', ...NONE, odometer_km: null, odometer_photo_path: null, any_issue: true, notes: null },
];
const eqCalls: [string, string, unknown][] = [];
const createSignedUrl = vi.fn(async (..._a: unknown[]) => ({ data: { signedUrl: 'https://signed.example/x?token=t' }, error: null }));

function builder(table: string) {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'order', 'in']) b[m] = () => b;
  b.eq = (col: string, val: unknown) => {
    eqCalls.push([table, col, val]);
    return b;
  };
  b.maybeSingle = async () => {
    const idEq = eqCalls.filter((c) => c[0] === table && c[1] === 'id').pop();
    return ok(ROWS.find((r) => r.id === idEq?.[2]) ?? null);
  };
  b.then = (resolve: (v: Result) => unknown) => {
    if (table === 'tms_pre_trip_check') return resolve(ok(ROWS));
    if (table === 'tms_driver') return resolve(ok([{ id: 'd1', staff_id: 's1' }, { id: 'd2', staff_id: 's2' }]));
    if (table === 'staff') return resolve(ok([{ id: 's1', first_name: 'Ravi', last_name: 'K' }, { id: 's2', first_name: 'Mani', last_name: null }]));
    if (table === 'tms_vehicle') return resolve(ok([{ id: 'v1', registration_number: 'TN28 AB 1' }, { id: 'v2', registration_number: 'TN28 AB 2' }, { id: 'v9', registration_number: 'TN28 AB 9' }]));
    // r18 is on the first check's bus; r31 is reached only through trip t1; r5 has no check.
    if (table === 'tms_route') return resolve(ok([
      { id: 'r18', route_number: '18', route_name: 'SOLAR', vehicle_id: 'v1', driver_id: 's1' },
      { id: 'r31', route_number: '31', route_name: 'T GODU', vehicle_id: 'v7', driver_id: null },
      { id: 'r5', route_number: '5', route_name: 'ERODE', vehicle_id: 'v9', driver_id: 's2' },
    ]));
    if (table === 'tms_trip') return resolve(ok([{ id: 't1', route_id: 'r31' }]));
    return resolve(ok([]));
  };
  return b;
}
const svc = { from: (t: string) => builder(t), storage: { from: () => ({ createSignedUrl }) } };
vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => svc }));

import { NextRequest } from 'next/server';
import { GET as listGET } from '@/app/api/admin/pre-trip-checks/route';
import { GET as photoGET } from '@/app/api/admin/pre-trip-checks/[id]/photo/route';

const UUID = '11111111-2222-3333-4444-555555555555';
const req = (path: string) => new NextRequest(`http://localhost${path}`);

beforeEach(() => {
  allowed = true;
  eqCalls.length = 0;
  requirePerm.mockClear();
  createSignedUrl.mockClear();
  ROWS[0].id = 'c-ok';
});

describe('GET /api/admin/pre-trip-checks', () => {
  it('refuses anyone without tms.dashboard.view with 403', async () => {
    allowed = false;
    const res = await listGET(req('/api/admin/pre-trip-checks'));
    expect(res.status).toBe(403);
    expect(requirePerm.mock.calls[0][1]).toBe('tms.dashboard.view');
  });

  it('lists the chosen date with names and never sends the photo path', async () => {
    const res = await listGET(req('/api/admin/pre-trip-checks?date=2026-11-07'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(eqCalls).toContainEqual(['tms_pre_trip_check', 'check_date', '2026-11-07']);
    // Sorted by route number: 5 (no check), 18 (via its bus), 31 (via the trip).
    expect(body.data.rows.map((r: { routeNumber: string; status: string }) => [r.routeNumber, r.status])).toEqual([
      ['5', 'not_done'], ['18', 'ok'], ['31', 'skipped'],
    ]);
    expect(body.data.rows[0]).toMatchObject({ key: 'route:r5', busRegistration: 'TN28 AB 9', driverName: 'Mani', check: null });
    expect(body.data.rows[1]).toMatchObject({ routeName: 'SOLAR', driverName: 'Ravi K', busRegistration: 'TN28 AB 1' });
    expect(body.data.rows[1].check).toMatchObject({ id: 'c-ok', hasPhoto: true });
    expect(JSON.stringify(body)).not.toContain('a.jpg');
    expect(body.data.totals).toMatchObject({ buses: 3, checked: 2, ok: 1, issue: 0, skipped: 1, notDone: 1, all: 2, flagged: 1 });
  });

  it('"issues and skips only" keeps only flagged rows', async () => {
    const body = await (await listGET(req('/api/admin/pre-trip-checks?issues=1'))).json();
    expect(body.data.rows.map((r: { key: string }) => r.key)).toEqual(['c-skip']);
  });

  it('a bad date falls back to today', async () => {
    const body = await (await listGET(req('/api/admin/pre-trip-checks?date=nonsense'))).json();
    expect(body.data.date).toBe(body.data.today);
  });
});

describe('GET /api/admin/pre-trip-checks/<id>/photo', () => {
  it('refuses anyone without tms.dashboard.view with 403, and signs nothing', async () => {
    allowed = false;
    const res = await photoGET(req(`/api/admin/pre-trip-checks/${UUID}/photo`));
    expect(res.status).toBe(403);
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it('returns a short-lived signed URL for the path stored on the row', async () => {
    ROWS[0].id = UUID;
    const res = await photoGET(req(`/api/admin/pre-trip-checks/${UUID}/photo`));
    expect(res.status).toBe(200);
    expect((await res.json()).data.url).toContain('signed.example');
    expect(createSignedUrl).toHaveBeenCalledWith('h/2026-11-08/a.jpg', 120);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('a skipped check has no photo (404)', async () => {
    ROWS[1].id = UUID;
    ROWS[0].id = 'c-ok';
    const res = await photoGET(req(`/api/admin/pre-trip-checks/${UUID}/photo`));
    ROWS[1].id = 'c-skip';
    expect(res.status).toBe(404);
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it('rejects a non-uuid id', async () => {
    const res = await photoGET(req('/api/admin/pre-trip-checks/..%2F..%2Fsecret/photo'));
    expect(res.status).toBe(400);
  });
});
