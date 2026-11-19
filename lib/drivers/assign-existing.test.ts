import { describe, it, expect } from 'vitest';
import { assignExistingStaffAsDriver, ALREADY_DRIVER_MESSAGE } from './assign-existing';

type Call = { table: string; method: string; args: unknown[] };
type Result = { data?: unknown; error?: unknown };
type Log = { table: string; calls: Call[] }[];

/** Recording fake: every chain call is logged; awaiting resolves `respond(table, calls)`. */
function fakeClient(respond: (table: string, calls: Call[]) => Result) {
  const log: Log = [];
  const client = {
    from(table: string) {
      const calls: Call[] = [];
      log.push({ table, calls });
      const b: Record<string, unknown> = {};
      const resolve = () => Promise.resolve({ data: null, error: null, ...respond(table, calls) });
      for (const m of ['select', 'eq', 'update', 'upsert']) {
        b[m] = (...args: unknown[]) => {
          calls.push({ table, method: m, args });
          return b;
        };
      }
      b.maybeSingle = () => resolve();
      b.single = () => resolve();
      b.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => resolve().then(ok, bad);
      return b;
    },
  };
  return { client: client as never, log };
}

const has = (c: Call[], m: string) => c.some((x) => x.method === m);
const callsOf = (log: Log, table: string, method: string) =>
  log.filter((l) => l.table === table).flatMap((l) => l.calls.filter((c) => c.method === method));

const TRANSPORT = {
  licenseNumber: 'TN123',
  driverStatus: 'active',
  // Hidden columns the form never shows: must never reach the payload.
  rating: 5,
  totalTrips: 99,
  locationSharingEnabled: true,
  address: 'x',
  emergencyContactName: 'y',
  emergencyContactPhone: 'z',
};

function client(opts: { role?: string | null; staff?: boolean; existingOps?: boolean }) {
  return fakeClient((t, c) => {
    if (t === 'staff' && has(c, 'update')) return { data: null };
    if (t === 'staff') return { data: opts.staff === false ? null : { id: 'S1', role_key: opts.role ?? 'faculty' } };
    if (t === 'tms_driver' && has(c, 'upsert')) return { data: { staff_id: 'S1' } };
    if (t === 'tms_driver') return { data: opts.existingOps ? { staff_id: 'S1' } : null };
    return { data: null };
  });
}

describe('assignExistingStaffAsDriver', () => {
  it('409s and writes nothing when a tms_driver row already exists', async () => {
    const { client: c, log } = client({ existingOps: true });
    await expect(assignExistingStaffAsDriver(c, 'S1', TRANSPORT, 'A')).rejects.toMatchObject({
      status: 409,
      message: ALREADY_DRIVER_MESSAGE,
    });
    expect(ALREADY_DRIVER_MESSAGE).toBe('This person is already a driver. Open their record and use Edit.');
    expect(log.flatMap((l) => l.calls).filter((x) => x.method === 'update' || x.method === 'upsert')).toHaveLength(0);
  });

  it('404s and writes nothing when the staff member is missing', async () => {
    const { client: c, log } = client({ staff: false });
    await expect(assignExistingStaffAsDriver(c, 'S1', TRANSPORT, 'A')).rejects.toMatchObject({ status: 404 });
    expect(log.flatMap((l) => l.calls).filter((x) => x.method === 'update' || x.method === 'upsert')).toHaveLength(0);
  });

  it('upserts only the nine transport keys plus audit columns when there is no row', async () => {
    const { client: c, log } = client({});
    await assignExistingStaffAsDriver(c, 'S1', TRANSPORT, 'A');
    const up = callsOf(log, 'tms_driver', 'upsert');
    expect(up).toHaveLength(1);
    const payload = up[0].args[0] as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(
      [
        'staff_id', 'license_number', 'license_expiry', 'experience_years', 'driver_status',
        'assigned_route_id', 'aadhar_number', 'medical_certificate_expiry', 'notes',
        'created_by', 'updated_by',
      ].sort(),
    );
    expect(payload).toMatchObject({ staff_id: 'S1', license_number: 'TN123', created_by: 'A', updated_by: 'A' });
    expect(up[0].args[1]).toEqual({ onConflict: 'staff_id' });
  });

  it('flips role_key to driver only when needed', async () => {
    const a = client({ role: 'faculty' });
    await assignExistingStaffAsDriver(a.client, 'S1', TRANSPORT, 'A');
    const upd = callsOf(a.log, 'staff', 'update');
    expect(upd).toHaveLength(1);
    expect(upd[0].args[0]).toEqual({ role_key: 'driver', updated_by: 'A' });

    const b = client({ role: 'driver' });
    await assignExistingStaffAsDriver(b.client, 'S1', TRANSPORT, 'A');
    expect(callsOf(b.log, 'staff', 'update')).toHaveLength(0);
  });
});
