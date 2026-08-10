/**
 * Pure IST booking-window logic. India has no DST, so IST is a fixed +5:30
 * offset and all math is deterministic integer arithmetic on UTC ms — no
 * timezone library, fully unit-testable. All `travelDate` values are 'YYYY-MM-DD'.
 *
 * The horizon is a walk over WORKING days: starting at tomorrow, it collects the
 * next `daysAhead` dates that are not Sundays, not service-calendar off days, and
 * not already past their cutoff. With the default `daysAhead` of 1 this means a
 * travel day is booked on the previous WORKING day — Friday opens Monday when the
 * Saturday is marked off, so nobody depends on opening the app over a weekend.
 */
const IST_OFFSET_MIN = 5 * 60 + 30; // +05:30
const DEFAULT_CUTOFF_HOUR_IST = 20; // 20:00 IST on the prior day
const DEFAULT_DAYS_AHEAD = 1;       // WORKING days (admin-configurable 1..10)
const MAX_LOOKAHEAD_DAYS = 21;      // search cap so a long holiday block can't loop

export type DayStatus = 'not_booked' | 'booked' | 'locked' | 'closed';

/** Optional per-call configuration threaded from admin settings at the route edge. */
export interface WindowOpts {
  cutoffHour?: number;      // 0..23 IST (24 = daily time window disabled); default 20
  daysAhead?: number;       // 1..10 WORKING days; default 1
  /**
   * Service-calendar holiday / no_service dates. Injected by the caller rather
   * than read here so this module stays pure and unit-testable — the DB access
   * lives at the route edge in loadExceptions().
   */
  offDates?: Set<string>;
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
 * Sunday is a compulsory weekly holiday — buses never run, so a Sunday can never be
 * booked. Single source of truth for the rule. 0 = Sunday via UTC integer math.
 */
export function isSunday(travelDate: string): boolean {
  const [y, m, d] = travelDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0;
}

/**
 * The walk shared by horizonDates() and bookableDates(). Starts at tomorrow and
 * collects the first `daysAhead` dates that are service days, optionally also
 * requiring the cutoff to still be open.
 */
function walkForward(now: Date, opts: WindowOpts, requireOpen: boolean): string[] {
  const want = opts.daysAhead ?? DEFAULT_DAYS_AHEAD;
  const cutoffHour = opts.cutoffHour ?? DEFAULT_CUTOFF_HOUR_IST;
  const today = istToday(now);
  const out: string[] = [];
  for (let i = 1; i <= MAX_LOOKAHEAD_DAYS && out.length < want; i++) {
    const date = addDays(today, i);
    if (isSunday(date)) continue;              // compulsory weekly holiday
    if (opts.offDates?.has(date)) continue;    // admin holiday / no-service day
    if (requireOpen && now.getTime() >= cutoffFor(date, cutoffHour).getTime()) continue;
    out.push(date);
  }
  return out;
}

/**
 * The dates a learner can actually book right now: the next `daysAhead` WORKING
 * days whose cutoff has not yet passed.
 *
 * Skipping already-closed days is what removes the nightly dead zone. With the
 * default daysAhead of 1, a learner at 20:01 would otherwise face an empty
 * calendar until midnight — tomorrow has closed and nothing else is in range.
 * Instead the window advances to the next still-open working day.
 *
 * Returns fewer dates (possibly none) rather than throwing when the 21-day cap
 * is exhausted — a long holiday block is a valid state.
 */
export function bookableDates(now: Date = new Date(), opts: WindowOpts = {}): string[] {
  return walkForward(now, opts, true);
}

/**
 * The same walk WITHOUT the cutoff filter. Used only for calendar cell labelling
 * so a day whose cutoff has just passed still reads 'closed' rather than greying
 * out as 'out_of_horizon'. Never use this to authorize a booking.
 */
export function horizonDates(now: Date = new Date(), opts: WindowOpts = {}): string[] {
  return walkForward(now, opts, false);
}

/**
 * Bookable = present in the current window. Sunday, service-calendar off days and
 * the cutoff are all already applied by the walk, so there is nothing to re-check.
 */
export function isBookingOpen(travelDate: string, now: Date = new Date(), opts: WindowOpts = {}): boolean {
  return bookableDates(now, opts).includes(travelDate);
}

/**
 * Cancellation is deliberately NOT tied to the booking horizon. Shrinking that
 * horizon to a single working day would otherwise strand every pre-existing
 * forward booking — learners hold seats weeks out — with no way to release the
 * seat. A booking is cancellable while its travel date is still in the future
 * AND its cutoff has not passed.
 *
 * Sunday is not gated here: a pre-existing Sunday booking must stay cancellable.
 */
export function isCancelable(travelDate: string, now: Date = new Date(), opts: WindowOpts = {}): boolean {
  if (travelDate <= istToday(now)) return false;
  return now.getTime() < cutoffFor(travelDate, opts.cutoffHour ?? DEFAULT_CUTOFF_HOUR_IST).getTime();
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
