/**
 * Current-transport-year staff bill status for many staff at once, for the
 * Route Check roster/outcome. Reuses summarizeStaffBills so "outstanding"
 * means exactly what the staff fee gate means (not cancelled, paid_at null).
 */
import type { createServiceRoleClient } from '@/lib/supabase/server';
import { summarizeStaffBills, type StaffBillRow } from '@/lib/fees/staff-bill-state';

type Svc = ReturnType<typeof createServiceRoleClient>;

export interface StaffBillStatus {
  hasOutstanding: boolean;
  outstandingAmount: number;
  hasBill: boolean;
}

const CHUNK = 150;

/**
 * Map staff.id -> bill status. Every requested id gets an entry (no bill =
 * nothing outstanding). With no current transport year there are no current
 * bills, so everyone reads as "no bill". A cancelled bill does not count as
 * having a bill. Throws on any read error.
 */
export async function staffBillStates(svc: Svc, staffIds: string[]): Promise<Map<string, StaffBillStatus>> {
  const ids = [...new Set(staffIds.filter(Boolean))];
  const out = new Map<string, StaffBillStatus>();
  for (const id of ids) out.set(id, { hasOutstanding: false, outstandingAmount: 0, hasBill: false });
  if (ids.length === 0) return out;

  const { data: year, error: yearErr } = await svc
    .from('tms_transport_year')
    .select('id')
    .eq('is_current', true)
    .limit(1)
    .maybeSingle();
  if (yearErr) throw new Error(`staffBillStates: transport year read failed: ${yearErr.message}`);
  if (!year) return out;
  const yearId = (year as { id: string }).id;

  const byPerson = new Map<string, StaffBillRow[]>();
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { data, error } = await svc
      .from('tms_fee_bill')
      .select('id, amount, status, paid_at, person_id')
      .eq('person_type', 'staff')
      .eq('transport_year_id', yearId)
      .in('person_id', chunk);
    if (error) throw new Error(`staffBillStates: bill read failed: ${error.message}`);
    for (const r of (data ?? []) as (StaffBillRow & { person_id: string })[]) {
      const list = byPerson.get(r.person_id) ?? [];
      list.push(r);
      byPerson.set(r.person_id, list);
    }
  }

  for (const [personId, rows] of byPerson) {
    const s = summarizeStaffBills(rows);
    out.set(personId, { hasOutstanding: s.hasOutstanding, outstandingAmount: s.outstandingAmount, hasBill: rows.some((r) => r.status !== 'cancelled') });
  }
  return out;
}
