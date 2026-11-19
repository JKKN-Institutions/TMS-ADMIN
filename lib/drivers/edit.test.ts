import { describe, it, expect } from 'vitest';
import { updateDriver, photoObjectPath, replaceDriverPhoto } from './edit';
import { OnboardError } from './onboard';
import { DRIVER_CATEGORY_ID } from './onboarding-constants';

type Call = { table: string; method: string; args: unknown[] };
type Result = { data?: unknown; error?: unknown };
type Log = { table: string; calls: Call[] }[];

/** Recording fake: every chain call is logged; awaiting resolves `respond(table, calls)`. */
function fakeClient(respond: (table: string, calls: Call[]) => Result, storage?: Record<string, (...a: unknown[]) => unknown>) {
  const log: Log = [];
  const client = {
    from(table: string) {
      const calls: Call[] = [];
      log.push({ table, calls });
      const b: Record<string, unknown> = {};
      const resolve = () => Promise.resolve({ data: null, error: null, ...respond(table, calls) });
      for (const m of ['select', 'ilike', 'neq', 'eq', 'limit', 'insert', 'update', 'upsert']) {
        b[m] = (...args: unknown[]) => {
          calls.push({ table, method: m, args });
          return b;
        };
      }
      b.maybeSingle = () => resolve();
      b.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => resolve().then(ok, bad);
      return b;
    },
    storage: { from: () => storage },
  };
  return { client: client as never, log };
}

const callsOf = (log: Log, table: string, method: string) =>
  log.filter((l) => l.table === table).flatMap((l) => l.calls.filter((c) => c.method === method));
const writes = (log: Log) =>
  log.flatMap((l) => l.calls).filter((c) => ['update', 'upsert', 'insert'].includes(c.method));
const isRowLoad = (t: string, c: Call[]) => t === 'staff' && c.some((x) => x.method === 'select' && x.args[0] === '*');
const isStaffUpdate = (t: string, c: Call[]) => t === 'staff' && c.some((x) => x.method === 'update');

const FULL_ROW = {
  id: 'S1',
  profile_id: 'P1',
  role_key: 'driver',
  category_id: DRIVER_CATEGORY_ID,
  first_name: 'Ravi',
  last_name: 'Kumar',
  gender: 'male',
  date_of_birth: '1985-04-12',
  marital_status: 'married',
  blood_group: null,
  phone: '9876543210',
  email: 'ravi@gmail.com',
  institution_email: 'ravi.k@jkkn.ac.in',
  address: null,
  state: 'Tamil Nadu',
  district: 'Salem',
  pincode: null,
  emergency_contact_name: null,
  emergency_contact_relationship: null,
  emergency_contact_phone: null,
  date_of_joining: '2020-06-01',
  designation: 'Bus Driver',
  biometric_id: null,
  biometric_institution_id: null,
  is_active: true,
  updated_at: '2026-11-19T10:00:00.123+00:00',
};
/** The same instant as FULL_ROW.updated_at, written the way JSON sends it. */
const BASE = '2026-11-19T10:00:00.123Z';

const PERSON = {
  firstName: 'Ravi',
  lastName: 'Kumar',
  gender: 'male',
  dateOfBirth: '1985-04-12',
  maritalStatus: 'married',
  bloodGroup: '',
  phone: '9876543210',
  email: 'ravi@gmail.com',
  address: '',
  state: 'Tamil Nadu',
  district: 'Salem',
  pincode: '',
  emergencyContactName: '',
  emergencyContactRelationship: '',
  emergencyContactRelationshipOther: '',
  emergencyContactPhone: '',
  dateOfJoining: '2020-06-01',
  designation: 'Bus Driver',
  biometricId: '',
  biometricInstitutionId: '',
  isActive: true,
};
const TRANSPORT = { licenseNumber: 'TN123', driverStatus: 'active' };

/** The staff row load returns `row`; everything else is empty/ok unless `extra` answers first. */
function withRow(
  row: Record<string, unknown> | null,
  extra?: (t: string, c: Call[]) => Result | undefined,
  storage?: Record<string, (...a: unknown[]) => unknown>,
) {
  return fakeClient((t, c) => {
    const e = extra?.(t, c);
    if (e) return e;
    if (isRowLoad(t, c)) return { data: row };
    if (isStaffUpdate(t, c)) return { data: [{ id: 'S1' }] };
    if (t === 'custom_roles') return { data: { id: 'role-driver' } };
    if (t === 'user_roles') return { data: [{ id: 'ur1' }] };
    return { data: [] };
  }, storage);
}

describe('updateDriver', () => {
  it('404s with no writes when the staff row is missing or not a driver', async () => {
    const { client, log } = withRow(null);
    await expect(updateDriver(client, 'S1', { person: PERSON, transport: TRANSPORT, baseUpdatedAt: BASE }, 'A')).rejects.toMatchObject({ status: 404 });
    expect(writes(log)).toHaveLength(0);
    expect(callsOf(log, 'staff', 'eq').map((c) => c.args.join('='))).toContain('role_key=driver');
  });

  it('ignores person and still upserts tms_driver when the row is not fully editable', async () => {
    const { client, log } = withRow({ ...FULL_ROW, category_id: 'other-category' });
    const r = await updateDriver(client, 'S1', { person: { ...PERSON, phone: '1111111111' }, transport: TRANSPORT, baseUpdatedAt: BASE }, 'A');
    expect(r).toEqual({ id: 'S1', personSaved: false, changed: [] });
    expect(callsOf(log, 'staff', 'update')).toHaveLength(0);
    const up = callsOf(log, 'tms_driver', 'upsert');
    expect(up).toHaveLength(1);
    expect(up[0].args[1]).toEqual({ onConflict: 'staff_id' });
    expect(up[0].args[0]).toMatchObject({ staff_id: 'S1', profile_id: 'P1', updated_by: 'A', license_number: 'TN123' });
  });

  it('does not update staff when nothing changed', async () => {
    const { client, log } = withRow(FULL_ROW);
    const r = await updateDriver(client, 'S1', { person: PERSON, transport: TRANSPORT, baseUpdatedAt: BASE }, 'A');
    expect(r).toEqual({ id: 'S1', personSaved: true, changed: [] });
    expect(callsOf(log, 'staff', 'update')).toHaveLength(0);
    expect(callsOf(log, 'tms_driver', 'upsert')).toHaveLength(1);
  });

  it('updates only the changed column, filtered by id and role_key', async () => {
    const { client, log } = withRow(FULL_ROW);
    const r = await updateDriver(client, 'S1', { person: { ...PERSON, phone: '9000000000' }, transport: TRANSPORT, baseUpdatedAt: BASE }, 'A');
    expect(r).toEqual({ id: 'S1', personSaved: true, changed: ['phone'] });
    const upd = log.find((l) => isStaffUpdate(l.table, l.calls))!;
    expect(upd.calls.find((c) => c.method === 'update')!.args[0]).toEqual({ phone: '9000000000', updated_by: 'A' });
    expect(upd.calls.filter((c) => c.method === 'eq').map((c) => c.args.join('='))).toEqual([
      'id=S1',
      'role_key=driver',
      `category_id=${DRIVER_CATEGORY_ID}`,
    ]);
  });

  it('never writes protected columns even when the body carries them', async () => {
    const { client, log } = withRow(FULL_ROW);
    const person = {
      ...PERSON,
      phone: '9000000000',
      institution_email: 'x@jkkn.ac.in',
      institutionEmailName: 'hacker',
      staff_id: 'X',
      profile_id: 'Y',
      role_key: 'admin',
      category_id: 'c',
      institution_id: 'i',
      department_id: 'd',
      login_enabled: false,
      status: 'terminated',
    };
    await updateDriver(client, 'S1', { person, transport: TRANSPORT, baseUpdatedAt: BASE }, 'A');
    const payload = callsOf(log, 'staff', 'update')[0].args[0] as Record<string, unknown>;
    for (const k of ['institution_email', 'staff_id', 'profile_id', 'role_key', 'category_id', 'institution_id', 'department_id', 'login_enabled', 'status']) {
      expect(payload).not.toHaveProperty(k);
    }
  });

  it('409s without updating when a changed email exists elsewhere, excluding this staff row', async () => {
    const { client, log } = withRow(FULL_ROW, (t, c) =>
      t === 'staff' && c.some((x) => x.method === 'ilike') ? { data: [{ id: 'S2' }] } : undefined,
    );
    await expect(
      updateDriver(client, 'S1', { person: { ...PERSON, email: 'taken@gmail.com' }, transport: TRANSPORT, baseUpdatedAt: BASE }, 'A'),
    ).rejects.toMatchObject({ status: 409 });
    expect(writes(log)).toHaveLength(0);
    const staffNeq = callsOf(log, 'staff', 'neq');
    expect(staffNeq.length).toBeGreaterThan(0);
    expect(staffNeq.every((c) => c.args[0] === 'id' && c.args[1] === 'S1')).toBe(true);
  });

  it('excludes this profile id when checking profiles', async () => {
    const { client, log } = withRow(FULL_ROW);
    await updateDriver(client, 'S1', { person: { ...PERSON, email: 'new@gmail.com' }, transport: TRANSPORT, baseUpdatedAt: BASE }, 'A');
    const profNeq = callsOf(log, 'profiles', 'neq');
    expect(profNeq.length).toBeGreaterThan(0);
    expect(profNeq.every((c) => c.args[0] === 'id' && c.args[1] === 'P1')).toBe(true);
  });

  it('400s with field errors and writes nothing when the person is invalid', async () => {
    const { client, log } = withRow(FULL_ROW);
    const err = await updateDriver(client, 'S1', { person: { ...PERSON, phone: '12' }, transport: TRANSPORT, baseUpdatedAt: BASE }, 'A').catch((e) => e);
    expect(err).toBeInstanceOf(OnboardError);
    expect(err.status).toBe(400);
    expect(err.fields?.phone).toBeTruthy();
    expect(writes(log)).toHaveLength(0);
  });

  it.each([undefined, null, 'x', [], 5])('400s and writes nothing when transport is %j', async (transport) => {
    const { client, log } = withRow(FULL_ROW);
    await expect(
      updateDriver(client, 'S1', { person: { ...PERSON, phone: '9000000000' }, transport }, 'A'),
    ).rejects.toMatchObject({ status: 400, message: 'Transport details are missing' });
    expect(writes(log)).toHaveLength(0);
  });

  it('500s when the tms_driver upsert fails', async () => {
    const { client } = withRow(FULL_ROW, (t) => (t === 'tms_driver' ? { error: { message: 'boom' } } : undefined));
    await expect(updateDriver(client, 'S1', { person: PERSON, transport: TRANSPORT, baseUpdatedAt: BASE }, 'A')).rejects.toMatchObject({
      status: 500,
      message: 'Failed to save transport details',
    });
  });

  it('403s with no tms_driver write when the staff update matches no row', async () => {
    const { client, log } = withRow(FULL_ROW, (t, c) => (isStaffUpdate(t, c) ? { data: [] } : undefined));
    await expect(
      updateDriver(client, 'S1', { person: { ...PERSON, phone: '9000000000' }, transport: TRANSPORT, baseUpdatedAt: BASE }, 'A'),
    ).rejects.toMatchObject({ status: 403, message: "This person's record is managed in MyJKKN." });
    expect(callsOf(log, 'tms_driver', 'upsert')).toHaveLength(0);
    expect(log.some((l) => l.table === 'custom_roles' || l.table === 'user_roles')).toBe(false);
  });

  it('translates a staff update error', async () => {
    const { client } = withRow(FULL_ROW, (t, c) =>
      isStaffUpdate(t, c) ? { error: { code: '23505', message: 'staff_biometric_uq' } } : undefined,
    );
    await expect(
      updateDriver(client, 'S1', { person: { ...PERSON, phone: '9000000000' }, transport: TRANSPORT, baseUpdatedAt: BASE }, 'A'),
    ).rejects.toMatchObject({ status: 409, field: 'biometricId' });
  });

  describe('refuses to overwrite a change made elsewhere', () => {
    it('saves when baseUpdatedAt is the same instant as the stored row', async () => {
      const { client, log } = withRow(FULL_ROW);
      const r = await updateDriver(
        client, 'S1', { person: { ...PERSON, phone: '9000000000' }, transport: TRANSPORT, baseUpdatedAt: BASE }, 'A',
      );
      expect(r.changed).toEqual(['phone']);
      expect(callsOf(log, 'staff', 'update')).toHaveLength(1);
    });

    it('409s with no writes when the row changed since the form loaded', async () => {
      const { client, log } = withRow(FULL_ROW);
      await expect(
        updateDriver(
          client, 'S1',
          { person: { ...PERSON, phone: '9000000000' }, transport: TRANSPORT, baseUpdatedAt: '2026-11-19T09:00:00Z' },
          'A',
        ),
      ).rejects.toMatchObject({
        status: 409,
        message: 'This record was changed by someone else. Reload the page and try again.',
      });
      expect(writes(log)).toHaveLength(0);
    });

    it.each([undefined, null, '', 'not-a-date', 5])('400s with no writes when baseUpdatedAt is %j', async (base) => {
      const { client, log } = withRow(FULL_ROW);
      await expect(
        updateDriver(client, 'S1', { person: PERSON, transport: TRANSPORT, baseUpdatedAt: base }, 'A'),
      ).rejects.toMatchObject({ status: 400, message: 'Reload the page and try again.' });
      expect(writes(log)).toHaveLength(0);
    });

    it('needs no baseUpdatedAt for a transport-only save', async () => {
      const { client, log } = withRow(FULL_ROW);
      const r = await updateDriver(client, 'S1', { transport: TRANSPORT }, 'A');
      expect(r.personSaved).toBe(false);
      expect(callsOf(log, 'tms_driver', 'upsert')).toHaveLength(1);
    });

    it('needs no baseUpdatedAt when the row is not fully editable', async () => {
      const { client, log } = withRow({ ...FULL_ROW, category_id: 'other-category' });
      await updateDriver(client, 'S1', { person: PERSON, transport: TRANSPORT }, 'A');
      expect(callsOf(log, 'tms_driver', 'upsert')).toHaveLength(1);
    });
  });

  describe('address and emergency contact live on staff only', () => {
    const COPIES = ['address', 'emergency_contact_name', 'emergency_contact_phone'];

    it('nulls the old tms_driver copies when the person is saved', async () => {
      const { client, log } = withRow(FULL_ROW);
      await updateDriver(client, 'S1', { person: { ...PERSON, address: '1 Main St' }, transport: TRANSPORT, baseUpdatedAt: BASE }, 'A');
      const payload = callsOf(log, 'tms_driver', 'upsert')[0].args[0] as Record<string, unknown>;
      expect(payload).toMatchObject({ address: null, emergency_contact_name: null, emergency_contact_phone: null });
    });

    it('leaves the copies alone when the row is not fully editable', async () => {
      const { client, log } = withRow({ ...FULL_ROW, category_id: 'other-category' });
      await updateDriver(client, 'S1', { person: PERSON, transport: TRANSPORT, baseUpdatedAt: BASE }, 'A');
      const payload = callsOf(log, 'tms_driver', 'upsert')[0].args[0] as Record<string, unknown>;
      for (const k of COPIES) expect(payload).not.toHaveProperty(k);
    });

    it('leaves the copies alone when no person is sent', async () => {
      const { client, log } = withRow(FULL_ROW);
      await updateDriver(client, 'S1', { transport: TRANSPORT }, 'A');
      const payload = callsOf(log, 'tms_driver', 'upsert')[0].args[0] as Record<string, unknown>;
      for (const k of COPIES) expect(payload).not.toHaveProperty(k);
    });

    it('does not upsert (so nothing is nulled) when the staff update fails', async () => {
      const { client, log } = withRow(FULL_ROW, (t, c) =>
        isStaffUpdate(t, c) ? { error: { code: '23505', message: 'staff_biometric_uq' } } : undefined,
      );
      await expect(
        updateDriver(client, 'S1', { person: { ...PERSON, address: '1 Main St' }, transport: TRANSPORT, baseUpdatedAt: BASE }, 'A'),
      ).rejects.toMatchObject({ status: 409 });
      expect(callsOf(log, 'tms_driver', 'upsert')).toHaveLength(0);
    });
  });

  it('succeeds even when ensureDriverRole fails', async () => {
    const { client } = withRow(FULL_ROW, (t) => (t === 'custom_roles' ? { error: { message: 'down' } } : undefined));
    const r = await updateDriver(client, 'S1', { person: PERSON, transport: TRANSPORT, baseUpdatedAt: BASE }, 'A');
    expect(r.personSaved).toBe(true);
  });
});

describe('photoObjectPath', () => {
  it('uses staffId, timestamp and a lowercased allowed extension', () => {
    expect(photoObjectPath('S1', 'Me.PNG', 123)).toBe('S1/123.png');
    expect(photoObjectPath('S1', 'a.b.JPeG', 5)).toBe('S1/5.jpeg');
    expect(photoObjectPath('S1', 'x.gif', 5)).toBe('S1/5.gif');
  });
  it('falls back to the MIME type, then jpg, when the name has no usable extension', () => {
    expect(photoObjectPath('S1', 'photo', 9, 'image/png')).toBe('S1/9.png');
    expect(photoObjectPath('S1', 'evil.exe', 9, 'image/gif')).toBe('S1/9.gif');
    expect(photoObjectPath('S1', 'photo', 9)).toBe('S1/9.jpg');
  });
});

describe('replaceDriverPhoto', () => {
  function photoClient(row: Record<string, unknown> | null, updateError?: unknown) {
    const ops: string[] = [];
    const storage = {
      upload: (p: unknown) => (ops.push(`upload:${p}`), Promise.resolve({ error: null })),
      getPublicUrl: (p: unknown) => ({ data: { publicUrl: `https://cdn/${p}` } }),
      list: () => (ops.push('list'), Promise.resolve({ data: [{ name: '1.jpg' }, { name: '777.png' }], error: null })),
      remove: (p: unknown) => (ops.push(`remove:${(p as string[]).join(',')}`), Promise.resolve({ error: null })),
    };
    const c = withRow(row, (t, cs) => (updateError && isStaffUpdate(t, cs) ? { error: updateError } : undefined), storage);
    return { ...c, ops };
  }
  const FILE = { bytes: new Uint8Array([1]), name: 'me.png', type: 'image/png' };

  it('403s when not fully editable and 404s when missing, without touching storage', async () => {
    const a = photoClient({ ...FULL_ROW, category_id: 'other' });
    await expect(replaceDriverPhoto(a.client, 'S1', FILE, 'A', 777)).rejects.toMatchObject({
      status: 403,
      message: "This person's photo is managed in MyJKKN.",
    });
    expect(a.ops).toEqual([]);
    const b = photoClient(null);
    await expect(replaceDriverPhoto(b.client, 'S1', FILE, 'A', 777)).rejects.toMatchObject({ status: 404 });
    expect(b.ops).toEqual([]);
  });

  it('uploads, updates profile_picture, then removes only the older objects', async () => {
    const { client, log, ops } = photoClient(FULL_ROW);
    const r = await replaceDriverPhoto(client, 'S1', FILE, 'A', 777);
    expect(r.url).toBe('https://cdn/S1/777.png');
    expect(ops).toEqual(['upload:S1/777.png', 'list', 'remove:S1/1.jpg']);
    expect(callsOf(log, 'staff', 'update')[0].args[0]).toEqual({ profile_picture: 'https://cdn/S1/777.png', updated_by: 'A' });
    const upd = log.find((l) => isStaffUpdate(l.table, l.calls))!;
    expect(upd.calls.filter((c) => c.method === 'eq').map((c) => c.args.join('='))).toEqual([
      'id=S1',
      'role_key=driver',
      `category_id=${DRIVER_CATEGORY_ID}`,
    ]);
  });

  it('removes only the new object and 403s, skipping cleanup, when the update matches no row', async () => {
    const ops: string[] = [];
    const storage = {
      upload: (p: unknown) => (ops.push(`upload:${p}`), Promise.resolve({ error: null })),
      getPublicUrl: (p: unknown) => ({ data: { publicUrl: `https://cdn/${p}` } }),
      list: () => (ops.push('list'), Promise.resolve({ data: [{ name: '1.jpg' }], error: null })),
      remove: (p: unknown) => (ops.push(`remove:${(p as string[]).join(',')}`), Promise.resolve({ error: null })),
    };
    const { client } = withRow(FULL_ROW, (t, c) => (isStaffUpdate(t, c) ? { data: [] } : undefined), storage);
    await expect(replaceDriverPhoto(client, 'S1', FILE, 'A', 777)).rejects.toMatchObject({
      status: 403,
      message: "This person's photo is managed in MyJKKN.",
    });
    expect(ops).toEqual(['upload:S1/777.png', 'remove:S1/777.png']);
  });

  it('removes the new object and returns the translated error when the staff update fails', async () => {
    const { client, ops } = photoClient(FULL_ROW, { code: 'P0001', message: 'Not allowed' });
    await expect(replaceDriverPhoto(client, 'S1', FILE, 'A', 777)).rejects.toMatchObject({ status: 422, message: 'Not allowed' });
    expect(ops).toEqual(['upload:S1/777.png', 'remove:S1/777.png']);
  });
});
