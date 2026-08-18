/**
 * Delivery bookkeeping for the removal-bill notice: what its idempotency key is,
 * and which of the loaded notices still need sending.
 *
 * Split out of the route and kept pure because the preview and the send MUST
 * agree. The operator reads the preview and then presses a button that messages
 * real people about money they owe; if the two paths computed "already sent"
 * differently, the preview would be a lie in exactly the situation that matters
 * most — a retry after a partial failure.
 */

export interface DeliverableNotice {
  assignmentId: string;
  profileId: string | null;
  staffEmail: string;
}

/**
 * Keyed on the assignment, not the staffer: the assignment is what was removed
 * and billed. A staffer re-appointed and removed again on a later assignment is
 * a genuinely new event and gets a genuinely new notice.
 *
 * Backed by the unique partial index uq_tms_notification_idempotency, so this
 * string is the exactly-once guarantee, not a hint.
 */
export function removalNoticeIdempotencyKey(assignmentId: string): string {
  return `incharge-removal-bill:${assignmentId}`;
}

export interface DeliverySplit<T extends DeliverableNotice> {
  /** Deliverable and not yet delivered — the ones a send would actually message. */
  pending: T[];
  /** Already carries a notification with this key; sending again is a no-op. */
  alreadySent: T[];
  /** Removed and billed, but with no profile to deliver to. */
  unreachable: T[];
}

/**
 * Partitions loaded notices against the idempotency keys already in
 * tms_notification.
 *
 * Already-sent is tested BEFORE reachability: a notice that was delivered and
 * whose staff row later lost its profile link is settled business, and listing
 * it as "unreachable" would send someone chasing a login for a person who has
 * already been told.
 */
export function splitByAlreadySent<T extends DeliverableNotice>(
  notices: T[],
  sentKeys: Set<string>,
): DeliverySplit<T> {
  const out: DeliverySplit<T> = { pending: [], alreadySent: [], unreachable: [] };
  for (const n of notices) {
    if (sentKeys.has(removalNoticeIdempotencyKey(n.assignmentId))) out.alreadySent.push(n);
    else if (!n.profileId) out.unreachable.push(n);
    else out.pending.push(n);
  }
  return out;
}
