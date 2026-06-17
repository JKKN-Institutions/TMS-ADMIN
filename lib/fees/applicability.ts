// lib/fees/applicability.ts
// Resolve the population a fee structure applies to.
//
// The only academic condition is INSTITUTION, and it is multi-valued
// (institution_ids). An empty/NULL institution_ids means "no institution filter"
// (any institution) — so we add the .in() filter only when institutions are set.
// Staff additionally filter by role via staff_role_keys.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { FeeStructureRow } from './types';

export interface ApplicablePerson {
  person_id: string;
  person_type: 'learner' | 'staff';
  institution_id: string | null;
}

export async function resolveApplicablePeople(
  supabase: SupabaseClient,
  fs: Pick<FeeStructureRow, 'audience' | 'institution_ids' | 'staff_role_keys'>
): Promise<ApplicablePerson[]> {
  const institutionIds = fs.institution_ids ?? [];

  if (fs.audience === 'student') {
    let q = supabase
      .from('learners_profiles')
      .select('id, institution_id')
      .eq('bus_required', true)
      .eq('lifecycle_status', 'active');
    if (institutionIds.length) q = q.in('institution_id', institutionIds);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map((r: { id: string; institution_id: string | null }) => ({
      person_id: r.id,
      person_type: 'learner' as const,
      institution_id: r.institution_id,
    }));
  }

  // audience === 'staff' — filter by institution(s) + role.
  let q = supabase
    .from('staff')
    .select('id, institution_id')
    .eq('bus_required', true)
    .eq('is_active', true);
  if (institutionIds.length) q = q.in('institution_id', institutionIds);
  if (fs.staff_role_keys && fs.staff_role_keys.length) q = q.in('role_key', fs.staff_role_keys);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r: { id: string; institution_id: string | null }) => ({
    person_id: r.id,
    person_type: 'staff' as const,
    institution_id: r.institution_id,
  }));
}
