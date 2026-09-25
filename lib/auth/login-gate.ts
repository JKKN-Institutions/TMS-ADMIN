/**
 * Login gate for the OAuth callback (app/auth/callback/route.ts): may this
 * non-super-admin enter TMS at all, and where do they land?
 *
 * It must admit everyone the proxy would admit to SOME area, or the callback
 * signs them out before the proxy ever sees them. The proxy's boarding-area
 * fallbacks are in-charge eligibility and route-checker assignment, so both are
 * tried here, in the proxy's order. Every step fails closed.
 */

type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{
    data: unknown;
    error: { code?: string; message: string } | null;
  }>;
};

export interface LoginAccess {
  allowed: boolean;
  /** Admitted as a bus_required staffer via tms_staff_boarding_eligibility. */
  boardingEligible: boolean;
  staffAssignedCount: number;
  /** Admitted as an assigned route checker (Bus Inspection). */
  isChecker: boolean;
}

// The single-arg user_has_permission honours the profiles.role -> custom_roles
// fallback that grants students/drivers their keys.
const AREA_KEYS = [
  'tms.dashboard.view',
  'tms.passenger.self.view',
  'tms.driver.self.view',
  'tms.attendance.scan',
];

export async function resolveLoginAccess(supabase: RpcClient, userId: string): Promise<LoginAccess> {
  const denied: LoginAccess = { allowed: false, boardingEligible: false, staffAssignedCount: 0, isChecker: false };

  for (const key of AREA_KEYS) {
    const { data } = await supabase.rpc('user_has_permission', { permission_name: key });
    if (data) return { ...denied, allowed: true };
  }

  // Bus_required staff have no area permission until they accept the in-charge
  // duty. Admit them via the eligibility oracle so they reach /boarding/in-charge.
  // Logged, never silent: a missing EXECUTE grant (42501, seen in production)
  // would otherwise deny login with no trace.
  const { data: elig, error: eligError } = await supabase.rpc('tms_staff_boarding_eligibility', { p_profile_id: userId });
  if (eligError) {
    console.error('[auth/callback] tms_staff_boarding_eligibility failed for %s: %s %s', userId, eligError.code, eligError.message);
  }
  const e = elig as { eligible?: boolean; assigned_route_count?: number } | null;
  if (e?.eligible) {
    return { ...denied, allowed: true, boardingEligible: true, staffAssignedCount: e.assigned_route_count ?? 0 };
  }

  // Assigned route checkers are identified by assignment, not by a permission
  // (the transport coordinator role carries none). The SECURITY DEFINER RPC only
  // answers for auth.uid() itself.
  const { data: routes, error: checkerError } = await supabase.rpc('tms_route_checker_route_ids', { p_profile_id: userId });
  if (checkerError) {
    console.error('[auth/callback] tms_route_checker_route_ids failed for %s: %s %s', userId, checkerError.code, checkerError.message);
    return denied;
  }
  if (Array.isArray(routes) && routes.length > 0) return { ...denied, allowed: true, isChecker: true };

  return denied;
}

/**
 * Landing page for a non-super-admin whose role home is /dashboard, in the
 * proxy's order: scanner -> checker -> undecided in-charge -> dashboard.
 */
export function loginHome(access: LoginAccess, canScan: boolean): string {
  if (canScan) return '/boarding/attendance';
  if (access.isChecker) return '/boarding/route-check';
  if (access.boardingEligible && access.staffAssignedCount === 0) return '/boarding/in-charge';
  return '/dashboard';
}
