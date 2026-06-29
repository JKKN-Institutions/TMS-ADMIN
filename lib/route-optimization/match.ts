/**
 * Route Optimization — stop matching (pure).
 *
 * Decides whether a passenger's boarding stop can be served by another route,
 * and which target stop they'd move to. Replaces the old name-only equality with
 * a scored match:
 *   - same normalized NAME and pickup TIME within ±timeWindowMin, OR
 *   - geographic PROXIMITY within proximityKm (when both stops are geocoded),
 *     still requiring time compatibility when times are known.
 * Same-name-but-very-different-time is rejected — that's a different trip, not a
 * real transfer. Geo is a no-op until stops have lat/long (see geocode phase).
 */
import { haversineKm } from '../geo/distance';

/** Lowercase, strip punctuation, collapse whitespace — for stop-name equality. */
export function normalizeStopName(name: string | null | undefined): string {
  return (name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 'HH:MM' or 'HH:MM:SS' → minutes since midnight, or null if unparseable. */
export function timeToMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export interface MatchStop {
  id: string;
  name: string | null;
  /** Morning pickup time ('HH:MM[:SS]'). */
  stopTime: string | null;
  lat: number | null;
  long: number | null;
}

export interface MatchOptions {
  /** Max |pickup-time difference| in minutes for a compatible transfer. */
  timeWindowMin: number;
  /** Max distance (km) to accept a differently-named but nearby stop. */
  proximityKm: number;
}

export interface StopMatch {
  stopId: string;
  score: number;
  reason: string;
}

function hasCoords(s: MatchStop): s is MatchStop & { lat: number; long: number } {
  return typeof s.lat === 'number' && typeof s.long === 'number';
}

/**
 * Best target stop among `candidates` for the passenger's `from` stop, or null.
 * Higher score = better. Name match is preferred; proximity is the geo fallback;
 * time closeness refines and can veto an otherwise-name-equal but off-schedule stop.
 */
export function bestStopMatch(
  from: MatchStop,
  candidates: MatchStop[],
  opts: MatchOptions
): StopMatch | null {
  const fromKey = normalizeStopName(from.name);
  const fromMin = timeToMinutes(from.stopTime);
  let best: StopMatch | null = null;

  for (const c of candidates) {
    if (c.id === from.id) continue;
    const cMin = timeToMinutes(c.stopTime);
    const timeDiff = fromMin !== null && cMin !== null ? Math.abs(fromMin - cMin) : null;
    const timeOk = timeDiff === null || timeDiff <= opts.timeWindowMin;

    const nameEqual = !!fromKey && fromKey === normalizeStopName(c.name);
    const dist =
      hasCoords(from) && hasCoords(c)
        ? haversineKm({ lat: from.lat, long: from.long }, { lat: c.lat, long: c.long })
        : null;
    const geoClose = dist !== null && dist <= opts.proximityKm;

    // Feasible only if (name OR geo) AND time is compatible (when known).
    if (!(nameEqual || geoClose) || !timeOk) continue;

    // Score: name match dominates; geo adds; penalize time gap and distance.
    let score = 0;
    let reason = '';
    if (nameEqual) {
      score += 100;
      reason = 'same stop';
    }
    if (geoClose) {
      score += 50;
      reason = reason ? `${reason} + nearby` : `within ${dist!.toFixed(1)} km`;
    }
    if (timeDiff !== null) {
      score -= timeDiff; // closer pickup time wins
      reason += `, ~${timeDiff} min apart`;
    }
    if (dist !== null) score -= dist * 5;

    if (!best || score > best.score) best = { stopId: c.id, score, reason };
  }

  return best;
}
