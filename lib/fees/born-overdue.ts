// lib/fees/born-overdue.ts
// A bill is "born overdue" when it is created with a due date that has already
// passed. This happens whenever a learner is onboarded after a term fell due —
// and because tms_student_transport_access is fail-closed on a paid Term 1, such
// a learner is locked out of the student portal the moment they are billed.
//
// The remedy is NOT to move the due date (TMS and MyJKKN must agree on it), but
// to make the count visible so an operator can see it happening.

/**
 * How many of these terms are already past due on `today`?
 * Both dates are ISO `YYYY-MM-DD`, which compares correctly as a string.
 * A term due TODAY is not overdue — the learner still has the day to pay.
 */
export function countBornOverdue(
  terms: Array<{ due_date: string }>,
  today: string
): number {
  return terms.reduce((n, t) => (t.due_date < today ? n + 1 : n), 0);
}
