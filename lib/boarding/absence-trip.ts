/**
 * Which trip an in-charge's declared absence is for. Pure, no I/O.
 *
 * The values are the attendance directions ('onward' = morning, 'return' =
 * evening) plus 'full_day', so "which trip" has one vocabulary across the
 * boarding module (tms_attendance.direction, tms_incharge_absence.trip).
 */
import type { AttDirection } from './attendance-window';

export type AbsenceTrip = 'full_day' | AttDirection;

/** In the order the dialog offers them. */
export const ABSENCE_TRIPS: readonly AbsenceTrip[] = ['onward', 'return', 'full_day'];

/** The words staff see. Morning / Evening match the attendance tabs (LEG_NAME). */
export const ABSENCE_TRIP_LABEL: Record<AbsenceTrip, string> = {
  full_day: 'Full day',
  onward: 'Morning',
  return: 'Evening',
};

/**
 * A request's `trip`. Nothing sent means the full day: that is what every
 * declaration meant before the choice existed, and an installed app still
 * running the old dialog sends none. Anything unrecognised is null, for the
 * caller to refuse -- never fall back to full day on a bad value, or a typo
 * excuses a trip the in-charge is actually riding.
 */
export function parseAbsenceTrip(value: unknown): AbsenceTrip | null {
  if (value === undefined || value === null || value === '') return 'full_day';
  return value === 'full_day' || value === 'onward' || value === 'return' ? value : null;
}

/**
 * Does an absence declared for `trip` apply to the `direction` being asked
 * about? A row with no trip (read by a select that predates the column) is a
 * full day.
 */
export function absenceCoversTrip(trip: AbsenceTrip | null | undefined, direction: AttDirection): boolean {
  return !trip || trip === 'full_day' || trip === direction;
}
