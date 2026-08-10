// lib/fees/term1.ts
// "Has this learner cleared their FIRST transport term?" — the positive
// precondition for portal access. Distinct from the pre-existing overdue rule:
// this one is fail-CLOSED (never billed = not cleared), so it must never be
// derived from the absence of an overdue row.
//
// The predicate is pure so the truth table is testable without a DB; the batch
// lookup is the only part that touches Supabase.

import type { SupabaseClient } from '@supabase/supabase-js';

// PostgREST serializes `.in()` into the request URL; ~500+ UUIDs overflow the
// Supabase gateway and return HTTP 400, which an unchecked `{ data }` turns into
// a silently EMPTY set — here that would lock every learner out. Chunk + throw.
const IN_CHUNK = 150;

/**
 * Pure: a learner's Term-1 obligation is cleared only when the ledger row is
 * live ('generated' — not cancelled by a vacate approval, not staff_deferred)
 * AND the money row in billing_student_bills is fully 'paid'. Partially paid
 * does not clear it.
 */
export function isTerm1Paid(
  ledgerStatus: string | null | undefined,
  moneyStatus: string | null | undefined,
): boolean {
  return ledgerStatus === 'generated' && moneyStatus === 'paid';
}

/**
 * Every learner whose Term 1 is cleared for the given transport year.
 * Two round trips: the ledger rows, then their money rows in chunks.
 */
export async function term1PaidLearnerIds(
  svc: SupabaseClient,
  transportYearId: string,
): Promise<Set<string>> {
  const out = new Set<string>();
  if (!transportYearId) return out;

  const { data: ledger, error } = await svc
    .from('tms_fee_bill')
    .select('person_id, status, billing_student_bill_id')
    .eq('transport_year_id', transportYearId)
    .eq('person_type', 'learner')
    .eq('term_no', 1);
  if (error) {
    if ((error as { code?: string }).code === '42P01') return out; // table not created yet
    throw error;
  }

  type LedgerRow = { person_id: string; status: string | null; billing_student_bill_id: string | null };
  const byBillId = new Map<string, string>();
  for (const r of (ledger ?? []) as LedgerRow[]) {
    if (r.status === 'generated' && r.billing_student_bill_id) {
      byBillId.set(r.billing_student_bill_id, r.person_id);
    }
  }

  const ids = [...byBillId.keys()];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const { data, error: chunkError } = await svc
      .from('billing_student_bills')
      .select('id, status')
      .in('id', ids.slice(i, i + IN_CHUNK));
    if (chunkError) throw chunkError; // fail loud, never a quietly-empty set
    for (const b of (data ?? []) as { id: string; status: string | null }[]) {
      const personId = byBillId.get(b.id);
      if (personId && isTerm1Paid('generated', b.status)) out.add(personId);
    }
  }
  return out;
}
