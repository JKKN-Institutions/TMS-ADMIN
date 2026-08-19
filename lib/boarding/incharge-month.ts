/**
 * Pure month rules for the bus in-charge verdict.
 *
 * The daily loop in incharge-attendance.ts answers "did they miss today?". This
 * answers the different question the fee gate needs: "over this whole window,
 * was the duty performed?" -- which decides whether a transport fee bill is
 * cancelled or becomes payable.
 *
 * No I/O. The cron gathers booking dates and attendance dates; this decides.
 *
 * Two definitions carry the fairness of the whole feature:
 *
 *   SERVICE DAY -- a weekday on which the route actually carried booked riders.
 *   If nobody booked, there was nothing to mark, so the day is neither credit
 *   nor blame. Counting raw weekdays instead would punish in-charges for
 *   holidays and for buses the college did not run.
 *
 *   MARKED -- any attendance row for the route that day, either leg, by anyone
 *   assigned to it. Attendance is one shared roster per route per day and the
 *   first mark wins, so crediting only the person who marked would fail the
 *   colleagues who opened the app second. On one route nine in-charges share a
 *   single roster.
 */
import { isServiceWeekday } from './incharge-attendance';

export interface MonthVerdict {
  outcome: 'passed' | 'failed';
  requiredDays: number;
  markedDays: number;
  missedDates: string[];
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * The days in [from, to] on which this route actually ran.
 *
 * `bookedDates` comes straight from tms_booking, which holds ONE ROW PER RIDER
 * -- a full bus yields forty rows for the same date. Deduplication is therefore
 * not tidiness but correctness: without it a popular route's denominator would
 * be forty times its real size.
 */
export function serviceDays(bookedDates: string[], from: string, to: string): string[] {
  const days = new Set<string>();
  for (const d of bookedDates) {
    if (d >= from && d <= to && isServiceWeekday(d)) days.add(d);
  }
  // ISO 'YYYY-MM-DD' sorts correctly as plain strings, so no Date parsing is
  // needed -- and none is wanted, since the host timezone is not IST.
  return [...days].sort();
}

/**
 * Zero-miss rule: every service day in the window must be marked.
 *
 * An empty window PASSES. No service days means no duty was possible, and
 * billing someone for a bus that never ran is indefensible.
 *
 * `markedDates` is intersected with `serviceDays` rather than counted directly,
 * so a mark on a non-service day cannot push markedDays above requiredDays.
 */
export function evaluateMonth(input: {
  serviceDays: string[];
  markedDates: string[];
}): MonthVerdict {
  const marked = new Set(input.markedDates);
  const missedDates = input.serviceDays.filter((d) => !marked.has(d));
  return {
    outcome: missedDates.length === 0 ? 'passed' : 'failed',
    requiredDays: input.serviceDays.length,
    markedDays: input.serviceDays.length - missedDates.length,
    missedDates,
  };
}

/** Last calendar day of the month containing `date`, as 'YYYY-MM-DD'. */
function lastDayOfMonth(year: number, month1to12: number): string {
  // Day 0 of the NEXT month is the last day of this one. UTC throughout so the
  // host timezone cannot shift the answer across a month boundary.
  const d = new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
  return `${year}-${String(month1to12).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function parts(date: string): { y: number; m: number } {
  const m = DATE_RE.exec(date);
  // Throwing beats defaulting: every caller passes a date that decides a bill,
  // and a silently-wrong window would cancel or raise the wrong one.
  if (!m) throw new Error(`expected YYYY-MM-DD, received "${date}"`);
  return { y: Number(m[1]), m: Number(m[2]) };
}

/** The whole calendar month containing `date` — the ordinary verdict window. */
export function monthWindow(date: string): { start: string; end: string } {
  const { y, m } = parts(date);
  const mm = String(m).padStart(2, '0');
  return { start: `${y}-${mm}-01`, end: lastDayOfMonth(y, m) };
}

/**
 * The probation window: from the day the staffer accepted the pledge to the end
 * of that month. Their words: "up to today date to this month last".
 */
export function probationWindow(acceptDate: string): { start: string; end: string } {
  const { y, m } = parts(acceptDate);
  return { start: acceptDate, end: lastDayOfMonth(y, m) };
}
