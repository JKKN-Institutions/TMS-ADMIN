/**
 * Pure IST booking-window logic. India has no DST, so IST is a fixed +5:30
 * offset and all math is deterministic integer arithmetic on UTC ms — no
 * timezone library, fully unit-testable. All `travelDate` values are 'YYYY-MM-DD'.
 */
const IST_OFFSET_MIN = 5 * 60 + 30; // +05:30
const CUTOFF_HOUR_IST = 20; // 20:00 IST on the prior day

export type DayStatus = 'not_booked' | 'booked' | 'locked' | 'closed';

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
 * The booking cutoff instant for a travel date = 20:00 IST on the prior day.
 * travelDate 00:00 IST in UTC = Date.UTC(...) - 5:30h; minus 4h => prior 20:00 IST.
 */
export function cutoffFor(travelDate: string): Date {
  const [y, m, d] = travelDate.split('-').map(Number);
  const ms = Date.UTC(y, m - 1, d) - (IST_OFFSET_MIN + (24 - CUTOFF_HOUR_IST) * 60) * 60_000;
  return new Date(ms);
}

/**
 * The Saturday that closes the current bookable service week. India's transport
 * week runs Mon–Sat (Sunday is a compulsory holiday), so the last bookable day of
 * a week is its Saturday. Once today IS that Saturday — nothing left to book this
 * week — the window rolls to the NEXT Saturday, so the weekend can always book the
 * coming Monday before its Sunday-20:00 cutoff. Pure UTC integer math on the
 * 'YYYY-MM-DD' string (timezone-agnostic), so no offset is applied here.
 */
export function bookingWeekEnd(today: string): string {
  const [y, m, d] = today.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun..6=Sat
  const daysUntilSat = (6 - dow + 7) % 7;                  // 0 when today is Saturday
  return addDays(today, daysUntilSat === 0 ? 7 : daysUntilSat); // Saturday → next Saturday
}

/**
 * The ascending bookable dates for the current service week: tomorrow through
 * `bookingWeekEnd(today)`, inclusive. A Sunday that lands inside the range stays
 * in the list but remains non-bookable via `isSunday` — callers already gate on it.
 */
export function bookableDates(now: Date = new Date()): string[] {
  const today = istToday(now);
  const end = bookingWeekEnd(today);
  const out: string[] = [];
  for (let d = addDays(today, 1); d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/**
 * Sunday is a compulsory weekly holiday — buses never run, so a Sunday can
 * never be booked. This is the single source of truth for the rule; both the
 * calendar view (`cellStatus`) and the server booking gate (`effectiveOpen`,
 * POST) consult it. 0 = Sunday via UTC integer math (the 'YYYY-MM-DD' string
 * is timezone-agnostic, so there is no offset to apply here).
 */
export function isSunday(travelDate: string): boolean {
  const [y, m, d] = travelDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0;
}

/** Within the rolling horizon AND before the 20:00-prior cutoff (ignores the weekly-off rule). */
function withinBookingWindow(travelDate: string, now: Date): boolean {
  if (!bookableDates(now).includes(travelDate)) return false;
  return now.getTime() < cutoffFor(travelDate).getTime();
}

export function isBookingOpen(travelDate: string, now: Date = new Date()): boolean {
  if (isSunday(travelDate)) return false; // weekly holiday — never bookable
  return withinBookingWindow(travelDate, now);
}

/**
 * Cancellation follows the same horizon/cutoff window as booking, but is NOT
 * blocked on Sundays: a pre-existing Sunday booking (e.g. legacy data created
 * before this rule) must still be cancelable by the learner until its cutoff.
 */
export function isCancelable(travelDate: string, now: Date = new Date()): boolean {
  return withinBookingWindow(travelDate, now);
}

export function dayStatus(hasBooking: boolean, travelDate: string, now: Date = new Date()): DayStatus {
  const open = isBookingOpen(travelDate, now);
  if (hasBooking) return open ? 'booked' : 'locked';
  return open ? 'not_booked' : 'closed';
}
