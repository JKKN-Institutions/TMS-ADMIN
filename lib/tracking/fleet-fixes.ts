/**
 * The newest broadcast position for EACH bus.
 *
 * The fleet topic carries every bus's fixes interleaved. Remembering only "the last
 * message" means each message from one bus throws away what we knew about all the
 * others, which then fall back to their older polled position and jump backwards on
 * the map. Keyed by route, every bus keeps its own latest position.
 *
 * Pure: no React, no Supabase.
 */
import type { LiveFix } from './broadcast';

const atMs = (iso: string | null | undefined) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? 0 : t;
};

/**
 * Record `fix` if it is newer than what we hold for its route. Returns true when the
 * map changed. Messages can arrive out of order; an older one never overwrites a
 * newer one.
 */
export function keepLatest(byRoute: Map<string, LiveFix>, fix: LiveFix | null | undefined): boolean {
  if (!fix || typeof fix.routeId !== 'string' || !fix.routeId) return false;
  if (typeof fix.latitude !== 'number' || typeof fix.longitude !== 'number') return false;
  const held = byRoute.get(fix.routeId);
  if (held && atMs(held.at) >= atMs(fix.at)) return false;
  byRoute.set(fix.routeId, fix);
  return true;
}

/**
 * The broadcast fix to draw for a route, or null when the polled snapshot is at least
 * as new. A route the server has never seen a position for (`polledAt` null) takes
 * any broadcast fix.
 */
export function newerFix(
  byRoute: ReadonlyMap<string, LiveFix>,
  routeId: string,
  polledAt: string | null | undefined,
): LiveFix | null {
  const fix = byRoute.get(routeId);
  if (!fix) return null;
  return atMs(fix.at) > atMs(polledAt) ? fix : null;
}
