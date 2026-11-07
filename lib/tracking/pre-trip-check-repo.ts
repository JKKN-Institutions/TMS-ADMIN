/**
 * Database helpers for tms_pre_trip_check. Decision logic lives in ./pre-trip-check
 * (pure and unit-tested); this file only reads, writes and notifies.
 */
import type { createServiceRoleClient } from '@/lib/supabase/server';
import { dispatchNotification } from '@/lib/notifications/dispatch';
import { isMissingTableError, type PreTripLookup } from './pre-trip-check';

type Svc = ReturnType<typeof createServiceRoleClient>;

export const PRE_TRIP_SELECT =
  'id, driver_id, vehicle_id, trip_id, check_date, tyres_ok, brakes_ok, lights_ok, horn_ok, fuel_level_ok, first_aid_box_ok, odometer_km, odometer_photo_path, any_issue, notes, created_at';

export interface PreTripCheckRow {
  id: string;
  driver_id: string;
  vehicle_id: string;
  trip_id: string | null;
  check_date: string;
  tyres_ok: boolean;
  brakes_ok: boolean;
  lights_ok: boolean;
  horn_ok: boolean;
  fuel_level_ok: boolean;
  first_aid_box_ok: boolean;
  odometer_km: number;
  odometer_photo_path: string;
  any_issue: boolean;
  notes: string | null;
  created_at: string;
}

/** Today's check for this driver + bus. Throws on any error other than "table missing". */
export async function lookupTodayCheck(
  svc: Svc,
  driverId: string,
  vehicleId: string,
  today: string
): Promise<PreTripLookup> {
  const { data, error } = await svc
    .from('tms_pre_trip_check')
    .select('id')
    .eq('driver_id', driverId)
    .eq('vehicle_id', vehicleId)
    .eq('check_date', today)
    .maybeSingle();
  if (error) {
    if (isMissingTableError(error)) return { kind: 'table_missing' };
    throw error;
  }
  return data ? { kind: 'found', checkId: (data as { id: string }).id } : { kind: 'none' };
}

/**
 * Today's checks for this driver, keyed by vehicle id. Returns null when the table is
 * not deployed yet (the UI then hides the check rather than demanding one).
 */
export async function getTodayChecksByVehicle(
  svc: Svc,
  driverId: string,
  today: string
): Promise<Map<string, PreTripCheckRow> | null> {
  const { data, error } = await svc
    .from('tms_pre_trip_check')
    .select(PRE_TRIP_SELECT)
    .eq('driver_id', driverId)
    .eq('check_date', today);
  if (error) {
    if (isMissingTableError(error)) return null;
    throw error;
  }
  const rows = (data ?? []) as unknown as PreTripCheckRow[];
  return new Map(rows.map((r) => [r.vehicle_id, r]));
}

/** Record which trip this check cleared (first trip only). Best effort. */
export async function linkCheckToTrip(svc: Svc, checkId: string, tripId: string): Promise<void> {
  const { error } = await svc
    .from('tms_pre_trip_check')
    .update({ trip_id: tripId })
    .eq('id', checkId)
    .is('trip_id', null);
  if (error) console.error('linkCheckToTrip (non-fatal):', error);
}

/**
 * Profile ids of the transport head(s): anyone holding the transport_head role, via
 * user_roles (multi-role) or the legacy profiles.role column. Deliberately NOT
 * tms_users_with_permission('tms.dashboard.view'), which also returns every super
 * admin (15 people) — a flat tyre should reach the transport office, not everyone.
 */
export async function transportHeadProfileIds(svc: Svc): Promise<string[]> {
  const ids = new Set<string>();

  const { data: role, error: roleErr } = await svc
    .from('custom_roles')
    .select('id')
    .eq('role_key', 'transport_head')
    .eq('is_active', true)
    .maybeSingle();
  if (roleErr) throw roleErr;
  const roleId = (role as { id: string } | null)?.id;
  if (roleId) {
    const { data: ur, error: urErr } = await svc.from('user_roles').select('user_id').eq('role_id', roleId);
    if (urErr) throw urErr;
    for (const r of (ur ?? []) as { user_id: string | null }[]) if (r.user_id) ids.add(r.user_id);
  }

  const { data: legacy, error: legacyErr } = await svc
    .from('profiles')
    .select('id')
    .eq('role', 'transport_head');
  if (legacyErr) throw legacyErr;
  for (const p of (legacy ?? []) as { id: string }[]) ids.add(p.id);

  return [...ids];
}

/**
 * Alert the transport head that a pre-trip check found a problem. Uses the TMS
 * notification plane (in-app inbox + web push), the same path as grievances and
 * tracking reminders. Never throws; returns how many people it reached.
 */
export async function alertTransportHead(
  svc: Svc,
  opts: {
    checkId: string;
    driverId: string;
    driverName: string;
    vehicleId: string;
    busLabel: string;
    issues: string[];
    notes: string | null;
    actorId: string;
  }
): Promise<number> {
  try {
    const recipients = await transportHeadProfileIds(svc);
    if (recipients.length === 0) {
      console.error('alertTransportHead: no transport_head holder found; alert not delivered', opts.checkId);
      return 0;
    }
    const { recipientCount } = await dispatchNotification(svc, {
      title: `Pre-trip check: problem on ${opts.busLabel}`,
      body:
        `${opts.driverName} marked NOT OK: ${opts.issues.join(', ')}.` +
        (opts.notes ? ` Note: ${opts.notes}` : ''),
      category: 'alert',
      priority: 'high',
      url: null, // no admin page for pre-trip checks yet
      createdBy: opts.actorId || null,
      metadata: {
        kind: 'pre_trip_check',
        checkId: opts.checkId,
        driverId: opts.driverId,
        vehicleId: opts.vehicleId,
        issues: opts.issues,
      },
      idempotencyKey: `pre_trip_check:${opts.checkId}`,
      targeting: { type: 'users', user_ids: recipients },
    });
    return recipientCount;
  } catch (e) {
    console.error('alertTransportHead (non-fatal):', e);
    return 0;
  }
}
