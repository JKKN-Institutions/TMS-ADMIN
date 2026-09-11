import {
  activeDirection, formatHM, LEG_NAME,
  type AttDirection, type AttendanceWindows,
} from './attendance-window';

/**
 * trip-direction — which trip (morning or evening) a mark, scan or undo is for.
 * Pure, so each rule below is pinned by a test.
 *
 * The three callers need DIFFERENT rules, and that is the point of this file:
 *  - A scan, or a mark by ordinary staff: the SERVER CLOCK decides. A request
 *    naming a different trip is refused, not overridden — silently using the
 *    clock's trip would record an evening mark from a staffer looking at a
 *    stale morning roster.
 *  - A mark by a window-exempt caller (super admin, override holder): they
 *    correct marks OUTSIDE the windows, where the clock has no answer, so they
 *    name the trip.
 *  - An undo: there is no time window on undo, and it removes one specific
 *    existing mark, so it names the trip. The clock must not decide — an undo
 *    at 17:00 would otherwise delete the evening mark meant to be the morning one.
 */

export type DirectionDecision =
  | { ok: true; direction: AttDirection }
  | {
      ok: false;
      status: number;
      reason: 'window_closed' | 'wrong_trip' | 'evening_off' | 'bad_direction';
      error: string;
    };

const BAD: DirectionDecision = { ok: false, status: 400, reason: 'bad_direction', error: 'Unknown trip.' };
const EVENING_OFF: DirectionDecision = {
  ok: false, status: 409, reason: 'evening_off', error: 'Evening attendance is switched off.',
};

/** undefined/null/'' = none named; a known trip; or 'invalid'. */
function parseRequested(requested: unknown): AttDirection | null | 'invalid' {
  if (requested === undefined || requested === null || requested === '') return null;
  return requested === 'onward' || requested === 'return' ? requested : 'invalid';
}

/** "morning 7:00 AM–9:30 AM, evening 4:30 PM–7:00 PM" — every switched-on trip. */
export function openHoursText(w: AttendanceWindows): string {
  const legs = w.return.active ? [w.onward, w.return] : [w.onward];
  return legs
    .map((l) => `${LEG_NAME[l.direction].toLowerCase()} ${formatHM(l.start)}–${formatHM(l.end)}`)
    .join(', ');
}

export function decideMarkDirection(args: {
  windows: AttendanceWindows;
  requested: unknown;
  windowExempt: boolean;
  now?: Date;
}): DirectionDecision {
  const requested = parseRequested(args.requested);
  if (requested === 'invalid') return BAD;

  if (args.windowExempt) {
    if (requested === 'return' && !args.windows.return.active) return EVENING_OFF;
    return { ok: true, direction: requested ?? activeDirection(args.windows, args.now) ?? 'onward' };
  }

  const current = activeDirection(args.windows, args.now);
  if (!current) {
    return {
      ok: false, status: 409, reason: 'window_closed',
      error: `Attendance is open ${openHoursText(args.windows)} only.`,
    };
  }
  if (requested && requested !== current) {
    return {
      ok: false, status: 409, reason: 'wrong_trip',
      error: `It is the ${LEG_NAME[current].toLowerCase()} trip now. Reload the page to mark it.`,
    };
  }
  return { ok: true, direction: current };
}

export function decideClearDirection(args: {
  windows: AttendanceWindows;
  requested: unknown;
}): DirectionDecision {
  const requested = parseRequested(args.requested);
  if (requested === 'invalid') return BAD;
  if (requested === 'return' && !args.windows.return.active) return EVENING_OFF;
  return { ok: true, direction: requested ?? 'onward' };
}
