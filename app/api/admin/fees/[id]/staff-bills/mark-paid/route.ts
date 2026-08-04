import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { logActivity } from '@/lib/activity/log';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

/** Record an offline payment against one staff transport bill. */
async function markPaid(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_EDIT))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await request.json().catch(() => ({}));
    const billId = String(body?.billId ?? '').trim();
    const paymentReference = body?.paymentReference ? String(body.paymentReference).trim() : null;
    if (!billId) {
      return NextResponse.json({ error: 'billId is required' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    const { data: bill, error: readErr } = await supabase
      .from('tms_fee_bill')
      .select('id, person_id, person_type, amount, status')
      .eq('id', billId)
      .maybeSingle();
    if (readErr) return NextResponse.json({ error: 'Failed to load the bill' }, { status: 500 });
    if (!bill) return NextResponse.json({ error: 'Bill not found' }, { status: 404 });

    const row = bill as { id: string; person_id: string; person_type: string; amount: number; status: string };
    // Learner payment is owned by MyJKKN's billing_student_bills — this endpoint
    // must never write a learner bill's paid state.
    if (row.person_type !== 'staff') {
      return NextResponse.json({ error: 'Only staff bills can be marked paid here.' }, { status: 400 });
    }
    if (row.status === 'paid') {
      return NextResponse.json({ error: 'This bill is already marked paid.' }, { status: 409 });
    }
    if (row.status !== 'generated') {
      return NextResponse.json({ error: `A bill with status "${row.status}" cannot be marked paid.` }, { status: 400 });
    }

    const paidAmount = body?.paidAmount != null ? Number(body.paidAmount) : Number(row.amount);
    if (!Number.isFinite(paidAmount) || paidAmount <= 0) {
      return NextResponse.json({ error: 'paidAmount must be a positive number' }, { status: 400 });
    }

    const { error: updErr } = await supabase
      .from('tms_fee_bill')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        paid_amount: paidAmount,
        payment_reference: paymentReference,
        marked_paid_by: auth.userId,
      })
      .eq('id', billId)
      .eq('status', 'generated'); // guard against a concurrent double-mark
    if (updErr) {
      return NextResponse.json({ error: 'Failed to record the payment' }, { status: 500 });
    }

    await logActivity(auth, request, {
      module: 'fees',
      action: 'update',
      entityType: 'tms_fee_bill',
      entityId: billId,
      entityLabel: row.person_id,
      description: `Recorded staff transport fee payment of ${paidAmount}`,
      metadata: { billId, paidAmount, paymentReference, staffId: row.person_id },
    });

    return NextResponse.json({ success: true, message: 'Payment recorded' });
  } catch (e) {
    console.error('mark paid error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => markPaid(request, auth));
