// lib/fees/types.ts
// Shared types + constants for the TMS fees structure module.

export type FeeAudience = 'student' | 'staff';
export type FeeStatus = 'draft' | 'active' | 'archived';
// 'flat'  = one total + term split for everyone matched (the original model).
// 'tiered' = per-year-of-study amounts via year bands (tms_fee_structure_year_band).
export type FeeMode = 'flat' | 'tiered';

export interface FeeStructureTerm {
  id?: string;
  fee_structure_id?: string;
  year_band_id?: string | null; // set when the term belongs to a tiered year band
  term_no: number;
  term_label: string | null;
  amount: number;
  due_date: string; // 'YYYY-MM-DD'
}

// A per-year-of-study amount tier within a tiered fee structure. Each band owns
// its own total + term split, applied to learners whose derived year of study is
// in `study_years` (e.g. {1} or {2,3}).
export interface FeeStructureYearBand {
  id?: string;
  fee_structure_id?: string;
  band_order: number;
  label: string | null;
  study_years: number[];
  total_amount: number;
  split_count: number;
  terms?: FeeStructureTerm[]; // joined by the API layer
}

export interface FeeStructureRow {
  id: string;
  name: string;
  transport_year_id: string;
  audience: FeeAudience;
  fee_mode: FeeMode; // 'flat' (default) or 'tiered' year bands
  // condition dimensions — null/empty = "any"
  institution_ids: string[] | null; // multi-institution; filters learners_profiles/staff.institution_id
  staff_role_keys: string[] | null; // audience='staff' only
  // which learner lifecycle states to bill; null/empty = ['active'] (the default
  // every existing structure uses). Lets one structure bill 'reserved' learners
  // without changing the rule for any other college.
  lifecycle_statuses: string[] | null;
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
  terms?: FeeStructureTerm[]; // flat structures only
  bands?: FeeStructureYearBand[]; // tiered structures only
}

// The learner lifecycle states billed when a structure leaves lifecycle_statuses
// empty. Centralised so applicability + validation agree.
export const DEFAULT_LIFECYCLE_STATUSES = ['active'] as const;

// The two transport billing categories (seeded in MyJKKN's shared
// billing_categories). Resolved by NAME at generation time (ids differ per DB),
// then mapped: audience 'student' -> learner category, 'staff' -> staff category.
export const TRANSPORT_CATEGORY_NAME: Record<FeeAudience, string> = {
  student: 'Transport Fee',
  staff: 'Staff Transport Fee',
};
