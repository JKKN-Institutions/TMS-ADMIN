/**
 * Record payment of ALL of one staffer's outstanding transport bills.
 *
 * The monthly board knows the person, not the bill ids -- and a stop-wise
 * structure can raise several instalments, so "mark paid" has to mean the whole
 * outstanding set or the fee gate would stay shut after a full payment.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { resolveStaffId } from '@/lib/identity/staff-lookup';
import { emailIlikePattern } from '@/lib/identity/email-match';
import { loadStaffBillState } from '@/lib/fees/staff-bill-state';
import { logActivity } from '@/lib/activity/log';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

// withAuth drops Next's route params, so pull [email] from the path:
// /api/admin/staff-bills/by-person/<email>/mark-paid
function emailFromPath(request: NextRequest): string {
  const parts = request.nextUrl.pathname.split('/').filter(Boolean);
  // .../by-person/<email>/mark-paid -- mark-paid is the last segment, email the one before it.
  return decodeURIComponent(parts[parts.length - 2] ?? '');
}

async function handler(request: NextRequest, auth: AuthContext) {
  if (!(await requirePerm(auth, TMS_PERMISSIONS.DRIVERS_ASSIGN))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const email = emailFromPath(request).toLowerCase().trim();
  if (!email) {
    return NextResponse.json({ error: 'Staff email is required' }, { status: 400 });
  }
  const svc = createServiceRoleClient();

  // R2: raw email is a LIKE pattern to .ilike(); `_` matches any single
  // character, and live addresses contain it (kalaivani_s@, sindhu_s@), so an
  // unescaped pattern can resolve to the WRONG person -- and this route
  // records a payment.
  const pattern = emailIlikePattern(email);
  const { data: prof } = await svc
    .from('profiles').select('id').ilike('email', pattern).maybeSingle();
  const staffId = await resolveStaffId(svc, {
    email,
    profileId: (prof as { id: string } | null)?.id ?? null,
  });
  if (!staffId) {
    return NextResponse.json({ error: 'Could not resolve this staff member' }, { status: 404 });
  }

  const { data: year } = await svc
    .from('tms_transport_year').select('id').eq('is_current', true).maybeSingle();
  if (!year?.id) {
    return NextResponse.json({ error: 'No current transport year' }, { status: 409 });
  }

  const state = await loadStaffBillState(svc, {
    personId: staffId, transportYearId: year.id as string,
  });
  if (!state.hasOutstanding) {
    return NextResponse.json({ error: 'Nothing outstanding for this staff member' }, { status: 409 });
  }

  const { error } = await svc
    .from('tms_fee_bill')
    .update({
      paid_at: new Date().toISOString(),
      marked_paid_by: auth.userId,
    })
    .in('id', state.billIds)
    .is('paid_at', null);
  if (error) {
    return NextResponse.json({ error: 'Failed to record the payment' }, { status: 500 });
  }

  await logActivity(auth, request, {
    module: 'staff-route-assignments',
    action: 'update',
    entityType: 'tms_fee_bill',
    entityLabel: email,
    description: `Recorded payment of ₹${state.outstandingAmount} across ${state.billIds.length} transport bill(s)`,
    metadata: { email, staffId, billIds: state.billIds, amount: state.outstandingAmount },
  });

  return NextResponse.json({
    success: true,
    message: `Recorded payment of ₹${state.outstandingAmount}`,
  });
}

export const POST = withAuth((request, auth) => handler(request, auth));
