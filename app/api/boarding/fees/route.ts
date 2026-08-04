import { NextResponse } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * The caller's OWN transport fee bills.
 *
 * Staff bills live in tms_fee_bill (staff can never be written to
 * billing_student_bills — its student_id is NOT NULL with an FK to
 * learners_profiles). The staff record is resolved from the authenticated
 * profile id; no person id is ever accepted from the client.
 */
async function getMyFees(auth: AuthContext) {
  try {
    const supabase = createServiceRoleClient();

    const { data: staffRow, error: staffErr } = await supabase
      .from('staff')
      .select('id, transport_stop_id')
      .eq('profile_id', auth.userId)
      .maybeSingle();
    if (staffErr) {
      return NextResponse.json({ error: 'Failed to load your staff record.' }, { status: 500 });
    }
    if (!staffRow) {
      return NextResponse.json({ success: true, data: { bills: [], totalDue: 0 } });
    }

    const staff = staffRow as { id: string; transport_stop_id: string | null };
    const { data: billRows, error: billErr } = await supabase
      .from('tms_fee_bill')
      .select('id, amount, due_date, term_no, status, transport_year_id')
      .eq('person_id', staff.id)
      .eq('person_type', 'staff')
      .in('status', ['generated', 'paid'])
      .order('term_no', { ascending: true });
    if (billErr) {
      return NextResponse.json({ error: 'Failed to load your transport fees.' }, { status: 500 });
    }

    const bills = (billRows ?? []) as Array<{
      id: string; amount: number; due_date: string; term_no: number;
      status: string; transport_year_id: string;
    }>;

    // Stop name and year name are display-only; a failure degrades to null
    // rather than hiding the bill the person needs to see.
    let stopName: string | null = null;
    if (staff.transport_stop_id) {
      const { data: stop } = await supabase
        .from('tms_route_stop')
        .select('stop_name')
        .eq('id', staff.transport_stop_id)
        .maybeSingle();
      stopName = (stop as { stop_name?: string } | null)?.stop_name ?? null;
    }

    const yearNameById = new Map<string, string>();
    const yearIds = [...new Set(bills.map((b) => b.transport_year_id))];
    if (yearIds.length) {
      const { data: years } = await supabase
        .from('tms_transport_year')
        .select('id, name')
        .in('id', yearIds);
      for (const y of (years ?? []) as Array<{ id: string; name: string }>) {
        yearNameById.set(y.id, y.name);
      }
    }

    const totalDue = bills
      .filter((b) => b.status === 'generated')
      .reduce((s, b) => s + Number(b.amount), 0);

    return NextResponse.json({
      success: true,
      data: {
        bills: bills.map((b) => ({
          id: b.id,
          amount: Number(b.amount),
          dueDate: b.due_date,
          termNo: b.term_no,
          status: b.status,
          stopName,
          yearName: yearNameById.get(b.transport_year_id) ?? null,
        })),
        totalDue,
      },
    });
  } catch (e) {
    console.error('staff fees API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((_req, auth) => getMyFees(auth));
