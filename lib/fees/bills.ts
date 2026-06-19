// lib/fees/bills.ts
// Read layer for the Bill Management module. Transport billing is LEDGER-DRIVEN:
// tms_fee_bill is the hub (it carries transport_year_id, fee_structure_id,
// person_type, term_no AND billing_student_bill_id), LEFT-joined to the real
// money row in MyJKKN's shared billing_student_bills for learners. Staff ledger
// rows are 'staff_deferred' (no money row). Read-only — nothing here writes.

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveApplicablePeople } from './applicability';
import { currentYearOf, deriveStudyYear, bandForYear } from './year-of-study';

export type BillStatus =
  | 'paid' | 'partially_paid' | 'unpaid' | 'overdue' | 'staff_deferred' | 'unknown';

export interface TransportBillRow {
  id: string; // tms_fee_bill.id
  person_id: string;
  person_type: 'learner' | 'staff';
  person_name: string;
  code: string | null;
  institution_id: string | null;
  institution_name: string | null;
  structure_id: string;
  structure_name: string | null;
  transport_year_id: string;
  year_name: string | null;
  term_no: number;
  amount: number;
  due_date: string;
  paid_amount: number;
  pending_amount: number;
  status: BillStatus;
  payment_date: string | null;
  billing_student_bill_id: string | null;
}

export interface BillSummary {
  totalBilledAmount: number;
  collectedAmount: number;
  pendingAmount: number;
  overdueAmount: number;
  overdueCount: number;
  billedPeople: number;
  staffDeferred: number;
  unbilledCount: number; // year-specific; 0 when not applicable
}

export interface UnbilledPerson {
  person_id: string;
  person_type: 'learner' | 'staff';
  person_name: string;
  code: string | null;
  institution_id: string | null;
  institution_name: string | null;
}

const emptySummary = (): BillSummary => ({
  totalBilledAmount: 0,
  collectedAmount: 0,
  pendingAmount: 0,
  overdueAmount: 0,
  overdueCount: 0,
  billedPeople: 0,
  staffDeferred: 0,
  unbilledCount: 0,
});

const uniq = <T,>(xs: (T | null | undefined)[]): T[] =>
  [...new Set(xs.filter((x): x is T => x != null))];

const today = () => new Date().toISOString().slice(0, 10);

// PostgREST serializes `.in('col', ids)` into the request URL. A few hundred
// UUIDs overflow the Supabase API gateway's request-size limit (measured on this
// project: 500 ids → 200 OK, 768 ids → HTTP 400 "Bad Request"), which supabase-js
// surfaces as { data: null, error }. Left UNCHECKED that yields an empty map and
// silently mislabels every bill 'unknown'. So: batch ids into small chunks AND
// throw on error (fail loud) instead of returning a quietly-wrong result.
const IN_CHUNK = 150;

async function selectByIds<T = Record<string, unknown>>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  ids: string[],
  idColumn = 'id'
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .in(idColumn, ids.slice(i, i + IN_CHUNK));
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
  }
  return out;
}

// Resolve learner/staff display names + their institution_id in two batch queries.
async function resolvePeople(
  supabase: SupabaseClient,
  learnerIds: string[],
  staffIds: string[]
): Promise<Map<string, { name: string; code: string | null; institution_id: string | null }>> {
  const map = new Map<string, { name: string; code: string | null; institution_id: string | null }>();
  if (learnerIds.length) {
    const data = await selectByIds<{
      id: string;
      first_name: string | null;
      last_name: string | null;
      roll_number: string | null;
      institution_id: string | null;
    }>(supabase, 'learners_profiles', 'id, first_name, last_name, roll_number, institution_id', learnerIds);
    for (const r of data) {
      map.set(r.id, {
        name: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || '—',
        code: r.roll_number ?? null,
        institution_id: r.institution_id ?? null,
      });
    }
  }
  if (staffIds.length) {
    const data = await selectByIds<{
      id: string;
      first_name: string | null;
      last_name: string | null;
      staff_id: string | null;
      institution_id: string | null;
    }>(supabase, 'staff', 'id, first_name, last_name, staff_id, institution_id', staffIds);
    for (const r of data) {
      map.set(r.id, {
        name: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || '—',
        code: r.staff_id ?? null,
        institution_id: r.institution_id ?? null,
      });
    }
  }
  return map;
}

async function nameMapFor(
  supabase: SupabaseClient,
  table: string,
  nameCol: string,
  ids: string[]
): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  if (!ids.length) return m;
  // Dynamic select string → cast past supabase-js's literal-only type parser.
  const data = await selectByIds<Record<string, unknown>>(supabase, table, `id, ${nameCol}`, ids);
  for (const r of data) {
    m.set(r.id as string, (r[nameCol] as string) ?? '');
  }
  return m;
}

/**
 * Compose transport bill rows + KPI summary from the tms_fee_bill ledger.
 * Pass a transportYearId to scope; omit for all years.
 */
export async function loadTransportBills(
  supabase: SupabaseClient,
  opts: { transportYearId?: string | null } = {}
): Promise<{ summary: BillSummary; rows: TransportBillRow[] }> {
  let q = supabase.from('tms_fee_bill').select('*');
  if (opts.transportYearId) q = q.eq('transport_year_id', opts.transportYearId);
  const { data: ledger, error } = await q;
  if (error) {
    // 42P01 = table not created yet → render empty rather than 500.
    if (error.code === '42P01') return { summary: emptySummary(), rows: [] };
    throw error;
  }
  const raw = (ledger ?? []) as Array<Record<string, unknown>>;
  if (!raw.length) return { summary: emptySummary(), rows: [] };

  const learnerIds = uniq(raw.filter((r) => r.person_type === 'learner').map((r) => r.person_id as string));
  const staffIds = uniq(raw.filter((r) => r.person_type === 'staff').map((r) => r.person_id as string));
  const billIds = uniq(raw.map((r) => r.billing_student_bill_id as string | null));
  const structureIds = uniq(raw.map((r) => r.fee_structure_id as string | null));
  const yearIds = uniq(raw.map((r) => r.transport_year_id as string | null));

  const peopleMap = await resolvePeople(supabase, learnerIds, staffIds);

  const billMap = new Map<string, { final: number; balance: number; status: string; payment_date: string | null }>();
  if (billIds.length) {
    const data = await selectByIds<{
      id: string;
      final_amount: number | string | null;
      balance_amount: number | string | null;
      status: string | null;
      payment_date: string | null;
    }>(supabase, 'billing_student_bills', 'id, final_amount, balance_amount, status, payment_date', billIds);
    for (const b of data) {
      billMap.set(b.id, {
        final: Number(b.final_amount ?? 0),
        balance: Number(b.balance_amount ?? 0),
        status: b.status ?? 'unpaid',
        payment_date: b.payment_date ?? null,
      });
    }
  }

  const structureMap = await nameMapFor(supabase, 'tms_fee_structure', 'name', structureIds);
  const yearMap = await nameMapFor(supabase, 'tms_transport_year', 'name', yearIds);
  const instIds = uniq([...peopleMap.values()].map((p) => p.institution_id));
  const instMap = await nameMapFor(supabase, 'institutions', 'name', instIds);

  const td = today();

  const rows: TransportBillRow[] = raw.map((r) => {
    const personType = r.person_type as 'learner' | 'staff';
    const person = peopleMap.get(r.person_id as string);
    const institutionId = person?.institution_id ?? null;
    const billRef = r.billing_student_bill_id as string | null;
    const bill = billRef ? billMap.get(billRef) : undefined;
    const amount = Number(r.amount ?? 0);
    const dueDate = r.due_date as string;

    let paid = 0;
    let pending = 0;
    let status: BillStatus;
    let paymentDate: string | null = null;

    if (personType === 'staff' || r.status === 'staff_deferred') {
      status = 'staff_deferred';
    } else if (!bill) {
      // ledger says billed but the money row is gone → flag, treat amount as pending.
      status = 'unknown';
      pending = amount;
    } else {
      paid = Math.max(0, bill.final - bill.balance);
      pending = Math.max(0, bill.balance);
      paymentDate = bill.payment_date;
      if (bill.status === 'paid' || pending <= 0) status = 'paid';
      else if (pending > 0 && dueDate < td) status = 'overdue';
      else if (bill.status === 'partially_paid' || paid > 0) status = 'partially_paid';
      else status = 'unpaid';
    }

    return {
      id: r.id as string,
      person_id: r.person_id as string,
      person_type: personType,
      person_name: person?.name ?? '—',
      code: person?.code ?? null,
      institution_id: institutionId,
      institution_name: institutionId ? instMap.get(institutionId) ?? null : null,
      structure_id: r.fee_structure_id as string,
      structure_name: structureMap.get(r.fee_structure_id as string) ?? null,
      transport_year_id: r.transport_year_id as string,
      year_name: yearMap.get(r.transport_year_id as string) ?? null,
      term_no: Number(r.term_no ?? 0),
      amount,
      due_date: dueDate,
      paid_amount: paid,
      pending_amount: pending,
      status,
      payment_date: paymentDate,
      billing_student_bill_id: billRef,
    };
  });

  const learnerRows = rows.filter((r) => r.person_type === 'learner');
  const overdueRows = rows.filter((r) => r.status === 'overdue');
  const summary: BillSummary = {
    totalBilledAmount: learnerRows.reduce((s, r) => s + r.amount, 0),
    collectedAmount: learnerRows.reduce((s, r) => s + r.paid_amount, 0),
    pendingAmount: learnerRows.reduce((s, r) => s + r.pending_amount, 0),
    overdueAmount: overdueRows.reduce((s, r) => s + r.pending_amount, 0),
    overdueCount: overdueRows.length,
    billedPeople: new Set(rows.map((r) => r.person_id)).size,
    staffDeferred: rows.filter((r) => r.person_type === 'staff').length,
    unbilledCount: 0,
  };

  return { summary, rows };
}

/**
 * Applicable bus-required people (across the year's ACTIVE structures) who have
 * no ledger row yet = "unbilled". Reuses resolveApplicablePeople.
 */
export async function loadUnbilledPeople(
  supabase: SupabaseClient,
  opts: { transportYearId: string }
): Promise<{ count: number; people: UnbilledPerson[] }> {
  const { transportYearId } = opts;
  if (!transportYearId) return { count: 0, people: [] };

  const { data: structures, error } = await supabase
    .from('tms_fee_structure')
    .select('*')
    .eq('transport_year_id', transportYearId)
    .eq('status', 'active');
  if (error) {
    if (error.code === '42P01') return { count: 0, people: [] };
    throw error;
  }
  if (!structures?.length) return { count: 0, people: [] };

  // For tiered structures, year-of-study derivation keys off the transport year's
  // calendar year — so a learner whose derived year matches no band is NOT
  // "expected" and must not be counted as unbilled.
  const { data: tyRow } = await supabase
    .from('tms_transport_year')
    .select('start_date')
    .eq('id', transportYearId)
    .maybeSingle();
  const currentYear = currentYearOf(tyRow?.start_date ?? null);

  const applicable = new Map<string, { person_id: string; person_type: 'learner' | 'staff'; institution_id: string | null }>();
  for (const fs of structures) {
    const people = await resolveApplicablePeople(supabase, fs);
    let eligible = people;
    if (fs.fee_mode === 'tiered') {
      const { data: bandRows } = await supabase
        .from('tms_fee_structure_year_band')
        .select('id, study_years')
        .eq('fee_structure_id', fs.id);
      const bands = (bandRows ?? []) as Array<{ id: string; study_years: number[] }>;
      eligible = people.filter(
        (p) => bandForYear(bands, deriveStudyYear(currentYear, p.admission_year)) !== null
      );
    }
    for (const p of eligible) if (!applicable.has(p.person_id)) applicable.set(p.person_id, p);
  }
  if (applicable.size === 0) return { count: 0, people: [] };

  const { data: ledger } = await supabase
    .from('tms_fee_bill')
    .select('person_id')
    .eq('transport_year_id', transportYearId);
  const billed = new Set((ledger ?? []).map((r) => r.person_id as string));

  const unbilled = [...applicable.values()].filter((p) => !billed.has(p.person_id));
  if (!unbilled.length) return { count: 0, people: [] };

  const learnerIds = uniq(unbilled.filter((p) => p.person_type === 'learner').map((p) => p.person_id));
  const staffIds = uniq(unbilled.filter((p) => p.person_type === 'staff').map((p) => p.person_id));
  const peopleMap = await resolvePeople(supabase, learnerIds, staffIds);
  const instIds = uniq(unbilled.map((p) => p.institution_id));
  const instMap = await nameMapFor(supabase, 'institutions', 'name', instIds);

  const people: UnbilledPerson[] = unbilled.map((p) => {
    const info = peopleMap.get(p.person_id);
    const institutionId = info?.institution_id ?? p.institution_id ?? null;
    return {
      person_id: p.person_id,
      person_type: p.person_type,
      person_name: info?.name ?? '—',
      code: info?.code ?? null,
      institution_id: institutionId,
      institution_name: institutionId ? instMap.get(institutionId) ?? null : null,
    };
  });

  return { count: people.length, people };
}
