/**
 * Is a bus position LIVE right now? One rule for every tracking screen, worked out
 * from the position's age against the viewer's clock.
 *
 * The server also classifies positions, but only at the moment it is asked. With the
 * realtime feed up the server is asked every 30 seconds, and a page left open with no
 * network is never asked again — so a label computed there can sit on screen long
 * after it stopped being true. Ageing the position here means "LIVE" expires by
 * itself.
 *
 * Pure: no DOM, no timers.
 */

/** live = reporting now. delayed = reported minutes ago. off = only a last known place. */
export type Liveness = 'live' | 'delayed' | 'off';

/** The driver's phone sends every 6 s; two minutes of silence is no longer "now". */
export const LIVE_MAX_MS = 2 * 60_000;
/** Past this the bus is not usefully "on its way" any more — it is a last known place. */
export const DELAYED_MAX_MS = 5 * 60_000;
/** Positions older than this are not drawn on the fleet map unless that route is picked. */
export const MAP_MAX_AGE_MS = 12 * 60 * 60_000;

function ageMs(lastFixAt: string | null | undefined, nowMs: number): number | null {
  if (!lastFixAt) return null;
  const t = Date.parse(lastFixAt);
  if (Number.isNaN(t)) return null;
  // A phone clock a little ahead of ours must not produce a negative age.
  return Math.max(0, nowMs - t);
}

export function livenessOf(lastFixAt: string | null | undefined, nowMs: number): Liveness {
  const age = ageMs(lastFixAt, nowMs);
  if (age == null) return 'off';
  if (age <= LIVE_MAX_MS) return 'live';
  if (age <= DELAYED_MAX_MS) return 'delayed';
  return 'off';
}

/** Recent enough to draw on the fleet map without being asked for. */
export function isRecentForMap(lastFixAt: string | null | undefined, nowMs: number): boolean {
  const age = ageMs(lastFixAt, nowMs);
  return age != null && age <= MAP_MAX_AGE_MS;
}

/**
 * How long ago, in words a person reads at a glance: "just now", "40 s ago",
 * "3 min ago", then a clock time today ("09:05") and a date before that ("24 Aug").
 */
export function agoText(lastFixAt: string | null | undefined, nowMs: number): string {
  const age = ageMs(lastFixAt, nowMs);
  if (age == null) return 'never';
  if (age < 10_000) return 'just now';
  if (age < 60_000) return `${Math.round(age / 10_000) * 10} s ago`;
  if (age < 60 * 60_000) return `${Math.round(age / 60_000)} min ago`;
  const d = new Date(Date.parse(lastFixAt as string));
  const sameDay = d.toDateString() === new Date(nowMs).toDateString();
  return sameDay
    ? d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
    : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** One short status line: "Live", "Delayed · 3 min ago", "Last seen 09:05". */
export function livenessText(lastFixAt: string | null | undefined, nowMs: number): string {
  const l = livenessOf(lastFixAt, nowMs);
  if (l === 'live') return 'Live';
  if (l === 'delayed') return `Delayed · ${agoText(lastFixAt, nowMs)}`;
  return lastFixAt ? `Last seen ${agoText(lastFixAt, nowMs)}` : 'No position yet';
}

/**
 * How far this device's clock is from the server's, in ms (add it to Date.now()).
 *
 * Position times are stamped by the server. Ageing them against a phone whose clock
 * is ten minutes fast would call every live bus stale; ten minutes slow would call a
 * stale one live. The endpoints send their own time with each answer; the difference
 * to when that answer arrived is the correction. 0 when the server sent no time.
 */
export function clockOffsetMs(serverNowIso: string | null | undefined, receivedAtMs: number): number {
  if (!serverNowIso || !receivedAtMs) return 0;
  const t = Date.parse(serverNowIso);
  return Number.isNaN(t) ? 0 : t - receivedAtMs;
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
/** Compass word for a heading in degrees clockwise from north, or null. */
export function compassOf(heading: number | null | undefined): string | null {
  if (heading == null || Number.isNaN(heading)) return null;
  return COMPASS[Math.round((((heading % 360) + 360) % 360) / 45) % 8];
}
