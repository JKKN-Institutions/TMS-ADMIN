/**
 * Which trip date a mark is written under, and whether this caller may name it.
 *
 * The attendance write path had no date dimension at all: it computed "today"
 * itself and the request body carried no date. A super admin was already exempt
 * from the route-assignment gate, the time window, the marking-method gate, the
 * in-charge share gate and mark ownership -- date was the one axis with no
 * exemption, which made the designated correction path unreachable.
 *
 * Pure, so every branch is testable without a database or a clock.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * How far back marking may reach when no transport year is marked current.
 *
 * A missing is_current row is a real state in this database. Returning null for
 * the floor would be worse than any fixed number: `date < null` is false in
 * JavaScript, so the guard would fail OPEN and permit marking any date back to
 * 1970.
 */
export const FALLBACK_FLOOR_DAYS = 365;

export interface DecideTripDateInput {
  /** The date the client named. Absent/empty ⇒ today, the legacy contract. */
  requested?: string | null;
  /** Today in IST, YYYY-MM-DD. */
  today: string;
  /** Earliest markable date, or null when unknown (see resolveFloor). */
  floor: string | null;
  isSuperAdmin: boolean;
  isOverrideHolder: boolean;
}

export type BackdateDecision =
  | { ok: true; date: string; isBackdated: boolean }
  | {
      ok: false;
      status: 400 | 403;
      error: string;
      reason: 'bad_date' | 'future_date' | 'before_floor' | 'not_permitted';
    };

/** `days` back from `date`, as YYYY-MM-DD. Integer UTC math, no timezone lib. */
function minusDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) - days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * The earliest date attendance may be marked for: the current transport year's
 * start, or a year back when no year is current. Never null -- see
 * FALLBACK_FLOOR_DAYS for why a null floor is a security hole rather than a
 * missing value.
 */
export function resolveFloor(yearStart: string | null, today: string): string {
  return yearStart && ISO_DATE.test(yearStart) ? yearStart : minusDays(today, FALLBACK_FLOOR_DAYS);
}

/**
 * Decide the trip date for this request.
 *
 * Checks run in this order deliberately: shape, then direction in time, then
 * authority. A malformed date is a client bug whatever the caller's rank, and
 * answering 403 to it would send an admin hunting for a permission problem.
 *
 * ISO dates compare correctly as strings (YYYY-MM-DD is lexicographically
 * ordered), so no Date objects are constructed for the comparisons.
 */
export function decideTripDate(input: DecideTripDateInput): BackdateDecision {
  const requested = (input.requested ?? '').trim();
  if (!requested) return { ok: true, date: input.today, isBackdated: false };

  if (!ISO_DATE.test(requested)) {
    return { ok: false, status: 400, reason: 'bad_date', error: 'date must be YYYY-MM-DD' };
  }
  if (requested === input.today) return { ok: true, date: input.today, isBackdated: false };

  if (requested > input.today) {
    return {
      ok: false, status: 400, reason: 'future_date',
      error: 'Attendance cannot be marked for a future date.',
    };
  }

  const floor = resolveFloor(input.floor, input.today);
  if (requested < floor) {
    return {
      ok: false, status: 400, reason: 'before_floor',
      error: `Attendance cannot be marked before ${floor}.`,
    };
  }

  if (!input.isSuperAdmin && !input.isOverrideHolder) {
    return {
      ok: false, status: 403, reason: 'not_permitted',
      error: 'Only the transport office can mark attendance for a past date.',
    };
  }

  return { ok: true, date: requested, isBackdated: true };
}
