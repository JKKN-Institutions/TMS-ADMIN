import { NextResponse } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { getAssignedRouteIdsForUser } from '@/lib/boarding/identity';
import { getStaffBoardingEligibility } from '@/lib/boarding/eligibility';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { resolveStaffId } from '@/lib/identity/staff-lookup';
import { loadStaffBillState } from '@/lib/fees/staff-bill-state';
import { deriveInChargeGate } from '@/lib/boarding/incharge-gate';
import { serviceDays, monthWindow } from '@/lib/boarding/incharge-month';
import { istToday } from '@/lib/booking/window';
import { emailIlikePattern } from '@/lib/identity/email-match';

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
        probationThisMonth: 'none',
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
    let probationThisMonth: 'none' | 'active' | 'failed' = 'none';
    let remainingServiceDays = 0;

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

    if (hasOutstandingBill && email) {
      const today = istToday();
      const win = monthWindow(today);

      const { data: probRows } = await svc
        .from('tms_incharge_probation')
        .select('status')
        .ilike('staff_email', emailIlikePattern(email))
        .gte('window_end', win.start);
      const statuses = ((probRows ?? []) as Array<{ status: string }>).map((r) => r.status);
      if (statuses.includes('active')) probationThisMonth = 'active';
      else if (statuses.includes('failed')) probationThisMonth = 'failed';

      // Days left to mark on THEIR route. If the pledge cannot be honoured
      // there is no point offering it, so this decides pledge vs must_pay.
      if (elig.routeId) {
        const { data: booked } = await svc
          .from('tms_booking')
          .select('travel_date')
          .eq('route_id', elig.routeId)
          .gte('travel_date', today)
          .lte('travel_date', win.end);
        remainingServiceDays = serviceDays(
          ((booked ?? []) as Array<{ travel_date: string }>).map((b) => b.travel_date),
          today, win.end,
        ).length;
      }
    }

    const gate = deriveInChargeGate({
      allowed,
      eligible: elig.eligible,
      assignedRouteCount: elig.assignedRouteCount,
      hasRoute: elig.hasRoute,
      hasOutstandingBill,
      probationThisMonth,
      remainingServiceDays,
    });

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
        probationThisMonth,
      },
    });
  } catch (e) {
    console.error('boarding access check error:', e);
    // Fail closed — if we can't confirm access, don't grant it.
    return NextResponse.json({ success: true, data: {
      allowed: false, assignedRouteCount: 0, eligible: false, hasRoute: false,
      gate: 'denied', outstandingAmount: 0, probationThisMonth: 'none',
    } });
  }
}

export const GET = withAuth((_req, auth) => getAccess(auth));
