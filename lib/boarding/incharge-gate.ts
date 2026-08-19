/**
 * Which screen does this staffer see in the boarding portal?
 *
 * The sole authority on this question. It used to extend a separate
 * deriveBoardingAccess (access-state.ts) that answered only "may you use the
 * portal" without knowing about bills -- exactly the fee-blind gate this
 * feature exists to replace. That file had zero live call sites (only its
 * own test referenced it) and was deleted; this function is the only place
 * the decision is made now.
 *
 * States:
 *   'in_duty'  -- the full portal. Includes anyone on an ACTIVE probation,
 *                 because accepting the pledge reassigns them.
 *   'choose'   -- the willingness toggle: eligible, unbilled, not yet assigned.
 *   'pledge'   -- billed, and a commitment is still achievable this month.
 *   'must_pay' -- billed, and no commitment is available. Only payment reopens.
 *   'denied'   -- the blocked screen.
 *
 * ORDER IS THE DESIGN. The bill is checked BEFORE the willingness toggle,
 * because a billed staffer who reached the toggle would re-grant themselves the
 * fee exemption -- which is precisely how twenty-six people escaped their bills
 * between 2026-08-17 and 08-18.
 */
export type InChargeGate = 'in_duty' | 'choose' | 'pledge' | 'must_pay' | 'denied';

export interface InChargeGateInput {
  /** Holds tms.attendance.scan AND is assigned to at least one active route. */
  allowed: boolean;
  /** Active bus_required staff (the eligibility RPC's verdict). */
  eligible: boolean;
  /** Active tms_staff_route_assignment rows for this staffer. */
  assignedRouteCount: number;
  /** staff.transport_route_id resolves to an ACTIVE route. */
  hasRoute: boolean;
  /** An uncancelled, unpaid current-year staff transport bill exists. */
  hasOutstandingBill: boolean;
  /** This person's probation for the CURRENT month. */
  probationThisMonth: 'none' | 'active' | 'failed';
  /** Service days left between today and month end, on their route. */
  remainingServiceDays: number;
}

export function deriveInChargeGate(input: InChargeGateInput): InChargeGate {
  // Already in the portal -- including everyone mid-probation, who was
  // reassigned the moment they accepted.
  if (input.allowed) return 'in_duty';

  if (input.hasOutstandingBill) {
    // The pledge may only be offered when it is actually honourable: the
    // staffer must be eligible, have a route to mark, not have already failed
    // this month, and have at least one service day left to mark on.
    const canCommit =
      input.probationThisMonth === 'none' &&
      input.remainingServiceDays > 0 &&
      input.eligible &&
      input.hasRoute;
    return canCommit ? 'pledge' : 'must_pay';
  }

  if (input.eligible && input.assignedRouteCount === 0 && input.hasRoute) return 'choose';
  return 'denied';
}
