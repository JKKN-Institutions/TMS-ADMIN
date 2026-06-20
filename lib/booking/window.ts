/**
 * Pure IST booking-window logic. India has no DST, so IST is a fixed +5:30
 * offset and all math is deterministic integer arithmetic on UTC ms — no
 * timezone library, fully unit-testable. All `travelDate` values are 'YYYY-MM-DD'.
 */
const IST_OFFSET_MIN = 5 * 60 + 30; // +05:30
const CUTOFF_HOUR_IST = 18; // 18:00 IST on the prior day
const HORIZON_DAYS = 7; // bookable: tomorrow .. tomorrow+6

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
 * The booking cutoff instant for a travel date = 18:00 IST on the prior day.
 * travelDate 00:00 IST in UTC = Date.UTC(...) - 5:30h; minus 6h => prior 18:00 IST.
 */
export function cutoffFor(travelDate: string): Date {
  const [y, m, d] = travelDate.split('-').map(Number);
  const ms = Date.UTC(y, m - 1, d) - (IST_OFFSET_MIN + (24 - CUTOFF_HOUR_IST) * 60) * 60_000;
  return new Date(ms);
}

/** The 7 ascending bookable dates (tomorrow..+6) relative to IST today. */
export function bookableDates(now: Date = new Date()): string[] {
  const today = istToday(now);
  return Array.from({ length: HORIZON_DAYS }, (_, i) => addDays(today, i + 1));
}

export function isBookingOpen(travelDate: string, now: Date = new Date()): boolean {
  if (!bookableDates(now).includes(travelDate)) return false;
  return now.getTime() < cutoffFor(travelDate).getTime();
}

/** Cancellation is allowed under the same condition as booking (free until cutoff). */
export function isCancelable(travelDate: string, now: Date = new Date()): boolean {
  return isBookingOpen(travelDate, now);
}

export function dayStatus(hasBooking: boolean, travelDate: string, now: Date = new Date()): DayStatus {
  const open = isBookingOpen(travelDate, now);
  if (hasBooking) return open ? 'booked' : 'locked';
  return open ? 'not_booked' : 'closed';
}
