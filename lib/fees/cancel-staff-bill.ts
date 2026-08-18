/**
 * The two things a month-end verdict can do to a staff transport bill.
 *
 * Bills are CANCELLED, never deleted -- the Vacate module set this precedent and
 * it matters here for the same reason: a cancelled bill is evidence that duty
 * was performed, and a deleted one is evidence of nothing.
 *
 * Both functions THROW on a query error rather than returning a count of zero.
 * A swallowed failure here is the worst outcome the feature can produce: the
 * verdict row would record "bill cancelled" while the staffer still owes money,
 * and nobody would find out until they were locked out of the portal.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Cancel this staffer's outstanding current-year transport bills.
 *
 * `paid_at is null` is not optional. Cancelling a bill someone already paid
 * would erase the record of their payment and hand back a fee they settled.
 */
export async function cancelStaffBills(
  svc: SupabaseClient,
  opts: { personId: string; transportYearId: string },
): Promise<{ cancelled: number }> {
  const { data, error } = await svc
    .from('tms_fee_bill')
    .update({ status: 'cancelled' })
    .eq('person_id', opts.personId)
    .eq('person_type', 'staff')
    .eq('transport_year_id', opts.transportYearId)
    .neq('status', 'cancelled')
    .is('paid_at', null)
    .select('id');
  if (error) throw new Error(`cancelStaffBills failed: ${error.message}`);
  return { cancelled: (data ?? []).length };
}

/**
 * Promote held bills to payable ones.
 *
 * 'staff_deferred' means "raised, but not yet something the office will collect".
 * 'generated' is the payable state the rest of the fees module recognises, and
 * the state the admin mark-paid path expects to find.
 */
export async function makeStaffBillsPayable(
  svc: SupabaseClient,
  opts: { personId: string; transportYearId: string },
): Promise<{ generated: number }> {
  const { data, error } = await svc
    .from('tms_fee_bill')
    .update({ status: 'generated' })
    .eq('person_id', opts.personId)
    .eq('person_type', 'staff')
    .eq('transport_year_id', opts.transportYearId)
    .eq('status', 'staff_deferred')
    .is('paid_at', null)
    .select('id');
  if (error) throw new Error(`makeStaffBillsPayable failed: ${error.message}`);
  return { generated: (data ?? []).length };
}
