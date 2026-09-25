import { describe, it, expect, vi } from 'vitest';
import { resolveLoginAccess, loginHome } from './login-gate';

type Answers = {
  perms?: string[];
  elig?: { eligible: boolean; assigned_route_count?: number } | null;
  eligError?: boolean;
  checkerRoutes?: string[] | null;
  checkerError?: boolean;
};

function fakeClient(a: Answers) {
  const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
    if (fn === 'user_has_permission') return { data: (a.perms ?? []).includes(args.permission_name as string), error: null };
    if (fn === 'tms_staff_boarding_eligibility') {
      return a.eligError ? { data: null, error: { code: '42501', message: 'denied' } } : { data: a.elig ?? null, error: null };
    }
    if (fn === 'tms_route_checker_route_ids') {
      return a.checkerError ? { data: null, error: { code: 'XX000', message: 'boom' } } : { data: a.checkerRoutes ?? [], error: null };
    }
    throw new Error(`unexpected rpc ${fn}`);
  });
  return { rpc };
}

const UID = '4dc4e3a2-8735-479f-b506-f60a0aa4e8da';

describe('resolveLoginAccess', () => {
  it('admits an assigned route checker who holds no area permission (the transport coordinator case)', async () => {
    const r = await resolveLoginAccess(fakeClient({ checkerRoutes: ['route-10'] }), UID);
    expect(r).toEqual({ allowed: true, boardingEligible: false, staffAssignedCount: 0, isChecker: true });
  });
  it('asks the checker RPC for the signed-in user', async () => {
    const c = fakeClient({ checkerRoutes: ['route-10'] });
    await resolveLoginAccess(c, UID);
    expect(c.rpc).toHaveBeenCalledWith('tms_route_checker_route_ids', { p_profile_id: UID });
  });
  it('still refuses someone with no permission, no eligibility and no checker routes', async () => {
    const r = await resolveLoginAccess(fakeClient({}), UID);
    expect(r.allowed).toBe(false);
  });
  it('fails closed when the checker RPC errors', async () => {
    const r = await resolveLoginAccess(fakeClient({ checkerError: true }), UID);
    expect(r.allowed).toBe(false);
  });
  it('admits on any area permission without asking eligibility or checker', async () => {
    const c = fakeClient({ perms: ['tms.attendance.scan'], checkerRoutes: ['x'] });
    const r = await resolveLoginAccess(c, UID);
    expect(r).toEqual({ allowed: true, boardingEligible: false, staffAssignedCount: 0, isChecker: false });
    expect(c.rpc).not.toHaveBeenCalledWith('tms_staff_boarding_eligibility', expect.anything());
    expect(c.rpc).not.toHaveBeenCalledWith('tms_route_checker_route_ids', expect.anything());
  });
  it('admits an eligible bus_required staffer via eligibility, as before', async () => {
    const r = await resolveLoginAccess(fakeClient({ elig: { eligible: true, assigned_route_count: 0 } }), UID);
    expect(r).toEqual({ allowed: true, boardingEligible: true, staffAssignedCount: 0, isChecker: false });
  });
  it('falls through to the checker check when eligibility errors', async () => {
    const r = await resolveLoginAccess(fakeClient({ eligError: true, checkerRoutes: ['r'] }), UID);
    expect(r.allowed).toBe(true);
    expect(r.isChecker).toBe(true);
  });
});

describe('loginHome (non-super-admin whose role home is /dashboard)', () => {
  const base = { allowed: true, boardingEligible: false, staffAssignedCount: 0, isChecker: false };
  it('a scanner lands on attendance', () => {
    expect(loginHome({ ...base, isChecker: true }, true)).toBe('/boarding/attendance');
  });
  it('a checker (not a scanner) lands on Route Check', () => {
    expect(loginHome({ ...base, isChecker: true }, false)).toBe('/boarding/route-check');
  });
  it('a checker is never sent to the in-charge toggle', () => {
    expect(loginHome({ ...base, isChecker: true, boardingEligible: true }, false)).toBe('/boarding/route-check');
  });
  it('an undecided eligible staffer lands on the in-charge toggle', () => {
    expect(loginHome({ ...base, boardingEligible: true }, false)).toBe('/boarding/in-charge');
  });
  it('everyone else stays on the dashboard', () => {
    expect(loginHome(base, false)).toBe('/dashboard');
    expect(loginHome({ ...base, boardingEligible: true, staffAssignedCount: 2 }, false)).toBe('/dashboard');
  });
});
