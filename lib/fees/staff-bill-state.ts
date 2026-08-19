/**
 * Does this staffer owe transport fees right now?
 *
 * The whole fee gate hangs off this one question: it decides whether the
 * boarding portal opens, whether the willingness toggle is offered, and whether
 * the pledge screen appears. So the rule lives in a pure function with tests
 * rather than being re-expressed as a filter at each call site, where the three
 * copies would eventually disagree.
 *
 * A bill is OUTSTANDING when it is not cancelled and not paid. `paid_at` is the
 * authority on settlement, not `status` -- the admin mark-paid path writes
 * paid_at and leaves the status as the historical record of how the bill arose.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface StaffBillRow {
  id: string;
  amount: number;
  status: string;
  paid_at: string | null;
}

export interface StaffBillState {
  hasOutstanding: boolean;
  outstandingAmount: number;
  billIds: string[];
}

export function summarizeStaffBills(rows: StaffBillRow[]): StaffBillState {
  const outstanding = rows.filter((r) => r.status !== 'cancelled' && r.paid_at === null);
  // `amount` is a Postgres numeric, which supabase-js hands back as a STRING.
  // Number() here is not defensive noise -- summing the raw values concatenates.
  const outstandingAmount = outstanding.reduce((sum, r) => sum + Number(r.amount ?? 0), 0);
  return {
    hasOutstanding: outstanding.length > 0,
    outstandingAmount,
    billIds: outstanding.map((r) => r.id),
  };
}

/**
 * The staffer's current-year staff bills, summarized.
 *
 * Throws on a query error rather than returning "nothing outstanding". A
 * swallowed error here opens the portal to someone who owes money, which is the
 * exact leak this feature exists to close -- failing loudly is the safe default.
 */
export async function loadStaffBillState(
  svc: SupabaseClient,
  opts: { personId: string; transportYearId: string },
): Promise<StaffBillState> {
  const { data, error } = await svc
    .from('tms_fee_bill')
    .select('id, amount, status, paid_at')
    .eq('person_id', opts.personId)
    .eq('person_type', 'staff')
    .eq('transport_year_id', opts.transportYearId);
  if (error) throw new Error(`loadStaffBillState failed: ${error.message}`);
  return summarizeStaffBills((data ?? []) as StaffBillRow[]);
}
