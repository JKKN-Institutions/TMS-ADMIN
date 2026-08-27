/**
 * Which screen does this staffer see in the boarding portal?
 *
 * The sole authority on this question.
 *
 * States:
 *   'in_duty'  -- the full portal. Anyone holding an active in-charge
 *                 assignment gets it, unconditionally.
 *   'choose'   -- the willingness toggle: eligible, unbilled, not yet assigned.
 *   'must_pay' -- billed and unassigned. Only settling the fees reopens the
 *                 toggle.
 *   'denied'   -- the blocked screen.
 *
 * ORDER IS THE DESIGN. The bill is checked BEFORE the willingness toggle,
 * because a billed staffer who reached the toggle would re-grant themselves the
 * fee exemption -- which is precisely how twenty-six people escaped their bills
 * between 2026-08-17 and 08-18. That check is NOT part of attendance
 * enforcement (removed 2026-08-27); it guards the fee exemption itself, and
 * mirrors the server-side guard in lib/boarding/self-assign-guard.ts. Dropping
 * it here would only move the failure to a 403 on Confirm.
 */
export type InChargeGate = 'in_duty' | 'choose' | 'must_pay' | 'denied';

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
}

export function deriveInChargeGate(input: InChargeGateInput): InChargeGate {
  // Already assigned -- the full portal, with no further conditions.
  if (input.allowed) return 'in_duty';

  // Billed and unassigned: the toggle would hand out an exemption they have not
  // earned, so it is withheld until the bill is settled.
  if (input.hasOutstandingBill) return 'must_pay';

  if (input.eligible && input.assignedRouteCount === 0 && input.hasRoute) return 'choose';
  return 'denied';
}
