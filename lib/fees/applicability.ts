// lib/fees/applicability.ts
// Resolve the population a fee structure applies to.
//
// A condition dimension that is NULL means "no filter on that dimension" — so we
// build the .eq() chain CONDITIONALLY, adding a filter only for set dimensions.
// (PostgREST can't express the cross-row ":param IS NULL OR col = :param" idiom
// cleanly, so we do it in the query builder.) Learners carry all academic dims;
// staff carry only institution/department/role, so a staff-audience structure
// only ever filters those.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { FeeStructureRow } from './types';

export interface ApplicablePerson {
  person_id: string;
  person_type: 'learner' | 'staff';
  institution_id: string | null;
}

export async function resolveApplicablePeople(
  supabase: SupabaseClient,
  fs: Pick<
    FeeStructureRow,
    | 'audience' | 'institution_id' | 'degree_id' | 'department_id'
    | 'programme_id' | 'semester_id' | 'quota_id' | 'staff_role_keys'
  >
): Promise<ApplicablePerson[]> {
  if (fs.audience === 'student') {
    let q = supabase
      .from('learners_profiles')
      .select('id, institution_id')
      .eq('bus_required', true)
      .eq('lifecycle_status', 'active');
    if (fs.institution_id) q = q.eq('institution_id', fs.institution_id);
    if (fs.degree_id) q = q.eq('degree_id', fs.degree_id);
    if (fs.department_id) q = q.eq('department_id', fs.department_id);
    if (fs.programme_id) q = q.eq('program_id', fs.programme_id); // programme -> program_id
    if (fs.semester_id) q = q.eq('semester_id', fs.semester_id);
    if (fs.quota_id) q = q.eq('quota_id', fs.quota_id);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map((r: { id: string; institution_id: string | null }) => ({
      person_id: r.id,
      person_type: 'learner' as const,
      institution_id: r.institution_id,
    }));
  }

  // audience === 'staff' — staff lack academic dimensions, so only
  // institution/department/role apply.
  let q = supabase
    .from('staff')
    .select('id, institution_id')
    .eq('bus_required', true)
    .eq('is_active', true);
  if (fs.institution_id) q = q.eq('institution_id', fs.institution_id);
  if (fs.department_id) q = q.eq('department_id', fs.department_id);
  if (fs.staff_role_keys && fs.staff_role_keys.length) q = q.in('role_key', fs.staff_role_keys);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r: { id: string; institution_id: string | null }) => ({
    person_id: r.id,
    person_type: 'staff' as const,
    institution_id: r.institution_id,
  }));
}
