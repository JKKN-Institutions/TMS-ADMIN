/**
 * Pure IST booking-window logic. India has no DST, so IST is a fixed +5:30
 * offset and all math is deterministic integer arithmetic on UTC ms — no
 * timezone library, fully unit-testable. All `travelDate` values are 'YYYY-MM-DD'.
 */
const IST_OFFSET_MIN = 5 * 60 + 30; // +05:30
const DEFAULT_CUTOFF_HOUR_IST = 20; // 20:00 IST on the prior day
const DEFAULT_DAYS_AHEAD = 6;       // rolling horizon length (admin-configurable)

export type DayStatus = 'not_booked' | 'booked' | 'locked' | 'closed';

/** Optional per-call configuration threaded from admin settings at the route edge. */
export interface WindowOpts {
  cutoffHour?: number; // 0..23 IST; defaults to 20
  daysAhead?: number;  // 1..14; defaults to 6
}

/** 'YYYY-MM-DD' for the given instant rendered in IST. */
export function istToday(now: Date = new Date()): string {
  return new Date(now.getTime() + IST_OFFSET_MIN * 60_000).toISOString().slice(0, 10);
}

/** Calendar-safe add of whole days to a 'YYYY-MM-DD' string. */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * The booking cutoff instant for a travel date = `cutoffHour`:00 IST on the prior day.
 * Default 20:00 IST. travelDate 00:00 IST in UTC = Date.UTC(...) - 5:30h; then back up
 * to the prior day's cutoff hour.
 */
export function cutoffFor(travelDate: string, cutoffHour: number = DEFAULT_CUTOFF_HOUR_IST): Date {
  const [y, m, d] = travelDate.split('-').map(Number);
  const ms = Date.UTC(y, m - 1, d) - (IST_OFFSET_MIN + (24 - cutoffHour) * 60) * 60_000;
  return new Date(ms);
}

/**
 * The ascending bookable dates for the configurable rolling horizon:
 * tomorrow through today+`daysAhead`, inclusive. A Sunday inside the range stays in the
 * list but remains non-bookable via `isSunday` — callers already gate on it.
 */
export function bookableDates(now: Date = new Date(), daysAhead: number = DEFAULT_DAYS_AHEAD): string[] {
  const today = istToday(now);
  const out: string[] = [];
  for (let i = 1; i <= daysAhead; i++) out.push(addDays(today, i));
  return out;
}

/**
 * Sunday is a compulsory weekly holiday — buses never run, so a Sunday can never be
 * booked. Single source of truth for the rule. 0 = Sunday via UTC integer math.
 */
export function isSunday(travelDate: string): boolean {
  const [y, m, d] = travelDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0;
}

/** Within the rolling horizon AND before the cutoff (ignores the weekly-off rule). */
function withinBookingWindow(travelDate: string, now: Date, opts: WindowOpts = {}): boolean {
  if (!bookableDates(now, opts.daysAhead).includes(travelDate)) return false;
  return now.getTime() < cutoffFor(travelDate, opts.cutoffHour).getTime();
}

export function isBookingOpen(travelDate: string, now: Date = new Date(), opts: WindowOpts = {}): boolean {
  if (isSunday(travelDate)) return false; // weekly holiday — never bookable
  return withinBookingWindow(travelDate, now, opts);
}

/**
 * Cancellation follows the same horizon/cutoff window as booking, but is NOT blocked on
 * Sundays: a pre-existing Sunday booking must still be cancelable until its cutoff.
 */
export function isCancelable(travelDate: string, now: Date = new Date(), opts: WindowOpts = {}): boolean {
  return withinBookingWindow(travelDate, now, opts);
}

export function dayStatus(
  hasBooking: boolean,
  travelDate: string,
  now: Date = new Date(),
  opts: WindowOpts = {},
): DayStatus {
  const open = isBookingOpen(travelDate, now, opts);
  if (hasBooking) return open ? 'booked' : 'locked';
  return open ? 'not_booked' : 'closed';
}
