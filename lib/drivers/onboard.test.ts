import { describe, it, expect } from 'vitest';
import { escapeIlike, findExistingAccount, ensureDriverRole, OnboardError } from './onboard';

type Call = { table: string; method: string; args: unknown[] }[];
type Result = { data?: unknown; error?: unknown };

/** Tiny recording fake: every chain call is logged; awaiting resolves `respond(table, calls)`. */
function fakeClient(respond: (table: string, calls: Call) => Result) {
  const log: { table: string; calls: Call }[] = [];
  const client = {
    from(table: string) {
      const calls: Call = [];
      log.push({ table, calls });
      const b: Record<string, unknown> = {};
      const resolve = () => Promise.resolve({ data: null, error: null, ...respond(table, calls) });
      for (const m of ['select', 'ilike', 'neq', 'eq', 'limit', 'insert']) {
        b[m] = (...args: unknown[]) => {
          calls.push({ table, method: m, args });
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

const methods = (c: Call, m: string) => c.filter((x) => x.method === m);

describe('escapeIlike', () => {
  it('escapes backslash, percent and underscore', () => {
    expect(escapeIlike('a_b%c\\d')).toBe('a\\_b\\%c\\\\d');
  });
  it('leaves ordinary text alone', () => {
    expect(escapeIlike('ravi.kumar@jkkn.ac.in')).toBe('ravi.kumar@jkkn.ac.in');
  });
});

describe('findExistingAccount', () => {
  it('returns null and queries nothing for an empty or blank list', async () => {
    const { client, log } = fakeClient(() => ({ data: [] }));
    expect(await findExistingAccount(client, [])).toBeNull();
    expect(await findExistingAccount(client, ['', '  '])).toBeNull();
    expect(log).toHaveLength(0);
  });

  it('returns staff when a staff row matches', async () => {
    const { client } = fakeClient((t) => ({ data: t === 'staff' ? [{ id: 's1' }] : [] }));
    expect(await findExistingAccount(client, ['a@jkkn.ac.in'])).toBe('staff');
  });

  it('returns profile when only a profile matches', async () => {
    const { client } = fakeClient((t) => ({ data: t === 'profiles' ? [{ id: 'p1' }] : [] }));
    expect(await findExistingAccount(client, ['a@jkkn.ac.in'])).toBe('profile');
  });

  it('returns null when nothing matches, using escaped patterns on staff.email, institution_email and profiles.email', async () => {
    const { client, log } = fakeClient(() => ({ data: [] }));
    expect(await findExistingAccount(client, ['a_b@jkkn.ac.in', 'A_B@jkkn.ac.in'])).toBeNull();
    const ilikes = log.flatMap((l) => methods(l.calls, 'ilike')).map((c) => `${c.table}.${c.args[0]}=${c.args[1]}`);
    expect(new Set(ilikes)).toEqual(
      new Set(['staff.email=a\\_b@jkkn.ac.in', 'staff.institution_email=a\\_b@jkkn.ac.in', 'profiles.email=a\\_b@jkkn.ac.in']),
    );
  });

  it('skips the excluded staff row and profile row', async () => {
    const { client, log } = fakeClient(() => ({ data: [] }));
    await findExistingAccount(client, ['a@jkkn.ac.in'], { staffId: 'S1', profileId: 'P1' });
    const staffNeq = log.filter((l) => l.table === 'staff').flatMap((l) => methods(l.calls, 'neq'));
    const profNeq = log.filter((l) => l.table === 'profiles').flatMap((l) => methods(l.calls, 'neq'));
    expect(staffNeq.length).toBeGreaterThan(0);
    expect(staffNeq.every((c) => c.args[0] === 'id' && c.args[1] === 'S1')).toBe(true);
    expect(profNeq.length).toBeGreaterThan(0);
    expect(profNeq.every((c) => c.args[0] === 'id' && c.args[1] === 'P1')).toBe(true);
  });

  it('fails closed with a 500 OnboardError when a lookup errors', async () => {
    const { client } = fakeClient(() => ({ error: { message: 'boom' } }));
    await expect(findExistingAccount(client, ['a@jkkn.ac.in'])).rejects.toBeInstanceOf(OnboardError);
  });
});

describe('ensureDriverRole', () => {
  it('inserts a primary driver role when the profile has no role row', async () => {
    const { client, log } = fakeClient((t) => {
      if (t === 'custom_roles') return { data: { id: 'role-driver' } };
      return { data: [] };
    });
    await ensureDriverRole(client, 'prof1', 'actor1');
    const inserts = log.filter((l) => l.table === 'user_roles').flatMap((l) => methods(l.calls, 'insert'));
    expect(inserts).toHaveLength(1);
    expect(inserts[0].args[0]).toEqual({ user_id: 'prof1', role_id: 'role-driver', is_primary: true, assigned_by: 'actor1' });
  });

  it('does nothing when the profile already has a role row', async () => {
    const { client, log } = fakeClient((t) => {
      if (t === 'custom_roles') return { data: { id: 'role-driver' } };
      return { data: [{ id: 'ur1' }] };
    });
    await ensureDriverRole(client, 'prof1', 'actor1');
    expect(log.flatMap((l) => methods(l.calls, 'insert'))).toHaveLength(0);
  });

  it('throws when the driver role is missing', async () => {
    const { client } = fakeClient(() => ({ data: null }));
    await expect(ensureDriverRole(client, 'prof1', 'actor1')).rejects.toThrow();
  });
});
