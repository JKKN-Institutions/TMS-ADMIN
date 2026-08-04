import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

// withAuth drops Next's route context, so pull [id] from the path:
// /api/admin/fees/<id>/staff-bills
function feeIdFromPath(request: NextRequest): string | null {
  const parts = request.nextUrl.pathname.split('/').filter(Boolean);
  const i = parts.indexOf('fees');
  return i >= 0 && parts[i + 1] ? parts[i + 1] : null;
}

async function listStaffBills(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const id = feeIdFromPath(request);
    if (!id) return NextResponse.json({ error: 'Fee structure id is required' }, { status: 400 });

    const supabase = createServiceRoleClient();
    const { data: billRows, error } = await supabase
      .from('tms_fee_bill')
      .select('id, person_id, amount, due_date, status, paid_at, payment_reference')
      .eq('fee_structure_id', id)
      .eq('person_type', 'staff')
      .order('created_at', { ascending: false });
    if (error) {
      return NextResponse.json({ error: 'Failed to load staff bills' }, { status: 500 });
    }

    const bills = (billRows ?? []) as Array<{
      id: string; person_id: string; amount: number; due_date: string;
      status: string; paid_at: string | null; payment_reference: string | null;
    }>;

    // Resolve names. Chunked to <=150 and error-checked: an unchecked gateway
    // 400 returns null, which would blank every name with no signal.
    const staffIds = [...new Set(bills.map((b) => b.person_id))];
    const staffById = new Map<string, { name: string; code: string | null }>();
    const CHUNK = 150;
    for (let i = 0; i < staffIds.length; i += CHUNK) {
      const { data: rows, error: sErr } = await supabase
        .from('staff')
        .select('id, first_name, last_name, staff_id')
        .in('id', staffIds.slice(i, i + CHUNK));
      if (sErr) {
        return NextResponse.json({ error: 'Failed to resolve staff names' }, { status: 500 });
      }
      for (const r of (rows ?? []) as Array<{
        id: string; first_name: string | null; last_name: string | null; staff_id: string | null;
      }>) {
        staffById.set(r.id, {
          name: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || 'Unknown',
          code: r.staff_id,
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: bills.map((b) => ({
        id: b.id,
        staffId: b.person_id,
        name: staffById.get(b.person_id)?.name ?? 'Unknown',
        staffCode: staffById.get(b.person_id)?.code ?? null,
        amount: Number(b.amount),
        dueDate: b.due_date,
        status: b.status,
        paidAt: b.paid_at,
        paymentReference: b.payment_reference,
      })),
    });
  } catch (e) {
    console.error('staff bills list error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => listStaffBills(request, auth));
