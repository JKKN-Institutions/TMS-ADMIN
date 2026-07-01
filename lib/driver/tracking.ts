/**
 * Driver live-tracking ingest helpers.
 *
 * Two safeguards against a *stale broadcaster* corrupting the shared vehicle
 * position (the bug where a session whose `watchPosition` has frozen keeps
 * re-sending its last fix every ~12s, dragging every reader's marker back to
 * that point under `tms_vehicle` last-write-wins):
 *
 *  - `isFixStale` (client): stop POSTing once the latest fix has aged out, so a
 *    frozen watch goes quiet instead of spamming a position it no longer holds.
 *  - `normalizeCapturedAt` (server): validate the fix's capture time so the
 *    ingest can enforce a monotonic guard — only advance the vehicle when the
 *    incoming capture is newer than what's stored.
 */

/** How long a fix may go un-refreshed before the client stops broadcasting it. */
export const STALE_FIX_MS = 30_000;

/**
 * True when a fix captured at `fixTsMs` is older than `thresholdMs` relative to
 * `nowMs` — i.e. `watchPosition` has stopped delivering and the position is no
 * longer trustworthy. Future-dated fixes (clock jitter) are never stale.
 */
export function isFixStale(fixTsMs: number, nowMs: number, thresholdMs = STALE_FIX_MS): boolean {
  return nowMs - fixTsMs > thresholdMs;
}

/**
 * Normalise a client-supplied capture timestamp for the server's monotonic
 * guard. Returns the fix's own ISO time when it's a sane, parseable value;
 * otherwise `fallbackIso` (the server receive time) so old client bundles that
 * don't send one keep working. An OLDER time is deliberately preserved — that's
 * exactly how a frozen re-send gets rejected downstream — but any future device
 * time is clamped to now so a skewed clock can't poison the ordering baseline.
 */
export function normalizeCapturedAt(value: unknown, fallbackIso: string, nowMs: number): string {
  if (typeof value !== 'string') return fallbackIso;
  const t = Date.parse(value);
  if (Number.isNaN(t)) return fallbackIso;
  // Clamp any future device time to server-now: a phone clock running fast must not
  // stamp the ordering baseline into the future and lock out subsequent real fixes.
  if (t >= nowMs) return fallbackIso;
  return new Date(t).toISOString();
}

/**
 * The monotonic guard: should an incoming fix captured at `incomingIso` advance the
 * vehicle's stored position, given the currently-stored capture time `storedIso`?
 * Only when it is strictly newer. A frozen re-send carries the same (or older)
 * capture time and is therefore rejected once a fresher fix has landed — a null
 * stored time (first fix ever) always advances.
 */
export function isNewerCapture(storedIso: string | null | undefined, incomingIso: string): boolean {
  const i = Date.parse(incomingIso);
  if (Number.isNaN(i)) return false;
  if (!storedIso) return true;
  const s = Date.parse(storedIso);
  if (Number.isNaN(s)) return true;
  return i > s;
}
