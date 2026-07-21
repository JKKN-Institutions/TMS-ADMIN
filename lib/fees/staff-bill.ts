/**
 * Staff transport fee billing.
 *
 * Staff can NEVER be inserted into billing_student_bills — its student_id is
 * NOT NULL with FK fk_billing_student_bills_learner_profile -> learners_profiles(id),
 * and that table is shared with MyJKKN. A staff bill is therefore a tms_fee_bill
 * row carrying the real amount/due_date with billing_student_bill_id = null.
 *
 * Idempotency is enforced by the unique index
 * tms_fee_bill_idem_unique (fee_structure_id, person_id, term_no, transport_year_id),
 * so a re-run cannot double-bill: 23505 is treated as "already billed".
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveApplicablePeople } from './applicability';
import { TRANSPORT_CATEGORY_NAME, type FeeAudience } from './types';

export type StaffBillTerm = { term_no: number; amount: number; due_date: string };

export interface StaffFeeBillRow {
  generation_run_id: string | null;
  fee_structure_id: string;
  transport_year_id: string;
  person_id: string;
  person_type: 'staff';
  term_no: number;
  amount: number;
  due_date: string;
  billing_category_id: string | null;
  billing_student_bill_id: null;
  status: 'staff_deferred';
}

export interface BuildStaffFeeBillRowInput {
  runId: string | null;
  feeStructureId: string;
  transportYearId: string;
  staffId: string;
  categoryId: string | null;
  term: StaffBillTerm;
}

/** Pure: the exact row the fees generate route writes for a staff member. */
export function buildStaffFeeBillRow(input: BuildStaffFeeBillRowInput): StaffFeeBillRow {
  return {
    generation_run_id: input.runId,
    fee_structure_id: input.feeStructureId,
    transport_year_id: input.transportYearId,
    person_id: input.staffId,
    person_type: 'staff',
    term_no: input.term.term_no,
    amount: Number(input.term.amount),
    due_date: input.term.due_date,
    billing_category_id: input.categoryId,
    billing_student_bill_id: null,
    status: 'staff_deferred',
  };
}

/**
 * Find the active staff fee structure that applies to this staffer for the
 * current transport year, and write one tms_fee_bill row per term.
 * Returns 'no_structure' (not an error) when none is configured — that is the
 * expected state until the transport office creates one.
 */
export async function generateStaffBill(
  svc: SupabaseClient,
  opts: { staffId: string; transportYearId: string },
): Promise<{ billingStatus: 'billed' | 'no_structure' | 'error'; inserted: number }> {
  try {
    const { data: structures, error: sErr } = await svc
      .from('tms_fee_structure')
      .select('id, audience, institution_ids, staff_role_keys, lifecycle_statuses')
      .eq('audience', 'staff')
      .eq('status', 'active')
      .eq('transport_year_id', opts.transportYearId);
    if (sErr) return { billingStatus: 'error', inserted: 0 };
    if (!structures?.length) return { billingStatus: 'no_structure', inserted: 0 };

    // Pick the first structure whose applicable population contains this staffer.
    let match: { id: string } | null = null;
    for (const fs of structures) {
      const people = await resolveApplicablePeople(svc, fs);
      if (people.some((p) => p.person_id === opts.staffId)) {
        match = { id: fs.id };
        break;
      }
    }
    if (!match) return { billingStatus: 'no_structure', inserted: 0 };

    const { data: terms, error: tErr } = await svc
      .from('tms_fee_structure_term')
      .select('term_no, amount, due_date')
      .eq('fee_structure_id', match.id)
      .is('year_band_id', null)
      .order('term_no');
    if (tErr) return { billingStatus: 'error', inserted: 0 };
    if (!terms?.length) return { billingStatus: 'no_structure', inserted: 0 };

    const catName = TRANSPORT_CATEGORY_NAME['staff' as FeeAudience];
    const { data: cat } = await svc
      .from('billing_categories')
      .select('id')
      .eq('category_name', catName)
      .maybeSingle();

    let inserted = 0;
    for (const term of terms as StaffBillTerm[]) {
      const row = buildStaffFeeBillRow({
        runId: null,
        feeStructureId: match.id,
        transportYearId: opts.transportYearId,
        staffId: opts.staffId,
        categoryId: cat?.id ?? null,
        term,
      });
      const { error } = await svc.from('tms_fee_bill').insert([row]);
      // 23505 = the idempotency index already covered this term. Not an error.
      if (error && error.code !== '23505') return { billingStatus: 'error', inserted };
      if (!error) inserted++;
    }
    return { billingStatus: 'billed', inserted };
  } catch {
    return { billingStatus: 'error', inserted: 0 };
  }
}
