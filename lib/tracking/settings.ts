/**
 * Tracking thresholds, configurable per deployment via the `admin_settings` row
 * `setting_type = 'tracking'`.
 *
 * The defaults deliberately mirror constants already in use elsewhere, so an absent
 * settings row changes no behaviour: 2 min / 5 min freshness matches
 * lib/gps/freshness.ts, and the 30 min expiry matches STUCK_AFTER_MIN in
 * lib/gps/route-status.ts.
 */
import type { createServiceRoleClient } from '@/lib/supabase/server';

export interface TrackingSettings {
  /** Fix no older than this ⇒ LIVE. */
  liveMaxSec: number;
  /** Fix no older than this ⇒ STALE; beyond it ⇒ OFFLINE. */
  staleMaxSec: number;
  /** Reserved for the admin fleet view's coarse bucketing. */
  offlineMaxMin: number;
  /** Active trip silent this long ⇒ auto-expired. */
  tripExpiryMin: number;
  /** Stationary this long during an active trip ⇒ UNEXPECTED_STOP (Phase 5). */
  unexpectedStopMin: number;
  /** Fixes with accuracy worse than this many metres are rejected at ingest. */
  minAccuracyM: number;
  /** Stop geofence radius in metres (Phase 4). */
  stopGeofenceM: number;
}

export const DEFAULT_TRACKING_SETTINGS: TrackingSettings = {
  liveMaxSec: 120,
  staleMaxSec: 300,
  offlineMaxMin: 30,
  tripExpiryMin: 30,
  unexpectedStopMin: 10,
  minAccuracyM: 100,
  stopGeofenceM: 150,
};

const KEYS = Object.keys(DEFAULT_TRACKING_SETTINGS) as (keyof TrackingSettings)[];

/**
 * Merge a stored settings blob over the defaults. Anything that is not a positive
 * finite number is ignored rather than trusted — a corrupt row must degrade to the
 * defaults, never to NaN thresholds that would classify every bus as OFFLINE.
 */
export function parseTrackingSettings(raw: unknown): TrackingSettings {
  const out: TrackingSettings = { ...DEFAULT_TRACKING_SETTINGS };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const rec = raw as Record<string, unknown>;
  for (const k of KEYS) {
    const v = rec[k];
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) out[k] = v;
  }
  return out;
}

/** Load the thresholds; falls back to defaults when the row is absent or unreadable. */
export async function loadTrackingSettings(
  svc: ReturnType<typeof createServiceRoleClient>
): Promise<TrackingSettings> {
  const { data } = await svc
    .from('admin_settings')
    .select('settings_data')
    .eq('setting_type', 'tracking')
    .maybeSingle();
  return parseTrackingSettings((data as { settings_data?: unknown } | null)?.settings_data);
}
