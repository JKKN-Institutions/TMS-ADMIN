// lib/fees/term1.ts
// "Has this learner cleared their FIRST transport term?" — the positive
// precondition for portal access. Distinct from the pre-existing overdue rule:
// this one is fail-CLOSED (never billed = not cleared), so it must never be
// derived from the absence of an overdue row.
//
// The predicate is pure so the truth table is testable without a DB; the batch
// lookup is the only part that touches Supabase.

import type { SupabaseClient } from '@supabase/supabase-js';
import { allocateWaterfall } from './instalments';

// PostgREST serializes `.in()` into the request URL; ~500+ UUIDs overflow the
// Supabase gateway and return HTTP 400, which an unchecked `{ data }` turns into
// a silently EMPTY set — here that would lock every learner out. Chunk + throw.
const IN_CHUNK = 150;

/** A bill's instalment schedule plus how much has been paid against the bill. */
export interface Term1Instalments {
  paid: number;
  /** In (due_date, sequence_no) order — the platform's allocation order. */
  instalments: Array<{ amount: number }>;
}

/**
 * Pure: a learner's first transport obligation is cleared only when the ledger
 * row is live ('generated' — not cancelled by a vacate approval, not
 * staff_deferred) AND the first instalment is settled.
 *
 * A bill WITH instalments is judged on instalment 1 alone, so paying by
 * instalments does not lock the learner out. A bill WITHOUT instalments — every
 * bill written before this change — keeps the old whole-bill rule. Both shapes
 * exist in production until year end.
 */
export function isTerm1Paid(
  ledgerStatus: string | null | undefined,
  moneyStatus: string | null | undefined,
  schedule?: Term1Instalments,
): boolean {
  if (ledgerStatus !== 'generated') return false;
  const lines = schedule?.instalments ?? [];
  if (!lines.length) return moneyStatus === 'paid';
  const allocated = allocateWaterfall(schedule?.paid ?? 0, lines);
  return allocated[0] >= lines[0].amount;
}

/**
 * Every learner whose Term 1 is cleared for the given transport year.
 * Three round trips: the ledger rows, their instalment schedules (if any), then
 * their money rows in chunks.
 */
export async function term1PaidLearnerIds(
  svc: SupabaseClient,
  transportYearId: string,
): Promise<Set<string>> {
  const out = new Set<string>();
  if (!transportYearId) return out;

  const { data: ledger, error } = await svc
    .from('tms_fee_bill')
    .select('person_id, status, billing_student_bill_id, term_no')
    .eq('transport_year_id', transportYearId)
    .eq('person_type', 'learner');
    // No term_no filter: a merged bill is term 1 and a legacy learner's term-1
    // row is term 1, but filtering here would silently drop a learner whose
    // ledger grain changes mid-year. Judge on the bill instead.
  if (error) {
    if ((error as { code?: string }).code === '42P01') return out; // table not created yet
    throw error;
  }

  type LedgerRow = {
    person_id: string;
    status: string | null;
    billing_student_bill_id: string | null;
    term_no: number | null;
  };

  // A learner may have more than one ledger row for the year (legacy per-term
  // rows, or a grain change mid-year). Only their EARLIEST term obligation
  // gates Term-1 access — picking any row would let a paid later term clear a
  // learner whose actual term-1 row is unpaid. Keep the lowest term_no per
  // person.
  const firstTermRow = new Map<string, LedgerRow>();
  for (const r of (ledger ?? []) as LedgerRow[]) {
    const existing = firstTermRow.get(r.person_id);
    if (!existing || (r.term_no ?? Infinity) < (existing.term_no ?? Infinity)) {
      firstTermRow.set(r.person_id, r);
    }
  }

  const byBillId = new Map<string, string>();
  for (const r of firstTermRow.values()) {
    if (r.status === 'generated' && r.billing_student_bill_id) {
      byBillId.set(r.billing_student_bill_id, r.person_id);
    }
  }

  const ids = [...byBillId.keys()];

  // Instalment schedules for the same bills, in the platform's allocation order.
  // Chunked and error-checked for the same reason as the bills below: a quietly
  // empty set here would lock out every instalment-paying learner.
  const schedules = new Map<string, Array<{ amount: number }>>();
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const { data, error: instError } = await svc
      .from('billing_bill_instalments')
      .select('bill_id, amount, due_date, sequence_no')
      .in('bill_id', ids.slice(i, i + IN_CHUNK))
      .order('due_date', { ascending: true })
      .order('sequence_no', { ascending: true });
    if (instError) {
      // 42P01 only: the table genuinely may not exist on an old branch DB.
      if ((instError as { code?: string }).code !== '42P01') throw instError;
      break;
    }
    for (const row of (data ?? []) as Array<{ bill_id: string; amount: number | string }>) {
      const list = schedules.get(row.bill_id) ?? [];
      list.push({ amount: Number(row.amount) });
      schedules.set(row.bill_id, list);
    }
  }

  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const { data, error: chunkError } = await svc
      .from('billing_student_bills')
      .select('id, status, final_amount, balance_amount')
      .in('id', ids.slice(i, i + IN_CHUNK));
    if (chunkError) throw chunkError; // fail loud, never a quietly-empty set
    type MoneyRow = {
      id: string; status: string | null;
      final_amount: number | string | null; balance_amount: number | string | null;
    };
    for (const b of (data ?? []) as MoneyRow[]) {
      const personId = byBillId.get(b.id);
      if (!personId) continue;
      const lines = schedules.get(b.id) ?? [];
      const paid = Math.max(0, Number(b.final_amount ?? 0) - Number(b.balance_amount ?? b.final_amount ?? 0));
      if (isTerm1Paid('generated', b.status, { paid, instalments: lines })) out.add(personId);
    }
  }
  return out;
}
