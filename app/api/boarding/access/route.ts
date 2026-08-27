import { NextResponse } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { getAssignedRouteIdsForUser } from '@/lib/boarding/identity';
import { getStaffBoardingEligibility } from '@/lib/boarding/eligibility';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { resolveStaffId } from '@/lib/identity/staff-lookup';
import { loadStaffBillState } from '@/lib/fees/staff-bill-state';
import { deriveInChargeGate } from '@/lib/boarding/incharge-gate';

/**
 * Boarding-portal access gate. A staffer may use the portal only if they are
 * actually assigned to at least one active route (tms_staff_route_assignment) —
 * the `tms.attendance.scan` permission alone is not enough. Super admins always
 * pass. Returns { allowed, assignedRouteCount, eligible, hasRoute } for the
 * layout to gate on.
 */
async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

async function getAccess(auth: AuthContext) {
  try {
    if (auth.isSuperAdmin) {
      return NextResponse.json({ success: true, data: {
        allowed: true, assignedRouteCount: 0, eligible: false, hasRoute: false,
        superAdmin: true, gate: 'in_duty', outstandingAmount: 0,
      } });
    }
    // Eligibility is computed regardless of the scan permission — an eligible-but-
    // unassigned staffer lacks tms.attendance.scan but must still see eligible:true
    // so the in-charge willingness toggle can offer self-assignment.
    const elig = await getStaffBoardingEligibility(auth.supabase, auth.userId);
    // Must hold the boarding permission AND be assigned to a route.
    const hasScan = await requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_SCAN);
    const routeIds = hasScan ? await getAssignedRouteIdsForUser(auth) : [];
    // assignedRouteCount comes from the RPC (the true active count), NOT routeIds.length
    // which is scan-gated and would under-report in the rare assigned-but-role-grant-failed
    // state, wrongly offering the willingness toggle. `allowed` still requires scan
    // permission AND an assignment, so it stays the authoritative "open the full portal"
    // signal.
    const allowed = routeIds.length > 0;

    // ── Fee dimension ──────────────────────────────────────────────────────────
    // Computed with the service-role client because a blocked staffer has no
    // read access to their own bills through RLS -- the whole point is that they
    // are locked out. Failures here fall through to the outer catch, which fails
    // closed.
    const svc = createServiceRoleClient();

    let hasOutstandingBill = false;
    let outstandingAmount = 0;

    const { data: prof } = await svc
      .from('profiles').select('email').eq('id', auth.userId).maybeSingle();
    const email = ((prof as { email: string | null } | null)?.email ?? '').toLowerCase().trim();

    const { data: currentYear } = await svc
      .from('tms_transport_year').select('id').eq('is_current', true).maybeSingle();

    const staffId = await resolveStaffId(svc, { email, profileId: auth.userId });
    if (staffId && currentYear?.id) {
      const billState = await loadStaffBillState(svc, {
        personId: staffId, transportYearId: currentYear.id as string,
      });
      hasOutstandingBill = billState.hasOutstanding;
      outstandingAmount = billState.outstandingAmount;
    }

    // Mirrors self-assign's own fail-closed conditions (reasons 'no_current_year'
    // / 'staff_unresolved'). Neither is a leak on its own -- self-assign still
    // rejects them -- but without this, hasOutstandingBill silently stays false,
    // the gate below can come out 'choose', and a billed staffer would be shown
    // a willingness toggle that 409s the instant they press it.
    const feeCheckReason: 'no_current_year' | 'staff_unresolved' | null =
      !currentYear?.id ? 'no_current_year' : !staffId ? 'staff_unresolved' : null;

    let gate = deriveInChargeGate({
      allowed,
      eligible: elig.eligible,
      assignedRouteCount: elig.assignedRouteCount,
      hasRoute: elig.hasRoute,
      hasOutstandingBill,
    });
    // Only 'choose' is at risk here -- it is the one gate that offers an action
    // (self-assign) whose own fail-closed checks we could not evaluate.
    if (gate === 'choose' && feeCheckReason) {
      gate = 'denied';
    }

    return NextResponse.json({
      success: true,
      // assignedRouteCount comes from the RPC (the true active count), NOT routeIds.length
      // which is scan-gated and would under-report in the rare assigned-but-role-grant-failed
      // state, wrongly offering the willingness toggle.
      // hasRoute lets the layout show the denied screen instead of offering a toggle
      // that cannot succeed. elig.routeId is deliberately NOT published — the client
      // has no use for it and must never be able to name a route.
      data: {
        allowed,
        assignedRouteCount: elig.assignedRouteCount,
        eligible: elig.eligible,
        hasRoute: elig.hasRoute,
        gate,
        outstandingAmount,
        ...(feeCheckReason ? { reason: feeCheckReason } : {}),
      },
    });
  } catch (e) {
    console.error('boarding access check error:', e);
    // Fail closed — if we can't confirm access, don't grant it.
    return NextResponse.json({ success: true, data: {
      allowed: false, assignedRouteCount: 0, eligible: false, hasRoute: false,
      gate: 'denied', outstandingAmount: 0,
    } });
  }
}

export const GET = withAuth((_req, auth) => getAccess(auth));
