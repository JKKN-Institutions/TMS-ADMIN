/**
 * Load one route check and decide what the caller may do with it.
 * Read: super admin, manage permission, or an active checker of its route.
 * Mutate: additionally the check must be a draft and belong to the caller
 * (super admin excepted) — a submitted check never gains rows.
 */
import type { AuthContext } from '@/lib/api/with-auth';
import type { createServiceRoleClient } from '@/lib/supabase/server';
import { canCheckRoute } from './access';
import type { CheckLeg, CheckStatus } from './types';

type Svc = ReturnType<typeof createServiceRoleClient>;

/** /api/boarding/route-check/<checkId>/... → checkId */
export const checkIdFromUrl = (url: string) => new URL(url).pathname.split('/').filter(Boolean)[3] ?? '';

export interface CheckRow {
  id: string; route_id: string; vehicle_id: string | null; checker_id: string; check_date: string; leg: CheckLeg;
  status: CheckStatus; headcount: number | null; unknown_count: number | null; notes: string | null;
  started_at: string; submitted_at: string | null;
}
export const CHECK_COLS = 'id, route_id, vehicle_id, checker_id, check_date, leg, status, headcount, unknown_count, notes, started_at, submitted_at';

export type CheckLoad = { ok: true; check: CheckRow } | { ok: false; status: 403 | 404 | 409 | 500; error: string };

export async function loadCheckForUser(auth: AuthContext, svc: Svc, checkId: string, mode: 'read' | 'mutate'): Promise<CheckLoad> {
  const { data, error } = await svc.from('tms_route_check').select(CHECK_COLS).eq('id', checkId).maybeSingle();
  if (error) {
    console.error('route-check load error:', error);
    return { ok: false, status: 500, error: 'Failed to load route check' };
  }
  if (!data) return { ok: false, status: 404, error: 'Route check not found' };
  const check = data as CheckRow;
  if (!(await canCheckRoute(auth, svc, check.route_id))) return { ok: false, status: 403, error: 'Forbidden' };
  if (mode === 'mutate') {
    if (check.status !== 'draft') return { ok: false, status: 409, error: 'This check is already submitted' };
    if (check.checker_id !== auth.userId && !auth.isSuperAdmin) {
      return { ok: false, status: 403, error: 'Only the checker who started this check can change it' };
    }
  }
  return { ok: true, check };
}
