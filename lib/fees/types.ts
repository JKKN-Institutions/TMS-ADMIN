// lib/fees/types.ts
// Shared types + constants for the TMS fees structure module.

export type FeeAudience = 'student' | 'staff';
export type FeeStatus = 'draft' | 'active' | 'archived';
// 'flat'  = one total + term split for everyone matched (the original model).
// 'tiered' = per-year-of-study amounts via year bands (tms_fee_structure_year_band).
// 'stop_wise' = per-boarding-stop annual amount (tms_fee_structure_stop_rate),
// split across a shared percentage schedule (tms_fee_structure_stop_term).
export type FeeMode = 'flat' | 'tiered' | 'stop_wise';

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

// A per-boarding-stop annual amount within a stop_wise fee structure.
export interface FeeStructureStopRate {
  id?: string;
  fee_structure_id?: string;
  stop_id: string;
  annual_amount: number;
  // joined by the API layer for display
  stop_name?: string | null;
  route_id?: string | null;
  route_number?: string | null;
  route_name?: string | null;
  sequence_order?: number | null;
}

// One instalment of a stop_wise structure. Carries a SHARE, not an amount —
// the rupee value depends on the student's stop.
export interface FeeStructureStopTerm {
  id?: string;
  fee_structure_id?: string;
  term_no: number;
  term_label: string | null;
  due_date: string; // 'YYYY-MM-DD'
  share_percent: number;
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
  auto_generate: boolean; // NOT NULL DEFAULT false; the per-structure automation opt-in
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  // derived / joined (added by the API layer)
  transport_year_name?: string | null;
  terms?: FeeStructureTerm[]; // flat structures only
  bands?: FeeStructureYearBand[]; // tiered structures only
  stop_terms?: FeeStructureStopTerm[]; // stop_wise structures only
  stop_rates?: FeeStructureStopRate[]; // stop_wise structures only
}

// The learner lifecycle states billed when a structure leaves lifecycle_statuses
// empty. Centralised so applicability + validation agree.
//
// This is NOT just 'active'. MyJKKN's Bus Pass Request sets bus_required = true
// for new admissions who sit in 'reserved' / 'admitted' / 'account' for months
// before they ever become 'active'. An 'active'-only default silently dropped
// them from EVERY automatic run — applicability filters them out before the
// engine sees them, so they produced no unresolved count and no error, and the
// miss was invisible.
//
// Deliberately EXCLUDED: 'enquiry' / 'enquiry_submitted' (a lead, not an
// admission) and 'rejected' / 'graduated' / 'inactive' (not travelling). An
// overdue transport bill locks the learner out of the portal, so billing
// someone who never enrolled has a real cost.
export const DEFAULT_LIFECYCLE_STATUSES = ['active', 'admitted', 'account', 'reserved'] as const;

// The transport billing categories (seeded in MyJKKN's shared
// billing_categories). Resolved by NAME at write time (ids differ per DB),
// then mapped: audience 'student' -> learner category, 'staff' -> staff one.
//
// This is the RECURRING charge only. Fines bill to
// TRANSPORT_FINE_CATEGORY_NAME below.
export const TRANSPORT_CATEGORY_NAME: Record<FeeAudience, string> = {
  student: 'Transport Maintenance Fee',
  staff: 'Staff Transport Maintenance Fee',
};

// The FINE ledger (tms_fee_fine) deliberately bills under a DIFFERENT category
// from the recurring maintenance fee above, so a penalty and a regular charge
// can be told apart in every category-keyed report.
//
// Do NOT collapse these back into one constant. Until 2026-09-12 both the fee
// generator and lib/fines/create.ts read TRANSPORT_CATEGORY_NAME.student, which
// is why renaming it alone would have moved fines too.
export const TRANSPORT_FINE_CATEGORY_NAME = 'Transport Fee';
