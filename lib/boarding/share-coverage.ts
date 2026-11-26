/**
 * Pure rules for "did this in-charge do their job on this date?".
 *
 * lib/boarding/incharge-attendance.ts answers the ROUTE-level question the old
 * design asked. These answer the per-person question that replaces it.
 *
 * DUTY is deliberately narrower than the share. The attendance roster lists
 * every learner allocated to the bus, including the ones holding no ticket for
 * the day, and POST /api/boarding/attendance refuses to mark those. Scoring an
 * in-charge on students the API will not let them mark would make the rule
 * impossible to satisfy, so duty is the share intersected with the day's
 * bookings.
 *
 * No I/O — the callers gather the facts, these decide.
 */
import type { AttDirection } from './attendance-window';
import { absenceCoversTrip, type AbsenceTrip } from './absence-trip';

export interface AbsenceRow {
  assignment_id: string;
  /** 'YYYY-MM-DD' in IST. */
  absence_date: string;
  covering_assignment_id: string | null;
  cover_status: 'pending' | 'accepted' | 'declined' | 'uncovered';
  /**
   * Which trip the absence is for. Missing means the full day, which is what
   * every declaration meant before the choice existed.
   */
  trip?: AbsenceTrip | null;
}

export interface ShareCoverage {
  required: number;
  marked: number;
  missing: string[];
  covered: boolean;
}

/** The learners in this share who actually booked a seat for the date. */
export function shareDuty(input: { shareLearnerIds: string[]; bookedLearnerIds: string[] }): string[] {
  const booked = new Set(input.bookedLearnerIds);
  return input.shareLearnerIds.filter((id) => booked.has(id));
}

/**
 * Was the duty discharged? Present and absent both count — absent IS a mark,
 * and an in-charge who records an empty seat has done exactly their job.
 *
 * An empty duty is covered: no duty was possible, so the day is neither credit
 * nor blame. This mirrors the existing `no_travel_day` skip.
 */
export function shareCovered(input: { duty: string[]; markedLearnerIds: string[] }): ShareCoverage {
  const marked = new Set(input.markedLearnerIds);
  const missing = input.duty.filter((id) => !marked.has(id));
  return {
    required: input.duty.length,
    marked: input.duty.length - missing.length,
    missing,
    covered: missing.length === 0,
  };
}

/**
 * A declared absence excuses the absentee for that date, whether or not anyone
 * accepted the cover. Responsibility for finding cover is not placed on someone
 * who is off sick; the uncovered share shows on the admin coverage board
 * instead.
 *
 * `direction` is the trip being asked about and is required on purpose: a
 * morning-only absence must not excuse the evening trip, and a caller that
 * could leave it out would quietly excuse both.
 */
export function isExcused(
  assignmentId: string,
  date: string,
  absences: AbsenceRow[],
  direction: AttDirection,
): boolean {
  return absences.some(
    (a) => a.assignment_id === assignmentId && a.absence_date === date && absenceCoversTrip(a.trip, direction),
  );
}

/**
 * The OTHER assignments whose shares this in-charge must also mark on this
 * date. Only an ACCEPTED cover transfers duty: a pending request has not been
 * agreed to, and making someone answerable for a share they never accepted is
 * the same unfairness the route-level rule had, pointed the other way.
 *
 * The hand-over is for the declared trip only. Cover accepted for a morning
 * absence gives no right to mark that share in the evening, when its own
 * in-charge is back on the bus.
 */
export function delegatedTo(
  assignmentId: string,
  date: string,
  absences: AbsenceRow[],
  direction: AttDirection,
): string[] {
  return absences
    .filter(
      (a) =>
        a.absence_date === date &&
        a.cover_status === 'accepted' &&
        a.covering_assignment_id === assignmentId &&
        absenceCoversTrip(a.trip, direction),
    )
    .map((a) => a.assignment_id);
}
