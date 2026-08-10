/**
 * Pure targeting filter for the daily booking reminder.
 *
 * Deliberately kept in its OWN module with zero imports, for the same reason as
 * ./reminder-copy: the send routine in ./reminders.ts pulls in
 * lib/notifications/dispatch, which transitively imports `next/server`. Keeping
 * the pure filter separate means its unit tests never drag that runtime-only
 * chain into the test environment.
 */

export interface LearnerRow {
  id: string;
  profile_id: string | null;
}

/**
 * Who should receive the nudge.
 *
 * `term1Paid` of null means "unknown" — there is no current transport year, so
 * there is no Term-1 obligation to evaluate and nobody is filtered on fee
 * grounds. That mirrors the fail-open branch in tms_student_transport_access;
 * the two must not disagree, or the cron would nag learners the gate blocks.
 */
export function reminderTargets(
  learners: LearnerRow[],
  bookedLearnerIds: Set<string>,
  notifiedProfileIds: Set<string>,
  term1Paid: Set<string> | null,
): string[] {
  return learners
    .filter((l) => !bookedLearnerIds.has(l.id))
    .filter((l) => !!l.profile_id && !notifiedProfileIds.has(l.profile_id))
    .filter((l) => term1Paid === null || term1Paid.has(l.id))
    .map((l) => l.profile_id as string);
}
