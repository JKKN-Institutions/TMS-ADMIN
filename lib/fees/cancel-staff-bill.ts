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
 *
 * `dueFrom`/`dueTo` scope the cancellation to a bill's `due_date`. This
 * matters: a caller with no window cancels EVERY uncancelled, unpaid
 * current-year bill regardless of which term it belongs to -- so a single
 * passed month used to clear every term at once, and the idempotency index
 * on (fee_structure_id, person_id, term_no, transport_year_id) -- which does
 * NOT include status -- then permanently blocked that term from ever being
 * billed again that year. Passing the verdict month's window scopes the
 * cancel to only the term(s) actually due in that month.
 *
 * The window is OPTIONAL and, when omitted, preserves the old whole-year
 * behaviour -- no other caller's meaning changes.
 *
 * MEASURED CONSTRAINT (2026-08-18, will confuse the next reader): the live
 * staff fee structure currently produces exactly ONE term per staffer per
 * year (all 38 staff bills are term_no = 1, due 2026-08-31). So with today's
 * configuration this change makes the CODE month-aware while the observable
 * behaviour stays effectively once-per-year, until the transport office
 * configures per-month terms in the fee structure. This function does not
 * (and should not) try to synthesise a per-month term_no itself -- that is
 * lib/fees/staff-bill.ts's concern, and it is shared by the rest of the fees
 * module.
 */
export async function cancelStaffBills(
  svc: SupabaseClient,
  opts: { personId: string; transportYearId: string; dueFrom?: string; dueTo?: string },
): Promise<{ cancelled: number }> {
  let query = svc
    .from('tms_fee_bill')
    .update({ status: 'cancelled' })
    .eq('person_id', opts.personId)
    .eq('person_type', 'staff')
    .eq('transport_year_id', opts.transportYearId)
    .neq('status', 'cancelled')
    .is('paid_at', null);
  if (opts.dueFrom) query = query.gte('due_date', opts.dueFrom);
  if (opts.dueTo) query = query.lte('due_date', opts.dueTo);
  const { data, error } = await query.select('id');
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
