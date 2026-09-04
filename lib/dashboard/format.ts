// Display helpers specific to the admin dashboard.
//
// Deliberately does NOT define currency or count formatters: the shared viz kit
// (app/(admin)/_viz/kit.tsx) already owns `inr`, `inrCompact` and `num`, and the
// Analytics and Bill Management pages render money through them. A second money
// formatter here would let the same rupee figure print two different ways on two
// screens, which is exactly the drift this project keeps having to undo.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * "just now" / "14m ago" / "3h ago" / "2d ago".
 *
 * The panel this feeds used to render the hardcoded string "2 minutes ago",
 * which stayed 2 minutes old forever. `now` is injectable so the behaviour is
 * testable without freezing the clock.
 */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';

  const diff = now.getTime() - then;
  // Clock skew between the DB and the browser can put a fresh row slightly in
  // the future; "in 3 seconds" would look broken, so clamp to "just now".
  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d ago`;

  return new Date(then).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** 'Mon' — compact x-axis label for the 7-day chart. */
export function shortDayLabel(date: string): string {
  // Parsed as local midnight (no trailing Z) so the weekday matches the IST
  // calendar date the server computed, rather than sliding a day west of UTC.
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString('en-IN', { weekday: 'short' });
}

/**
 * '07:30:00' -> '7:30 am'.
 *
 * Times are stored as a bare clock string with no timezone, because they mean
 * "7:30 in the morning, local" rather than an instant. So this formats the
 * string directly instead of building a Date, which would drag the browser's
 * timezone into a value that has none.
 */
export function formatTime(hhmmss: string | null): string {
  if (!hhmmss) return '—';
  const [h, m] = hhmmss.split(':');
  const hour = Number(h);
  const minute = Number(m);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return '—';

  const suffix = hour < 12 ? 'am' : 'pm';
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${String(minute).padStart(2, '0')} ${suffix}`;
}

/**
 * Share of `part` in `whole` as a whole-number percentage.
 * Returns null — not 0 — when there is no denominator, so the UI can omit the
 * figure instead of claiming a 0% boarding rate on a day with no bookings.
 */
export function percentOf(part: number, whole: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return null;
  return Math.round((part / whole) * 100);
}
