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
 *
 * A CANCELLED money row (billing_student_bills.status = 'cancelled') never
 * clears the gate even if it carries instalments and even if its
 * balance_amount reads as 0 — a voided bill computes `paid == final_amount`,
 * which would otherwise read as instalment-1-settled. Reject it explicitly
 * before the instalment branch, the same way the whole-bill branch already
 * rejects it by requiring `moneyStatus === 'paid'`.
 */
export function isTerm1Paid(
  ledgerStatus: string | null | undefined,
  moneyStatus: string | null | undefined,
  schedule?: Term1Instalments,
): boolean {
  if (ledgerStatus !== 'generated') return false;
  if (moneyStatus === 'cancelled') return false;
  const lines = schedule?.instalments ?? [];
  if (!lines.length) return moneyStatus === 'paid';
  const allocated = allocateWaterfall(schedule?.paid ?? 0, lines);
  return allocated[0] >= lines[0].amount;
}

type LedgerRow = {
  person_id: string;
  status: string | null;
  billing_student_bill_id: string | null;
  term_no: number | null;
};

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

  // A learner may have more than one ledger row for the year (legacy per-term
  // rows, or two applicable fee structures both writing term_no = 1). Only
  // their EARLIEST term_no obligation(s) gate Term-1 access — picking any row
  // would let a paid later term clear a learner whose actual term-1 row is
  // unpaid. Group by person, then keep every row that shares the lowest
  // term_no for that person (there is no secondary ORDER BY, so ties are
  // possible and must not be resolved by whichever row PostgREST happens to
  // return first).
  const rowsByPerson = new Map<string, LedgerRow[]>();
  for (const r of (ledger ?? []) as LedgerRow[]) {
    const list = rowsByPerson.get(r.person_id) ?? [];
    list.push(r);
    rowsByPerson.set(r.person_id, list);
  }

  // Per person: the set of bill ids that ALL must clear for the person to
  // count as Term-1-paid. A tie at the lowest term_no requires EVERY tied row
  // to clear — fail-closed, never "any one of them is enough".
  const neededBillsByPerson = new Map<string, string[]>();
  for (const [personId, rows] of rowsByPerson) {
    const minTermNo = Math.min(...rows.map((r) => r.term_no ?? Infinity));
    const firstTermRows = rows.filter((r) => (r.term_no ?? Infinity) === minTermNo);

    let unclearable = false;
    const billIds: string[] = [];
    for (const r of firstTermRows) {
      if (r.status !== 'generated' || !r.billing_student_bill_id) {
        unclearable = true; // e.g. cancelled/staff_deferred sibling at the same term_no
        continue;
      }
      billIds.push(r.billing_student_bill_id);
    }
    if (unclearable || billIds.length === 0) continue; // never added to `out`
    neededBillsByPerson.set(personId, billIds);
  }

  const billIdToPerson = new Map<string, string>();
  for (const [personId, billIds] of neededBillsByPerson) {
    for (const billId of billIds) billIdToPerson.set(billId, personId);
  }

  const ids = [...billIdToPerson.keys()];

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
      // Silent degradation to the whole-bill rule for every learner in this
      // batch is a real behaviour change — surface it so it shows up in cron
      // logs instead of only in a support ticket.
      console.warn(
        '[term1PaidLearnerIds] billing_bill_instalments missing (42P01) — falling back to the whole-bill rule for this batch',
      );
      break;
    }
    for (const row of (data ?? []) as Array<{ bill_id: string; amount: number | string }>) {
      const list = schedules.get(row.bill_id) ?? [];
      list.push({ amount: Number(row.amount) });
      schedules.set(row.bill_id, list);
    }
  }

  // Per person: how many of their required bills have actually cleared.
  const clearedCount = new Map<string, number>();
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
      const personId = billIdToPerson.get(b.id);
      if (!personId) continue;
      const lines = schedules.get(b.id) ?? [];
      const paid = Math.max(0, Number(b.final_amount ?? 0) - Number(b.balance_amount ?? b.final_amount ?? 0));
      if (isTerm1Paid('generated', b.status, { paid, instalments: lines })) {
        clearedCount.set(personId, (clearedCount.get(personId) ?? 0) + 1);
      }
    }
  }

  for (const [personId, billIds] of neededBillsByPerson) {
    if ((clearedCount.get(personId) ?? 0) === billIds.length) out.add(personId);
  }
  return out;
}
