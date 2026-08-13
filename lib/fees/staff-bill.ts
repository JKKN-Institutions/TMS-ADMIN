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
import { resolvePersonTerms, type StopScheduleTerm } from './resolve-terms';
import { TRANSPORT_CATEGORY_NAME, type FeeAudience, type FeeMode } from './types';

export type StaffBillTerm = { term_no: number; amount: number; due_date: string };

/** Staff bills are either a coverage record (cron) or a real payable bill (admin run). */
export type StaffBillStatus = 'staff_deferred' | 'generated';

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
  status: StaffBillStatus;
}

export interface BuildStaffFeeBillRowInput {
  runId: string | null;
  feeStructureId: string;
  transportYearId: string;
  staffId: string;
  categoryId: string | null;
  term: StaffBillTerm;
  /** Defaults to 'staff_deferred' so the in-charge enforcement cron is unchanged. */
  status?: StaffBillStatus;
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
    status: input.status ?? 'staff_deferred',
  };
}

/**
 * Why a staffer cannot be billed. Each maps to a DIFFERENT fix by a different
 * person, so they must stay distinct rather than collapse into 'no_structure':
 * 'no_structure' is the transport office's job, 'no_stop' is the staffer's own
 * profile, and 'no_stop_rate' means their stop is missing from the rate sheet.
 */
export type StaffUnbillableReason = 'no_structure' | 'no_stop' | 'no_stop_rate' | 'error';

export type StaffBillPlan =
  | { billable: true; feeStructureId: string; terms: StaffBillTerm[] }
  | { billable: false; reason: StaffUnbillableReason };

/**
 * Can this staffer actually be billed right now?
 *
 * Split out of generateStaffBill so the in-charge enforcement cron can PROBE
 * before it revokes anything. The write path and the probe share this one
 * resolver, so they can never disagree about what "billable" means — the
 * alternative, duplicating the lookup, is how a staffer loses their in-charge
 * role for a bill that was never going to generate.
 *
 * 'no_structure' is the expected state until the transport office configures a
 * staff fee structure WITH terms; 'error' means the lookup itself failed and
 * the caller must not treat the staffer as un-billable.
 *
 * Both fee modes are handled. Reading ONLY the flat term table was a real bug:
 * the live staff structure is stop_wise, so every lookup returned 'no_structure'
 * and every in-charge removal was blocked for a structure that was in fact fully
 * priced (463 stops). Staff have no year of study, so 'tiered' has no meaning
 * for them and falls through to the flat terms — which is what a tiered
 * structure's un-banded rows already are.
 */
export async function resolveStaffBillPlan(
  svc: SupabaseClient,
  opts: { staffId: string; transportYearId: string },
): Promise<StaffBillPlan> {
  try {
    const { data: structures, error: sErr } = await svc
      .from('tms_fee_structure')
      .select('id, fee_mode, audience, institution_ids, staff_role_keys, lifecycle_statuses')
      .eq('audience', 'staff')
      .eq('status', 'active')
      .eq('transport_year_id', opts.transportYearId);
    if (sErr) return { billable: false, reason: 'error' };
    if (!structures?.length) return { billable: false, reason: 'no_structure' };

    // Pick the first structure whose applicable population contains this staffer.
    let match: { id: string; fee_mode: FeeMode } | null = null;
    for (const fs of structures) {
      const people = await resolveApplicablePeople(svc, fs);
      if (people.some((p) => p.person_id === opts.staffId)) {
        match = { id: fs.id, fee_mode: (fs.fee_mode ?? 'flat') as FeeMode };
        break;
      }
    }
    if (!match) return { billable: false, reason: 'no_structure' };

    if (match.fee_mode === 'stop_wise') {
      return await resolveStopWisePlan(svc, match.id, opts.staffId);
    }

    const { data: terms, error: tErr } = await svc
      .from('tms_fee_structure_term')
      .select('term_no, amount, due_date')
      .eq('fee_structure_id', match.id)
      .is('year_band_id', null)
      .order('term_no');
    if (tErr) return { billable: false, reason: 'error' };
    if (!terms?.length) return { billable: false, reason: 'no_structure' };

    return { billable: true, feeStructureId: match.id, terms: terms as StaffBillTerm[] };
  } catch {
    return { billable: false, reason: 'error' };
  }
}

/**
 * Stop-wise: the amount comes from the staffer's OWN boarding stop.
 *
 * The share-to-amount arithmetic is delegated to resolvePersonTerms — the same
 * function that prices every student — so a staff bill and a student bill for
 * the same stop can never drift apart. Duplicating splitAnnual here would be
 * shorter and would silently diverge the first time rounding changes.
 */
async function resolveStopWisePlan(
  svc: SupabaseClient,
  feeStructureId: string,
  staffId: string,
): Promise<StaffBillPlan> {
  const { data: schedule, error: schErr } = await svc
    .from('tms_fee_structure_stop_term')
    .select('term_no, term_label, due_date, share_percent')
    .eq('fee_structure_id', feeStructureId)
    .order('term_no');
  if (schErr) return { billable: false, reason: 'error' };
  // No instalment schedule is a structure-level configuration gap, not a
  // per-person one — resolvePersonTerms would throw on an empty schedule.
  if (!schedule?.length) return { billable: false, reason: 'no_structure' };

  const { data: staffRow, error: stErr } = await svc
    .from('staff')
    .select('transport_stop_id')
    .eq('id', staffId)
    .maybeSingle();
  if (stErr) return { billable: false, reason: 'error' };

  const stopId = (staffRow?.transport_stop_id as string | null) ?? null;
  if (!stopId) return { billable: false, reason: 'no_stop' };

  const { data: rate, error: rErr } = await svc
    .from('tms_fee_structure_stop_rate')
    .select('annual_amount')
    .eq('fee_structure_id', feeStructureId)
    .eq('stop_id', stopId)
    .maybeSingle();
  if (rErr) return { billable: false, reason: 'error' };
  // A missing row means unpriced; an annual_amount of 0 is a real free stop and
  // IS billable, so test for the row's absence rather than for falsiness.
  if (!rate) return { billable: false, reason: 'no_stop_rate' };

  const stopTerms: StopScheduleTerm[] = (schedule as Array<Record<string, unknown>>).map((t) => ({
    term_no: Number(t.term_no),
    term_label: (t.term_label as string | null) ?? null,
    due_date: String(t.due_date),
    share_percent: Number(t.share_percent),
  }));

  const outcome = resolvePersonTerms(
    { admission_year: null, transport_stop_id: stopId },
    {
      feeMode: 'stop_wise',
      currentYear: null,
      flatTerms: [],
      bands: [],
      stopTerms,
      stopRateByStopId: new Map([[stopId, Number(rate.annual_amount)]]),
    },
  );
  if (!outcome.ok) {
    return { billable: false, reason: outcome.reason === 'no_stop' ? 'no_stop' : 'no_stop_rate' };
  }

  return {
    billable: true,
    feeStructureId,
    terms: outcome.terms.map((t) => ({
      term_no: t.term_no,
      amount: t.amount,
      due_date: t.due_date,
    })),
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
): Promise<{ billingStatus: 'billed' | StaffUnbillableReason; inserted: number }> {
  try {
    const plan = await resolveStaffBillPlan(svc, opts);
    if (!plan.billable) return { billingStatus: plan.reason, inserted: 0 };

    const catName = TRANSPORT_CATEGORY_NAME['staff' as FeeAudience];
    const { data: cat } = await svc
      .from('billing_categories')
      .select('id')
      .eq('category_name', catName)
      .maybeSingle();

    let inserted = 0;
    for (const term of plan.terms) {
      const row = buildStaffFeeBillRow({
        runId: null,
        feeStructureId: plan.feeStructureId,
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
