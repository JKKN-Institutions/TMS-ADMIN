import { describe, it, expect } from 'vitest';
import {
  RECORD_MANAGED_ELSEWHERE_MESSAGE,
  RELEASE_WARNING,
  TRIP_RUNNING_MESSAGE,
  assertNoRunningTrip,
  releaseDriverDuties,
  setDriverActive,
} from './status';
import { DRIVER_CATEGORY_ID } from './onboarding-constants';

type Call = { method: string; args: unknown[] };
type Result = { data?: unknown; error?: unknown };
type Entry = { table: string; calls: Call[] };

/** Recording fake: every chain call is logged; awaiting resolves `respond(table, calls)`. */
function fakeClient(respond: (table: string, calls: Call[]) => Result | undefined) {
  const log: Entry[] = [];
  const client = {
    from(table: string) {
      const calls: Call[] = [];
      log.push({ table, calls });
      const b: Record<string, unknown> = {};
      const resolve = () => Promise.resolve({ data: null, error: null, ...(respond(table, calls) ?? {}) });
      for (const m of ['select', 'eq', 'update', 'insert', 'upsert', 'delete']) {
        b[m] = (...args: unknown[]) => {
          calls.push({ method: m, args });
          return b;
        };
      }
      b.maybeSingle = () => resolve();
      b.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => resolve().then(ok, bad);
      return b;
    },
  };
  return { client: client as never, log };
}

const has = (calls: Call[], method: string) => calls.some((c) => c.method === method);
const updatesOf = (log: Entry[], table: string) =>
  log.filter((l) => l.table === table && has(l.calls, 'update'));
const payloadOf = (e: Entry) => e.calls.find((c) => c.method === 'update')!.args[0];
const filtersOf = (e: Entry) => e.calls.filter((c) => c.method === 'eq').map((c) => c.args.join('='));
const writes = (log: Entry[]) =>
  log.filter((l) => l.calls.some((c) => ['update', 'insert', 'upsert', 'delete'].includes(c.method)));

const STAFF = {
  id: 'S1',
  first_name: 'Ravi',
  last_name: 'Kumar',
  is_active: true,
  role_key: 'driver',
  category_id: DRIVER_CATEGORY_ID,
};
const ROUTE_ROWS = [{ id: 'R1', route_number: '12', route_name: 'ERODE' }];

/** A world where the driver exists, has a tms_driver row, one route and one phone. */
function world(over: {
  staff?: Record<string, unknown> | null;
  opsRow?: { id: string } | null;
  runningTrips?: unknown[];
  routes?: unknown[];
  mobiles?: unknown[];
  fail?: (table: string, calls: Call[]) => Result | undefined;
} = {}) {
  const staff = over.staff === undefined ? STAFF : over.staff;
  const opsRow = over.opsRow === undefined ? { id: 'D1' } : over.opsRow;
  return fakeClient((t, c) => {
    const failed = over.fail?.(t, c);
    if (failed) return failed;
    if (t === 'staff' && has(c, 'update')) return { data: [{ id: 'S1' }] };
    if (t === 'staff') return { data: staff };
    if (t === 'tms_driver' && has(c, 'update')) return { data: opsRow ? [{ staff_id: 'S1' }] : [] };
    if (t === 'tms_driver') return { data: opsRow };
    if (t === 'tms_trip') return { data: over.runningTrips ?? [] };
    if (t === 'tms_route') return { data: over.routes ?? ROUTE_ROWS };
    if (t === 'tms_driver_mobile') return { data: over.mobiles ?? [{ id: 'M1' }] };
    return { data: [] };
  });
}

describe('assertNoRunningTrip', () => {
  it('passes without looking at trips when the driver has no transport record', async () => {
    const { client, log } = world({ opsRow: null });
    await expect(assertNoRunningTrip(client, 'S1')).resolves.toBeUndefined();
    expect(log.some((l) => l.table === 'tms_trip')).toBe(false);
  });

  it('passes when no trip is running, asking for active trips of the tms_driver id', async () => {
    const { client, log } = world();
    await expect(assertNoRunningTrip(client, 'S1')).resolves.toBeUndefined();
    const trip = log.find((l) => l.table === 'tms_trip')!;
    expect(filtersOf(trip)).toEqual(['driver_id=D1', 'status=active']);
  });

  it('409s when a trip is running', async () => {
    const { client } = world({ runningTrips: [{ id: 'T1' }] });
    await expect(assertNoRunningTrip(client, 'S1')).rejects.toMatchObject({ status: 409, message: TRIP_RUNNING_MESSAGE });
  });

  it('500s rather than guessing when the trip lookup fails', async () => {
    const { client } = world({ fail: (t) => (t === 'tms_trip' ? { error: { message: 'down' } } : undefined) });
    await expect(assertNoRunningTrip(client, 'S1')).rejects.toMatchObject({ status: 500 });
  });
});

describe('releaseDriverDuties', () => {
  it('takes the driver off their routes and bus, and marks the transport record inactive', async () => {
    const { client, log } = world();
    const r = await releaseDriverDuties(client, 'S1', 'A');

    const route = updatesOf(log, 'tms_route')[0];
    expect(payloadOf(route)).toEqual({ driver_id: null, updated_by: 'A' });
    expect(filtersOf(route)).toEqual(['driver_id=S1']);

    const bus = updatesOf(log, 'tms_vehicle')[0];
    expect(payloadOf(bus)).toEqual({ assigned_driver_id: null });
    expect(filtersOf(bus)).toEqual(['assigned_driver_id=S1']);

    const ops = updatesOf(log, 'tms_driver')[0];
    expect(payloadOf(ops)).toEqual({
      driver_status: 'inactive',
      assigned_route_id: null,
      location_sharing_enabled: false,
      updated_by: 'A',
    });
    expect(filtersOf(ops)).toEqual(['staff_id=S1']);

    expect(r).toEqual({ routes: [{ id: 'R1', label: '12 · ERODE' }], mobilesHeld: 1 });
  });

  it('never creates a transport record', async () => {
    const { client, log } = world({ opsRow: null });
    await releaseDriverDuties(client, 'S1', 'A');
    expect(log.some((l) => l.calls.some((c) => c.method === 'insert' || c.method === 'upsert'))).toBe(false);
  });

  it('labels a route with no number or name', async () => {
    const { client } = world({ routes: [{ id: 'R9', route_number: null, route_name: null }] });
    const r = await releaseDriverDuties(client, 'S1', 'A');
    expect(r.routes).toEqual([{ id: 'R9', label: '? ·' }]);
  });

  it('returns a warning, and still does the other steps, when the route step fails', async () => {
    const { client, log } = world({ fail: (t) => (t === 'tms_route' ? { error: { message: 'boom' } } : undefined) });
    const r = await releaseDriverDuties(client, 'S1', 'A');
    expect(r.warning).toBe(RELEASE_WARNING);
    expect(r.routes).toEqual([]);
    expect(updatesOf(log, 'tms_vehicle')).toHaveLength(1);
    expect(updatesOf(log, 'tms_driver')).toHaveLength(1);
  });

  it('does not warn when only the phone count fails', async () => {
    const { client } = world({ fail: (t) => (t === 'tms_driver_mobile' ? { error: { message: 'x' } } : undefined) });
    const r = await releaseDriverDuties(client, 'S1', 'A');
    expect(r.warning).toBeUndefined();
    expect(r.mobilesHeld).toBe(0);
  });
});

describe('setDriverActive', () => {
  it('404s with no writes when the person is missing or not a driver', async () => {
    const { client, log } = world({ staff: null });
    await expect(setDriverActive(client, 'S1', false, 'A')).rejects.toMatchObject({ status: 404, message: 'Driver not found' });
    expect(writes(log)).toHaveLength(0);
    expect(filtersOf(log[0])).toEqual(['id=S1', 'role_key=driver']);
  });

  it('403s with no writes for a record outside the Driver category', async () => {
    const { client, log } = world({ staff: { ...STAFF, category_id: 'other' } });
    await expect(setDriverActive(client, 'S1', false, 'A')).rejects.toMatchObject({
      status: 403,
      message: RECORD_MANAGED_ELSEWHERE_MESSAGE,
    });
    expect(writes(log)).toHaveLength(0);
  });

  it('409s with no writes while a trip is running', async () => {
    const { client, log } = world({ runningTrips: [{ id: 'T1' }] });
    await expect(setDriverActive(client, 'S1', false, 'A')).rejects.toMatchObject({ status: 409, message: TRIP_RUNNING_MESSAGE });
    expect(writes(log)).toHaveLength(0);
  });

  it('marks the employee inactive, gated by id, role and category, then releases duties', async () => {
    const { client, log } = world();
    const r = await setDriverActive(client, 'S1', false, 'A');

    const staffUpdate = updatesOf(log, 'staff')[0];
    expect(payloadOf(staffUpdate)).toEqual({ is_active: false, updated_by: 'A' });
    expect(filtersOf(staffUpdate)).toEqual(['id=S1', 'role_key=driver', `category_id=${DRIVER_CATEGORY_ID}`]);

    // The employee flag is written before anything is released.
    const order = writes(log).map((l) => l.table);
    expect(order[0]).toBe('staff');
    expect(order).toContain('tms_route');

    expect(r).toEqual({
      id: 'S1',
      name: 'Ravi Kumar',
      active: false,
      changed: true,
      routes: [{ id: 'R1', label: '12 · ERODE' }],
      mobilesHeld: 1,
    });
  });

  it('works for a driver with no transport record, still releasing the route', async () => {
    const { client, log } = world({ opsRow: null });
    const r = await setDriverActive(client, 'S1', false, 'A');
    expect(r.changed).toBe(true);
    expect(updatesOf(log, 'tms_route')).toHaveLength(1);
    expect(log.some((l) => l.calls.some((c) => c.method === 'insert' || c.method === 'upsert'))).toBe(false);
  });

  it('keeps the employee inactive and reports a warning when the release fails', async () => {
    const { client, log } = world({ fail: (t) => (t === 'tms_route' ? { error: { message: 'boom' } } : undefined) });
    const r = await setDriverActive(client, 'S1', false, 'A');
    expect(updatesOf(log, 'staff')).toHaveLength(1);
    expect(r.active).toBe(false);
    expect(r.warning).toBe(RELEASE_WARNING);
  });

  it('403s, releasing nothing, when the staff update matches no row', async () => {
    const { client, log } = world({ fail: (t, c) => (t === 'staff' && has(c, 'update') ? { data: [] } : undefined) });
    await expect(setDriverActive(client, 'S1', false, 'A')).rejects.toMatchObject({ status: 403 });
    expect(updatesOf(log, 'tms_route')).toHaveLength(0);
  });

  it('translates a database refusal of the staff update and releases nothing', async () => {
    const { client, log } = world({
      fail: (t, c) => (t === 'staff' && has(c, 'update') ? { error: { code: 'P0001', message: 'Not allowed' } } : undefined),
    });
    await expect(setDriverActive(client, 'S1', false, 'A')).rejects.toMatchObject({ status: 422, message: 'Not allowed' });
    expect(updatesOf(log, 'tms_route')).toHaveLength(0);
  });

  it('finishes the release without rewriting staff when the employee is already inactive', async () => {
    const { client, log } = world({ staff: { ...STAFF, is_active: false } });
    const r = await setDriverActive(client, 'S1', false, 'A');
    expect(r.changed).toBe(false);
    expect(updatesOf(log, 'staff')).toHaveLength(0);
    expect(updatesOf(log, 'tms_route')).toHaveLength(1);
  });

  it('marks active: employee flag and transport status only, nothing else restored', async () => {
    const { client, log } = world({ staff: { ...STAFF, is_active: false } });
    const r = await setDriverActive(client, 'S1', true, 'A');
    expect(payloadOf(updatesOf(log, 'staff')[0])).toEqual({ is_active: true, updated_by: 'A' });
    const ops = updatesOf(log, 'tms_driver')[0];
    expect(payloadOf(ops)).toEqual({ driver_status: 'active', updated_by: 'A' });
    expect(filtersOf(ops)).toEqual(['staff_id=S1', 'driver_status=inactive']);
    expect(updatesOf(log, 'tms_route')).toHaveLength(0);
    expect(log.some((l) => l.table === 'tms_trip')).toBe(false);
    expect(r).toEqual({ id: 'S1', name: 'Ravi Kumar', active: true, changed: true, routes: [], mobilesHeld: 0 });
  });

  it('still clears a stale TMS "inactive" when the employee is already active, touching nothing else', async () => {
    const { client, log } = world();
    const r = await setDriverActive(client, 'S1', true, 'A');
    expect(r.changed).toBe(false);
    expect(updatesOf(log, 'staff')).toHaveLength(0);
    const ops = updatesOf(log, 'tms_driver')[0];
    expect(payloadOf(ops)).toEqual({ driver_status: 'active', updated_by: 'A' });
    // Only a row that says inactive: someone on leave stays on leave.
    expect(filtersOf(ops)).toEqual(['staff_id=S1', 'driver_status=inactive']);
    expect(writes(log).map((l) => l.table)).toEqual(['tms_driver']);
  });
});
