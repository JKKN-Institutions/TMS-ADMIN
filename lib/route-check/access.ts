/**
 * Route Check access. Checker access comes from the assignment itself (the
 * SQL function tms_route_checker_route_ids, matched on the verified login
 * email), not from a role — see the design spec, "Access".
 */
import type { AuthContext } from '@/lib/api/with-auth';
import type { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { requirePerm } from '@/lib/auth/require-perm';

type Svc = ReturnType<typeof createServiceRoleClient>;

/** Route ids the profile is an active checker for. Throws on a read error (fail closed). */
export async function checkerRouteIds(svc: Svc, profileId: string): Promise<string[]> {
  const { data, error } = await svc.rpc('tms_route_checker_route_ids', { p_profile_id: profileId });
  if (error) throw new Error(`checkerRouteIds failed: ${error.message}`);
  return Array.isArray(data) ? (data as string[]) : [];
}

/** Super admin, Route Check managers, or an active checker assigned to this route. */
export async function canCheckRoute(auth: AuthContext, svc: Svc, routeId: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  if (await requirePerm(auth, TMS_PERMISSIONS.ROUTE_CHECK_MANAGE)) return true;
  const ids = await checkerRouteIds(svc, auth.userId);
  return ids.includes(routeId);
}
