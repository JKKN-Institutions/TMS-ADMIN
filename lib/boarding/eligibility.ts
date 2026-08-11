import type { SupabaseClient } from '@supabase/supabase-js';

export interface StaffBoardingEligibility {
  eligible: boolean;
  assignedRouteCount: number;
  /**
   * The staffer's OWN route from the staff master, set only when
   * staff.transport_route_id resolves to an ACTIVE route. Server-side use only —
   * never publish this to the browser; the client has no need for it and must not
   * be able to name a route (see /api/boarding/self-assign).
   */
  routeId: string | null;
  hasRoute: boolean;
}

/**
 * Is this authenticated user an active bus_required staff member, how many active
 * route assignments do they already have, and what is their own route? Wraps the
 * SECURITY DEFINER RPC so proxy.ts, the OAuth callback, and the boarding API routes
 * share one contract — including one implementation of the staff-email match.
 * Fail-closed: any error → not eligible, no route.
 */
export async function getStaffBoardingEligibility(
  supabase: SupabaseClient,
  profileId: string
): Promise<StaffBoardingEligibility> {
  try {
    const { data, error } = await supabase.rpc('tms_staff_boarding_eligibility', { p_profile_id: profileId });
    // Fail-closed is deliberate (below), but an error must not be INDISTINGUISHABLE
    // from a genuine "not eligible" — that is precisely how a revoked EXECUTE grant
    // (42501) silently locked bus_required staff out of login for weeks. Deny, but say why.
    if (error) {
      console.error(
        '[boarding/eligibility] tms_staff_boarding_eligibility failed for %s: %s %s',
        profileId,
        error.code,
        error.message
      );
    }
    const row = (data ?? {}) as {
      eligible?: boolean;
      assigned_route_count?: number;
      route_id?: string | null;
      has_route?: boolean;
    };
    return {
      eligible: !!row.eligible,
      assignedRouteCount: row.assigned_route_count ?? 0,
      routeId: row.route_id ?? null,
      hasRoute: !!row.has_route,
    };
  } catch {
    return { eligible: false, assignedRouteCount: 0, routeId: null, hasRoute: false };
  }
}
