export const DEFAULT_INTERVAL_DAYS = 30;
export const DUE_SOON_DAYS = 7;
export type DueState = 'never' | 'overdue' | 'due_soon' | 'ok';

/** admin_settings(setting_type='inspection').settings_data → interval in days (1..365, default 30). */
export function parseIntervalDays(data: unknown): number {
  const n = Number((data as { interval_days?: unknown } | null)?.interval_days);
  return Number.isInteger(n) && n >= 1 && n <= 365 ? n : DEFAULT_INTERVAL_DAYS;
}

const toUtc = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));

/** YYYY-MM-DD + n days (calendar math, timezone-free). */
export function addDays(date: string, n: number): string {
  return new Date(toUtc(date) + n * 86_400_000).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000);
}

/** `lastSubmittedDate` is the IST calendar date of the last submitted inspection. */
export function dueInfo(lastSubmittedDate: string | null, intervalDays: number, today: string) {
  if (!lastSubmittedDate) return { state: 'never' as DueState, dueOn: null, daysLeft: null };
  const dueOn = addDays(lastSubmittedDate, intervalDays);
  const daysLeft = daysBetween(today, dueOn);
  const state: DueState = daysLeft < 0 ? 'overdue' : daysLeft <= DUE_SOON_DAYS ? 'due_soon' : 'ok';
  return { state, dueOn, daysLeft };
}
