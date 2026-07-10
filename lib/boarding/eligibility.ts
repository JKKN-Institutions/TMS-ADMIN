import type { SupabaseClient } from '@supabase/supabase-js';

export interface StaffBoardingEligibility {
  eligible: boolean;
  assignedRouteCount: number;
}

/**
 * Is this authenticated user an active bus_required staff member (and how many
 * active route assignments do they already have)? Wraps the SECURITY DEFINER RPC
 * so proxy.ts, the OAuth callback, and the boarding API routes share one contract.
 * Fail-closed: any error → not eligible.
 */
export async function getStaffBoardingEligibility(
  supabase: SupabaseClient,
  profileId: string
): Promise<StaffBoardingEligibility> {
  try {
    const { data } = await supabase.rpc('tms_staff_boarding_eligibility', { p_profile_id: profileId });
    const row = (data ?? {}) as { eligible?: boolean; assigned_route_count?: number };
    return { eligible: !!row.eligible, assignedRouteCount: row.assigned_route_count ?? 0 };
  } catch {
    return { eligible: false, assignedRouteCount: 0 };
  }
}
