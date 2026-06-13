// lib/fees/types.ts
// Shared types + constants for the TMS fees structure module.

export type FeeAudience = 'student' | 'staff';
export type FeeStatus = 'draft' | 'active' | 'archived';

export interface FeeStructureTerm {
  id?: string;
  fee_structure_id?: string;
  term_no: number;
  term_label: string | null;
  amount: number;
  due_date: string; // 'YYYY-MM-DD'
}

export interface FeeStructureRow {
  id: string;
  name: string;
  transport_year_id: string;
  audience: FeeAudience;
  // condition dimensions — null = "any"
  institution_id: string | null;
  degree_id: string | null;
  department_id: string | null;
  programme_id: string | null; // maps to learners_profiles.program_id
  semester_id: string | null;
  quota_id: string | null;
  staff_role_keys: string[] | null;
  total_amount: number;
  split_count: number;
  status: FeeStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  // derived / joined (added by the API layer)
  transport_year_name?: string | null;
  terms?: FeeStructureTerm[];
}

// The two transport billing categories (seeded in MyJKKN's shared
// billing_categories). Resolved by NAME at generation time (ids differ per DB),
// then mapped: audience 'student' -> learner category, 'staff' -> staff category.
export const TRANSPORT_CATEGORY_NAME: Record<FeeAudience, string> = {
  student: 'Transport Fee',
  staff: 'Staff Transport Fee',
};
