// lib/fines/list.ts
// Read layer for the Fines tab. The ledger owns generated/cancelled; the MONEY
// row owns paid/unpaid — collection happens in MyJKKN, which TMS never observes.
// This is the only place those two are combined, so no screen can invent a third
// answer.

import type { SupabaseClient } from '@supabase/supabase-js';

export type FineDisplayStatus =
  | 'paid'
  | 'partially_paid'
  | 'unpaid'
  | 'overdue'
  | 'cancelled'
  | 'unknown';

export interface MoneyRow {
  status: string | null;
  balance_amount: number | null;
  due_date: string | null;
}

export function deriveFineStatus(
  ledgerStatus: 'generated' | 'cancelled',
  money: MoneyRow | null,
  today: string
): FineDisplayStatus {
  if (ledgerStatus === 'cancelled') return 'cancelled';
  if (!money) return 'unknown';
  const s = (money.status ?? '').toLowerCase();
  if (s === 'paid') return 'paid';
  if (s === 'cancelled') return 'cancelled';
  const unpaidish = s === 'unpaid' || s === 'partially_paid' || s === 'overdue';
  if (unpaidish && money.due_date && money.due_date < today) return 'overdue';
  if (s === 'partially_paid') return 'partially_paid';
  if (unpaidish) return 'unpaid';
  return 'unknown';
}

export interface FineRow {
  id: string;
  person_id: string;
  person_name: string;
  code: string | null;
  stop_name: string | null;
  route_number: string | null;
  fine_amount: number;
  due_date: string;
  reason: string;
  display_status: FineDisplayStatus;
  paid_amount: number;
  created_at: string;
}

export interface FineSummary {
  raised: number;
  collected: number;
  outstanding: number;
  count: number;
}

interface LedgerRow {
  id: string;
  person_id: string;
  stop_id: string | null;
  route_id: string | null;
  fine_amount: number;
  due_date: string;
  reason: string;
  status: 'generated' | 'cancelled';
  created_at: string;
  billing_student_bill_id: string | null;
}

const CHUNK = 150;

export async function loadFines(
  svc: SupabaseClient,
  opts: { transportYearId: string }
): Promise<{ rows: FineRow[]; summary: FineSummary }> {
  const { data: ledger, error } = await svc
    .from('tms_fee_fine')
    .select(
      'id, person_id, stop_id, route_id, fine_amount, due_date, reason, status, created_at, billing_student_bill_id'
    )
    .eq('transport_year_id', opts.transportYearId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Failed to load fines: ${error.message}`);
  const fines = (ledger ?? []) as LedgerRow[];
  if (!fines.length) {
    return { rows: [], summary: { raised: 0, collected: 0, outstanding: 0, count: 0 } };
  }

  const byId = async <T extends { id: string }>(
    table: string,
    columns: string,
    ids: string[]
  ): Promise<Map<string, T>> => {
    const out = new Map<string, T>();
    for (let i = 0; i < ids.length; i += CHUNK) {
      const { data, error: err } = await svc
        .from(table)
        .select(columns)
        .in('id', ids.slice(i, i + CHUNK));
      if (err) throw new Error(`Failed to load ${table}: ${err.message}`);
      for (const r of (data ?? []) as unknown as T[]) out.set(r.id, r);
    }
    return out;
  };

  const learners = await byId<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    roll_number: string | null;
  }>('learners_profiles', 'id, first_name, last_name, roll_number', [
    ...new Set(fines.map((f) => f.person_id)),
  ]);
  const stops = await byId<{ id: string; stop_name: string }>('tms_route_stop', 'id, stop_name', [
    ...new Set(fines.map((f) => f.stop_id).filter(Boolean)),
  ] as string[]);
  const routes = await byId<{ id: string; route_number: string | null }>(
    'tms_route',
    'id, route_number',
    [...new Set(fines.map((f) => f.route_id).filter(Boolean))] as string[]
  );
  const bills = await byId<{
    id: string;
    status: string | null;
    balance_amount: number | null;
    final_amount: number | null;
    due_date: string | null;
  }>('billing_student_bills', 'id, status, balance_amount, final_amount, due_date', [
    ...new Set(fines.map((f) => f.billing_student_bill_id).filter(Boolean)),
  ] as string[]);

  const today = new Date().toISOString().slice(0, 10);
  const summary: FineSummary = { raised: 0, collected: 0, outstanding: 0, count: 0 };

  const rows: FineRow[] = fines.map((f) => {
    const l = learners.get(f.person_id);
    const money = f.billing_student_bill_id ? bills.get(f.billing_student_bill_id) ?? null : null;
    const display_status = deriveFineStatus(f.status, money, today);
    const amount = Number(f.fine_amount);
    const balance = Number(money?.balance_amount ?? amount);
    const paid_amount = display_status === 'cancelled' ? 0 : Math.max(0, amount - balance);

    // Cancelled fines are voided money: excluded from every total, exactly as
    // cancelled fee bills are excluded from the fee KPIs.
    if (display_status !== 'cancelled') {
      summary.raised += amount;
      summary.collected += paid_amount;
      summary.outstanding += Math.max(0, amount - paid_amount);
      summary.count += 1;
    }

    return {
      id: f.id,
      person_id: f.person_id,
      person_name: [l?.first_name, l?.last_name].filter(Boolean).join(' ').trim() || '—',
      code: l?.roll_number ?? null,
      stop_name: f.stop_id ? stops.get(f.stop_id)?.stop_name ?? null : null,
      route_number: f.route_id ? routes.get(f.route_id)?.route_number ?? null : null,
      fine_amount: amount,
      due_date: f.due_date,
      reason: f.reason,
      display_status,
      paid_amount,
      created_at: f.created_at,
    };
  });

  return { rows, summary };
}
