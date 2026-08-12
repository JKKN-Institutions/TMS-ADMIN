/**
 * Database helpers for tms_trip. All decision logic lives in ./trip-state (pure and
 * unit-tested); this file only reads and writes.
 */
import type { createServiceRoleClient } from '@/lib/supabase/server';
import type { TrackingSettings } from './settings';
import { isTripExpired, type TripDirection, type TripStatus } from './trip-state';

export interface TripRow {
  id: string;
  route_id: string;
  driver_id: string;
  vehicle_id: string;
  travel_date: string;
  direction: TripDirection;
  status: TripStatus;
  started_at: string;
  ended_at: string | null;
  end_reason: string | null;
  last_fix_at: string | null;
  start_latitude: number | null;
  start_longitude: number | null;
  end_latitude: number | null;
  end_longitude: number | null;
  distance_km: number;
  fix_count: number;
}

export const TRIP_SELECT =
  'id, route_id, driver_id, vehicle_id, travel_date, direction, status, started_at, ended_at, end_reason, last_fix_at, start_latitude, start_longitude, end_latitude, end_longitude, distance_km, fix_count';

interface ActiveTripProbe {
  id: string;
  driver_id: string;
  started_at: string;
  last_fix_at: string | null;
}

/**
 * End active trips that have gone silent past the expiry threshold.
 *
 * Called from READ paths (the driver's trip status, the admin fleet read) rather than
 * relying only on a scheduler. This project has two Vercel cron jobs that have never
 * fired in production; an expiry mechanism that depended solely on a scheduler would
 * reproduce the exact stuck-session bug it exists to fix. The pg_cron job is a
 * backstop, not the primary mechanism.
 *
 * Idempotent and safe to call concurrently: the UPDATE re-filters on status='active',
 * so a racing caller updates zero rows.
 *
 * Returns the number of trips expired.
 */
export async function expireStaleTrips(
  svc: ReturnType<typeof createServiceRoleClient>,
  settings: TrackingSettings
): Promise<number> {
  const { data, error } = await svc
    .from('tms_trip')
    .select('id, driver_id, started_at, last_fix_at')
    .eq('status', 'active');
  if (error || !data || data.length === 0) return 0;

  const nowMs = Date.now();
  const stale = (data as unknown as ActiveTripProbe[]).filter((t) =>
    isTripExpired(t.last_fix_at, t.started_at, nowMs, settings.tripExpiryMin)
  );
  if (stale.length === 0) return 0;

  const ids = stale.map((t) => t.id);
  const nowIso = new Date(nowMs).toISOString();
  const { error: upErr } = await svc
    .from('tms_trip')
    .update({ status: 'expired', ended_at: nowIso, end_reason: 'auto_expiry', updated_at: nowIso })
    .in('id', ids)
    .eq('status', 'active');
  if (upErr) {
    console.error('expireStaleTrips update failed:', upErr);
    return 0;
  }

  // Release the driver-side sharing flags so the driver app and the admin fleet view
  // agree with tms_trip rather than contradicting it.
  const driverIds = [...new Set(stale.map((t) => t.driver_id))];
  if (driverIds.length > 0) {
    await svc
      .from('tms_driver')
      .update({
        location_sharing_enabled: false,
        active_route_id: null,
        location_sharing_started_at: null,
      })
      .in('id', driverIds);
  }

  return ids.length;
}

/** The driver's current active trip, or null. Does NOT expire — call expireStaleTrips first. */
export async function getActiveTripForDriver(
  svc: ReturnType<typeof createServiceRoleClient>,
  driverId: string
): Promise<TripRow | null> {
  const { data } = await svc
    .from('tms_trip')
    .select(TRIP_SELECT)
    .eq('driver_id', driverId)
    .eq('status', 'active')
    .maybeSingle();
  return (data as unknown as TripRow | null) ?? null;
}
