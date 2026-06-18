// lib/fees/applicability.ts
// Resolve the population a fee structure applies to.
//
// Conditions: INSTITUTION (multi-valued institution_ids; empty/NULL = any) and,
// for learners, LIFECYCLE STATUS (lifecycle_statuses; empty/NULL = ['active'],
// the default every existing structure uses). Staff additionally filter by role.
//
// For learners we also resolve each person's ADMISSION YEAR (the integer
// admission_years.year) so tiered structures can derive year of study downstream
// (see lib/fees/year-of-study.ts). This is harmless for flat structures, which
// simply ignore it.

import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_LIFECYCLE_STATUSES, type FeeStructureRow } from './types';

export interface ApplicablePerson {
  person_id: string;
  person_type: 'learner' | 'staff';
  institution_id: string | null;
  admission_year: number | null; // learners only (null for staff / missing data)
}

export type ApplicabilityFilter = Pick<
  FeeStructureRow,
  'audience' | 'institution_ids' | 'staff_role_keys' | 'lifecycle_statuses'
>;

export async function resolveApplicablePeople(
  supabase: SupabaseClient,
  fs: ApplicabilityFilter
): Promise<ApplicablePerson[]> {
  const institutionIds = fs.institution_ids ?? [];

  if (fs.audience === 'student') {
    const statuses =
      fs.lifecycle_statuses && fs.lifecycle_statuses.length
        ? fs.lifecycle_statuses
        : [...DEFAULT_LIFECYCLE_STATUSES];

    let q = supabase
      .from('learners_profiles')
      .select('id, institution_id, admission_year_id')
      .eq('bus_required', true)
      .in('lifecycle_status', statuses);
    if (institutionIds.length) q = q.in('institution_id', institutionIds);
    const { data, error } = await q;
    if (error) throw error;

    const rows = (data ?? []) as Array<{
      id: string;
      institution_id: string | null;
      admission_year_id: string | null;
    }>;

    // Resolve admission_year_id -> admission_years.year in one batch query.
    const admIds = [...new Set(rows.map((r) => r.admission_year_id).filter(Boolean) as string[])];
    const yearById = new Map<string, number>();
    if (admIds.length) {
      const { data: ay } = await supabase.from('admission_years').select('id, year').in('id', admIds);
      for (const a of (ay ?? []) as Array<{ id: string; year: number | null }>) {
        if (a.year != null) yearById.set(a.id, Number(a.year));
      }
    }

    return rows.map((r) => ({
      person_id: r.id,
      person_type: 'learner' as const,
      institution_id: r.institution_id,
      admission_year: r.admission_year_id ? yearById.get(r.admission_year_id) ?? null : null,
    }));
  }

  // audience === 'staff' — filter by institution(s) + role. Staff have no
  // lifecycle_status / year of study (tiering is learners-only).
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
    admission_year: null,
  }));
}
