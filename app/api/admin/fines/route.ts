import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { logActivity } from '@/lib/activity/log';
import { parseCreateFineBody } from '@/lib/fines/fields';
import { createFines } from '@/lib/fines/create';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

async function create(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_EDIT))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const raw = await request.json().catch(() => ({}));
    const parsed = parseCreateFineBody(raw);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const sourceBillByPerson =
      ((raw as Record<string, unknown>).source_bill_by_person as Record<string, string>) ?? undefined;

    const svc = createServiceRoleClient();
    const result = await createFines(svc, {
      transportYearId: parsed.value.transport_year_id,
      personIds: parsed.value.person_ids,
      dueDate: parsed.value.due_date,
      reason: parsed.value.reason,
      notify: parsed.value.notify,
      idempotencyKey: parsed.value.idempotency_key,
      actorId: auth.userId,
      sourceBillByPerson,
    });

    await logActivity(auth, request, {
      module: 'fees',
      action: 'create',
      entityType: 'tms_fee_fine',
      entityId: parsed.value.idempotency_key,
      description: `Raised ${result.created} fine(s) totalling ₹${result.totalAmount.toLocaleString('en-IN')} — ${parsed.value.reason}`,
      metadata: {
        created: result.created,
        skipped: result.skipped.length,
        duplicates: result.duplicates,
        errors: result.errors,
        total_amount: result.totalAmount,
        due_date: parsed.value.due_date,
      },
    });

    return NextResponse.json({
      success: true,
      data: result,
      message: `Raised ${result.created} fine(s) totalling ₹${result.totalAmount.toLocaleString('en-IN')}.`,
    });
  } catch (e) {
    console.error('Fine create error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => create(request, auth));
