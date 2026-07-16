export type BoardingAccess = 'allowed' | 'choose' | 'denied';

export interface BoardingAccessInput {
  /** Holds tms.attendance.scan AND is assigned to at least one active route. */
  allowed: boolean;
  /** Active bus_required staff (the eligibility RPC's verdict). */
  eligible: boolean;
  /** Active tms_staff_route_assignment rows for this staffer. */
  assignedRouteCount: number;
  /** staff.transport_route_id resolves to an ACTIVE route. */
  hasRoute: boolean;
}

/**
 * What may this staffer see in the boarding portal?
 *
 *  - 'allowed' — the full portal.
 *  - 'choose'  — the in-charge willingness toggle (eligible, not yet assigned,
 *                and their staff-master route is usable).
 *  - 'denied'  — the blocked screen.
 *
 * `assignedRouteCount === 0` is required for 'choose' so an already-assigned
 * staffer whose role grant failed is denied rather than offered a toggle the
 * server would reject with 409. The layout's 'checking' state is NOT modelled
 * here: it means "the fetch has not resolved yet", which is not a decision.
 */
export function deriveBoardingAccess(input: BoardingAccessInput): BoardingAccess {
  if (input.allowed) return 'allowed';
  if (input.eligible && input.assignedRouteCount === 0 && input.hasRoute) return 'choose';
  return 'denied';
}
