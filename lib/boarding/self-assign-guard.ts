/**
 * May this staffer take the bus in-charge duty right now?
 *
 * The in-charge duty carries a transport fee exemption. Someone who already
 * owes transport fees must not be able to hand themselves that exemption --
 * doing so cancels, in effect, a bill the transport office raised.
 *
 * This existed as a comment for weeks:
 *
 *   -- PHASE 2 SEAM (staff fees) --
 *   When staff transport fees exist, block here if this staffer is not cleared.
 *   No-op in Phase 1.
 *
 * Staff fees now exist. Between 2026-08-17 and 2026-08-18, twenty-six staff who
 * had been removed and billed on 08-14 walked back through the willingness
 * toggle and re-granted themselves the exemption. This function is that seam,
 * closed.
 *
 * The probation exception is load-bearing, not a loophole: accepting the pledge
 * is precisely how a billed staffer is meant to return, and the pledge route
 * creates the probation row before it assigns. Without this branch the guard
 * would reject the one path back that the design promises.
 */
export interface SelfAssignInput {
  hasOutstandingBill: boolean;
  hasActiveProbation: boolean;
}

export type SelfAssignVerdict =
  | { allowed: true }
  | { allowed: false; reason: 'outstanding_bill' };

export function maySelfAssign(input: SelfAssignInput): SelfAssignVerdict {
  if (input.hasOutstandingBill && !input.hasActiveProbation) {
    return { allowed: false, reason: 'outstanding_bill' };
  }
  return { allowed: true };
}
