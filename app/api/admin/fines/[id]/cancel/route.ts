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

// withAuth drops Next's route context: /api/admin/fines/<id>/cancel
function fineIdFromPath(request: NextRequest): string | null {
  const parts = request.nextUrl.pathname.split('/').filter(Boolean);
  const i = parts.indexOf('fines');
  return i >= 0 && parts[i + 1] ? parts[i + 1] : null;
}

async function cancel(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_EDIT))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const id = fineIdFromPath(request);
    if (!id) return NextResponse.json({ error: 'Fine id is required' }, { status: 400 });

    const body = (await request.json().catch(() => ({}))) as { reason?: string };
    const reason = (body.reason ?? '').trim();
    if (!reason) return NextResponse.json({ error: 'A waiver reason is required.' }, { status: 400 });

    const svc = createServiceRoleClient();

    const { data: fine, error: loadErr } = await svc
      .from('tms_fee_fine')
      .select('id, status, fine_amount, person_id, billing_student_bill_id')
      .eq('id', id)
      .maybeSingle();
    if (loadErr) return NextResponse.json({ error: 'Failed to load the fine' }, { status: 500 });
    if (!fine) return NextResponse.json({ error: 'Fine not found' }, { status: 404 });
    const row = fine as unknown as {
      id: string;
      status: string;
      fine_amount: number;
      person_id: string;
      billing_student_bill_id: string | null;
    };
    if (row.status === 'cancelled') {
      return NextResponse.json({ success: true, data: { id }, message: 'Already waived.' });
    }

    // Money row FIRST: if this succeeds and the ledger update then fails, the
    // learner is not charged and the ledger still says 'generated' — a visible,
    // retryable inconsistency. The reverse order would show 'cancelled' in TMS
    // while MyJKKN still collects.
    if (row.billing_student_bill_id) {
      const { error: billErr } = await svc
        .from('billing_student_bills')
        .update({ status: 'cancelled', balance_amount: 0, updated_at: new Date().toISOString() })
        .eq('id', row.billing_student_bill_id);
      if (billErr) {
        console.error('[fines] money row cancel failed:', billErr.message);
        return NextResponse.json({ error: 'Failed to cancel the bill' }, { status: 500 });
      }
    }

    const { error: fineErr } = await svc
      .from('tms_fee_fine')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancelled_by: auth.userId,
        cancel_reason: reason,
      })
      .eq('id', id);
    if (fineErr) {
      console.error('[fines] ledger cancel failed AFTER the bill was cancelled:', fineErr.message);
      return NextResponse.json(
        { error: 'The bill was cancelled but the fine record was not updated. Retry the waive.' },
        { status: 500 }
      );
    }

    await logActivity(auth, request, {
      module: 'fees',
      action: 'cancel',
      entityType: 'tms_fee_fine',
      entityId: id,
      description: `Waived a fine of ₹${Number(row.fine_amount).toLocaleString('en-IN')} — ${reason}`,
      metadata: { person_id: row.person_id, amount: Number(row.fine_amount), reason },
    });

    return NextResponse.json({ success: true, data: { id }, message: 'Fine waived.' });
  } catch (e) {
    console.error('Fine cancel error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => cancel(request, auth));
