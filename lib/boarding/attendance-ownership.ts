/**
 * Pure decision logic for who may write an attendance mark.
 *
 * A route can have a dozen boarding staff and they share ONE roster:
 * tms_attendance holds exactly one row per (learner_id, trip_date, direction).
 * Splitting the marking between staff is the INTENDED workflow — on route 16
 * four of twelve staff marked 31 learners between them on 2026-07-29, and all
 * twelve see the result. None of that changes here.
 *
 * What this guards is the SECOND write to an already-marked row. The upsert it
 * sits in front of is `onConflict: 'learner_id,trip_date,direction'` with no
 * guard at all, so without this any of those twelve could silently flip a
 * colleague's mark, and nothing would record that the first mark ever existed.
 *
 * No I/O here on purpose — the routes gather the facts, this decides. Same shape
 * as lib/boarding/incharge-attendance.ts.
 */

export type MarkStatus = 'present' | 'absent';

export interface ExistingMark {
  status: MarkStatus;
  /** tms_attendance.scanned_by. NULL when the marker's profile was deleted. */
  scannedBy: string | null;
}

export type MarkDecision =
  | { action: 'write' }
  | { action: 'override'; from: MarkStatus; previousBy: string | null }
  | { action: 'noop'; reason: 'already_that_status' }
  | { action: 'deny'; reason: 'locked' };

export interface MarkInputFacts {
  existing: ExistingMark | null;
  requestedStatus: MarkStatus;
  actorId: string;
  /** Holds tms.attendance.override — transport_head, and nobody else. */
  isOverrideHolder: boolean;
  isSuperAdmin: boolean;
  /** TRUE for a QR/6-digit scan, FALSE for the manual Present/Absent button. */
  viaScan: boolean;
}

export function decideMark(f: MarkInputFacts): MarkDecision {
  const { existing } = f;

  // Nothing recorded yet — any staff assigned to the route may create the mark.
  // That is the shared-roster behaviour and it is deliberately unrestricted.
  if (!existing) return { action: 'write' };

  // Re-asserting the status already on the row changes nothing, so it can never
  // be a conflict — check this BEFORE ownership.
  //
  // This is the stale-screen case: the roster polls every 15s, so Staff B's
  // screen can still read "unmarked" when they tap Present even though Staff A
  // marked Present forty seconds ago. Returning a lock error there would punish
  // someone who did nothing wrong and never even saw a lock icon.
  if (existing.status === f.requestedStatus) {
    return { action: 'noop', reason: 'already_that_status' };
  }

  // An orphaned row belongs to nobody. scanned_by is `references profiles(id) on
  // delete set null`, so deleting a staff profile nulls the marker on every row
  // they ever created. Without this branch those rows would be locked against
  // everyone, permanently, with no correction path.
  if (existing.scannedBy === null) return { action: 'write' };

  // Your own mark is always yours to correct — that stays a single tap.
  if (existing.scannedBy === f.actorId) return { action: 'write' };

  // Someone else's mark. Three keys open it:
  //  • transport_head / super admin — the designated correction path;
  //  • a QR scan — a scanned pass is physical proof the learner boarded. A scan
  //    only ever requests 'present', so this branch is strictly absent → present.
  //    It cannot flip a present learner to absent, because a scan is evidence of
  //    boarding and of nothing else.
  if (f.isOverrideHolder || f.isSuperAdmin || f.viaScan) {
    return { action: 'override', from: existing.status, previousBy: existing.scannedBy };
  }

  return { action: 'deny', reason: 'locked' };
}

/**
 * Whether the actor may DELETE a mark outright (the clear/undo endpoint).
 *
 * Deleting is not a status change, so it does not go through decideMark — but it
 * carries the same ownership rule, and the endpoint is currently unreachable from
 * the UI yet still lets any assigned staff wipe any mark on the route.
 */
export function canClearMark(f: {
  existing: ExistingMark | null;
  actorId: string;
  isOverrideHolder: boolean;
  isSuperAdmin: boolean;
}): boolean {
  if (!f.existing) return true;
  if (f.existing.scannedBy === null) return true;
  if (f.existing.scannedBy === f.actorId) return true;
  return f.isOverrideHolder || f.isSuperAdmin;
}
