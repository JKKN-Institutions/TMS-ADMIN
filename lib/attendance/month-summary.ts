/**
 * month-summary — one learner's bus attendance totals for a set of rows
 * (usually one month). Pure.
 *
 * A learner has up to TWO rows a day (onward = morning, return = evening), so
 * "days present" counts DISTINCT dates with a present trip — counting rows
 * would credit a learner who rode both ways with two days. Auto absences
 * (method 'auto', written when nobody marked the rider before the window
 * closed) are kept apart: they are "not marked", not a seen no-show.
 */

export interface MonthRow {
  tripDate: string;
  direction: string;
  status: string;
  method: string | null;
}

export interface MonthSummary {
  daysPresent: number;
  onwardPresent: number;
  returnPresent: number;
  /** Days with BOTH the morning and the evening trip present. */
  bothTripDays: number;
  staffAbsent: number;
  autoAbsent: number;
}

export function summarizeMonth(rows: MonthRow[]): MonthSummary {
  const onwardDays = new Set<string>();
  const returnDays = new Set<string>();
  let staffAbsent = 0;
  let autoAbsent = 0;
  for (const r of rows) {
    if (r.status === 'present') {
      (r.direction === 'return' ? returnDays : onwardDays).add(r.tripDate);
    } else if (r.status === 'absent') {
      if (r.method === 'auto') autoAbsent += 1;
      else staffAbsent += 1;
    }
  }
  let bothTripDays = 0;
  for (const d of onwardDays) if (returnDays.has(d)) bothTripDays += 1;
  return {
    daysPresent: new Set([...onwardDays, ...returnDays]).size,
    onwardPresent: onwardDays.size,
    returnPresent: returnDays.size,
    bothTripDays,
    staffAbsent,
    autoAbsent,
  };
}

const MONTH_KEY = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isMonthKey(value: unknown): value is string {
  return typeof value === 'string' && MONTH_KEY.test(value);
}

/** Every date (YYYY-MM-DD) of a YYYY-MM month. UTC integer maths, no timezone. */
export function monthDays(month: string): string[] {
  const [y, m] = month.split('-').map(Number);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
}

/** The current IST month as YYYY-MM. */
export function istMonth(now: Date = new Date()): string {
  return new Date(now.getTime() + 5.5 * 3600_000).toISOString().slice(0, 7);
}
