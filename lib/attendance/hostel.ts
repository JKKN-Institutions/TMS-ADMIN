import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Does this learner hold an ACTIVE hostel allocation (MyJKKN hostel module,
 * same database)?
 *
 * GOTCHA: hostel_allocations.learner_id is profiles.id — the learner's LOGIN
 * ACCOUNT — not learners_profiles.id. Pass learners_profiles.profile_id. A
 * learner with no account (profile_id null) cannot be linked and reads false.
 *
 * Fail-soft: a failed read returns false (the rider is tagged Irregular rather
 * than the scan failing — the trip is still saved).
 */
export async function isActiveHosteller(svc: SupabaseClient, profileId: string | null): Promise<boolean> {
  if (!profileId) return false;
  const { data, error } = await svc
    .from('hostel_allocations')
    .select('id')
    .eq('learner_id', profileId)
    .eq('status', 'active')
    .limit(1);
  if (error) {
    console.error('isActiveHosteller lookup failed (non-fatal):', error);
    return false;
  }
  return (data ?? []).length > 0;
}
