import { NextResponse } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { deriveFineStatus, type FineDisplayStatus } from '@/lib/fines/list';

/**
 * The signed-in learner's TRANSPORT FEE — the charge raised when the Transport
 * Maintenance Fee goes unpaid. Self-scoped: the learner comes from the SESSION,
 * never from client input, and the ledger (tms_fee_fine) is RLS deny-all, so
 * this reads with the service role.
 *
 * Returns TWO different things, and they must not be confused:
 *   - `items` / `outstanding`: charges actually raised against this learner.
 *   - `route_charge`: the amount their ROUTE would be charged if the
 *     maintenance fee goes unpaid. Nothing is owed on account of it. It comes
 *     from this year's transport fee sheet, where every stop on a route carries
 *     that route's final-stop amount, so it is the learner's route charge.
 *
 * Status is NOT read from the ledger alone: the ledger owns generated/cancelled
 * and the money row owns paid/unpaid, so it reuses deriveFineStatus() — the one
 * place those are combined (see lib/fines/list.ts).
 */
export interface StudentTransportFeeItem {
  id: string;
  amount: number;
  paid_amount: number;
  due_date: string;
  reason: string;
  status: FineDisplayStatus;
}

export interface StudentRouteCharge {
  amount: number;
  route_number: string | null;
  route_name: string | null;
  stop_name: string | null;
}

interface LedgerRow {
  id: string;
  fine_amount: number;
  due_date: string;
  reason: string;
  status: 'generated' | 'cancelled';
  billing_student_bill_id: string | null;
}

const EMPTY = {
  items: [] as StudentTransportFeeItem[],
  outstanding: 0,
  total: 0,
  count: 0,
  route_charge: null as StudentRouteCharge | null,
};

/**
 * What this learner's route would be charged. Returns null rather than 0 when
 * the stop is unpriced: "₹0" would read as "your route is free", which is a
 * different claim from "no amount is configured".
 */
async function loadRouteCharge(
  svc: ReturnType<typeof createServiceRoleClient>,
  stopId: string | null
): Promise<StudentRouteCharge | null> {
  if (!stopId) return null;

  const { data: year, error: yearErr } = await svc
    .from('tms_transport_year')
    .select('id')
    .eq('is_current', true)
    .maybeSingle();
  if (yearErr || !year) return null;

  const { data: rate, error: rateErr } = await svc
    .from('tms_fine_stop_rate')
    .select('fine_amount')
    .eq('transport_year_id', (year as { id: string }).id)
    .eq('stop_id', stopId)
    .maybeSingle();
  if (rateErr || !rate) return null;

  const amount = Number((rate as { fine_amount: number }).fine_amount);
  if (!(amount > 0)) return null;

  const { data: stop } = await svc
    .from('tms_route_stop')
    .select('stop_name, tms_route(route_number, route_name)')
    .eq('id', stopId)
    .maybeSingle();
  const s = stop as unknown as {
    stop_name: string;
    tms_route: { route_number: string; route_name: string } | null;
  } | null;

  return {
    amount,
    route_number: s?.tms_route?.route_number ?? null,
    route_name: s?.tms_route?.route_name ?? null,
    stop_name: s?.stop_name ?? null,
  };
}

async function transportFee(_request: Request, auth: AuthContext) {
  try {
    const svc = createServiceRoleClient();

    // profile_id is NOT unique in learners_profiles, so this must not use
    // maybeSingle() — a learner with two rows would error instead of listing.
    const { data: learners, error: learnerErr } = await svc
      .from('learners_profiles')
      .select('id, transport_stop_id')
      .eq('profile_id', auth.userId);
    if (learnerErr) {
      console.error('transport-fee learner lookup failed:', learnerErr.message);
      return NextResponse.json({ error: 'Failed to load your transport fee' }, { status: 500 });
    }
    const rows = (learners ?? []) as Array<{ id: string; transport_stop_id: string | null }>;
    const ids = rows.map((l) => l.id);
    if (!ids.length) return NextResponse.json({ success: true, data: EMPTY });

    const routeCharge = await loadRouteCharge(
      svc,
      rows.find((l) => l.transport_stop_id)?.transport_stop_id ?? null
    );

    const { data: ledger, error } = await svc
      .from('tms_fee_fine')
      .select('id, fine_amount, due_date, reason, status, billing_student_bill_id')
      .in('person_id', ids)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('transport-fee ledger read failed:', error.message);
      return NextResponse.json({ error: 'Failed to load your transport fee' }, { status: 500 });
    }
    const fines = (ledger ?? []) as LedgerRow[];
    if (!fines.length) {
      return NextResponse.json({ success: true, data: { ...EMPTY, route_charge: routeCharge } });
    }

    const billIds = [...new Set(fines.map((r) => r.billing_student_bill_id).filter(Boolean))] as string[];
    const bills = new Map<string, { status: string | null; balance_amount: number | null; due_date: string | null }>();
    if (billIds.length) {
      const { data: billRows, error: billErr } = await svc
        .from('billing_student_bills')
        .select('id, status, balance_amount, due_date')
        .in('id', billIds);
      if (billErr) {
        console.error('transport-fee bill read failed:', billErr.message);
        return NextResponse.json({ error: 'Failed to load your transport fee' }, { status: 500 });
      }
      for (const b of (billRows ?? []) as Array<{
        id: string;
        status: string | null;
        balance_amount: number | null;
        due_date: string | null;
      }>) {
        bills.set(b.id, { status: b.status, balance_amount: b.balance_amount, due_date: b.due_date });
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    let outstanding = 0;
    let total = 0;
    let count = 0;

    const items: StudentTransportFeeItem[] = fines.map((r) => {
      const money = r.billing_student_bill_id ? bills.get(r.billing_student_bill_id) ?? null : null;
      const status = deriveFineStatus(r.status, money, today);
      const amount = Number(r.fine_amount);
      const balance = Number(money?.balance_amount ?? amount);
      const paid_amount = status === 'cancelled' ? 0 : Math.max(0, amount - balance);

      // A waived charge is not money the learner owes, so it is excluded from
      // every total — exactly as the admin Transport Fee tab excludes it.
      if (status !== 'cancelled') {
        total += amount;
        outstanding += Math.max(0, amount - paid_amount);
        count += 1;
      }

      return { id: r.id, amount, paid_amount, due_date: r.due_date, reason: r.reason, status };
    });

    return NextResponse.json({
      success: true,
      data: { items, outstanding, total, count, route_charge: routeCharge },
    });
  } catch (e) {
    console.error('transport-fee error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => transportFee(request, auth));
