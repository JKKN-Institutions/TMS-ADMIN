/**
 * Server-side: mark a driver inactive or active.
 *
 * "Inactive" is the employee flag on the `staff` row shared with MyJKKN
 * (`staff.is_active`), so the person shows as Inactive in MyJKKN's employee list
 * and MyJKKN's own triggers lock their sign-in. TMS then tidies its own side:
 * the driver is taken off their route and bus and stops sharing location.
 *
 * Takes the service-role client as a parameter and does no auth itself: the
 * route owns auth, permission and activity logging. That client bypasses
 * MyJKKN's guards, so the Driver-category gate here is the only one.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { translateStaffDbError } from './db-errors';
import { OnboardError } from './onboard';
import { DRIVER_CATEGORY_ID, DRIVER_ROLE_KEY, canFullEdit } from './onboarding-constants';

export const RECORD_MANAGED_ELSEWHERE_MESSAGE = "This person's record is managed in MyJKKN.";
export const TRIP_RUNNING_MESSAGE = 'This driver has a trip running. End the trip first, then mark them inactive.';
export const RELEASE_WARNING = 'Marked inactive, but some assignments were not cleared. Check their route and bus.';

export interface ReleaseResult {
  /** Routes the driver was taken off. */
  routes: { id: string; label: string }[];
  /** Tracking phones still recorded against the driver (left for the handover flow). */
  mobilesHeld: number;
  warning?: string;
}

export interface SetActiveResult extends ReleaseResult {
  id: string;
  name: string;
  active: boolean;
  /** False when the employee was already in the requested state. */
  changed: boolean;
}

/** Refuse to make a driver inactive in the middle of a trip. */
export async function assertNoRunningTrip(svc: SupabaseClient, driverId: string): Promise<void> {
  const ops = await svc.from('tms_driver').select('id').eq('staff_id', driverId).maybeSingle();
  if (ops.error) {
    console.error('Driver status: tms_driver lookup failed:', ops.error);
    throw new OnboardError({ status: 500, error: 'Could not check for a running trip. Try again.' });
  }
  const opsId = (ops.data as { id: string } | null)?.id;
  if (!opsId) return; // No transport record means no trips.

  const trips = await svc.from('tms_trip').select('id').eq('driver_id', opsId).eq('status', 'active');
  if (trips.error) {
    console.error('Driver status: trip lookup failed:', trips.error);
    throw new OnboardError({ status: 500, error: 'Could not check for a running trip. Try again.' });
  }
  if (((trips.data as unknown[] | null) ?? []).length > 0) {
    throw new OnboardError({ status: 409, error: TRIP_RUNNING_MESSAGE });
  }
}

function routeLabel(r: { route_number: string | null; route_name: string | null }): string {
  return `${r.route_number ?? '?'} · ${r.route_name ?? ''}`.trim();
}

/**
 * Take an inactive driver off everything TMS assigned to them. Never throws and
 * never creates a `tms_driver` row: the employee flag is already written by the
 * time this runs, so a failed step is reported as a warning, not rolled back.
 */
export async function releaseDriverDuties(
  svc: SupabaseClient,
  driverId: string,
  actorId: string,
): Promise<ReleaseResult> {
  let failed = false;
  const fail = (what: string, error: unknown) => {
    failed = true;
    console.error(`Driver status: could not clear ${what}:`, error);
  };

  let routes: ReleaseResult['routes'] = [];
  try {
    const res = await svc
      .from('tms_route')
      .update({ driver_id: null, updated_by: actorId })
      .eq('driver_id', driverId)
      .select('id, route_number, route_name');
    if (res.error) fail('routes', res.error);
    else {
      routes = ((res.data ?? []) as { id: string; route_number: string | null; route_name: string | null }[]).map(
        (r) => ({ id: r.id, label: routeLabel(r) }),
      );
    }
  } catch (e) {
    fail('routes', e);
  }

  try {
    const res = await svc.from('tms_vehicle').update({ assigned_driver_id: null }).eq('assigned_driver_id', driverId);
    if (res.error) fail('bus', res.error);
  } catch (e) {
    fail('bus', e);
  }

  try {
    const res = await svc
      .from('tms_driver')
      .update({
        driver_status: 'inactive',
        assigned_route_id: null,
        location_sharing_enabled: false,
        updated_by: actorId,
      })
      .eq('staff_id', driverId);
    if (res.error) fail('transport record', res.error);
  } catch (e) {
    fail('transport record', e);
  }

  // Phones are handed back through Driver Mobiles; only count them for the notice.
  let mobilesHeld = 0;
  try {
    const res = await svc.from('tms_driver_mobile').select('id').eq('driver_staff_id', driverId);
    if (!res.error) mobilesHeld = ((res.data as unknown[] | null) ?? []).length;
  } catch {
    /* the count is only a reminder */
  }

  return { routes, mobilesHeld, ...(failed ? { warning: RELEASE_WARNING } : {}) };
}

/** Mark a driver inactive (and release their duties) or active again. */
export async function setDriverActive(
  svc: SupabaseClient,
  driverId: string,
  active: boolean,
  actorId: string,
): Promise<SetActiveResult> {
  const { data, error } = await svc
    .from('staff')
    .select('id, first_name, last_name, is_active, role_key, category_id')
    .eq('id', driverId)
    .eq('role_key', DRIVER_ROLE_KEY)
    .maybeSingle();
  if (error) {
    console.error('Driver status: staff lookup failed:', error);
    throw new OnboardError({ status: 500, error: 'Failed to look up the driver.' });
  }
  const row = data as {
    id: string;
    first_name: string | null;
    last_name: string | null;
    is_active: boolean | null;
    role_key: string | null;
    category_id: string | null;
  } | null;
  if (!row) throw new OnboardError({ status: 404, error: 'Driver not found' });
  if (!canFullEdit(row)) throw new OnboardError({ status: 403, error: RECORD_MANAGED_ELSEWHERE_MESSAGE });

  const id = row.id;
  const name = `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() || 'This driver';
  const changed = (row.is_active ?? false) !== active;

  if (!active) await assertNoRunningTrip(svc, id);

  if (changed) {
    // Re-assert the gate inside the write: the row may have moved category since the read.
    const { data: updated, error: updateErr } = await svc
      .from('staff')
      .update({ is_active: active, updated_by: actorId })
      .eq('id', id)
      .eq('role_key', DRIVER_ROLE_KEY)
      .eq('category_id', DRIVER_CATEGORY_ID)
      .select('id');
    if (updateErr) {
      console.error('Driver status: staff update failed:', updateErr);
      throw new OnboardError(translateStaffDbError(updateErr));
    }
    if (!updated || updated.length === 0) {
      throw new OnboardError({ status: 403, error: RECORD_MANAGED_ELSEWHERE_MESSAGE });
    }
  }

  if (!active) {
    // Also runs when the employee was already inactive, so a half-finished release can be completed.
    const released = await releaseDriverDuties(svc, id, actorId);
    return { id, name, active, changed, ...released };
  }

  // Also when the employee was already active (made active again in MyJKKN): clear a
  // stale TMS "inactive". Only that value, so someone on leave stays on leave.
  const { error: opsErr } = await svc
    .from('tms_driver')
    .update({ driver_status: 'active', updated_by: actorId })
    .eq('staff_id', id)
    .eq('driver_status', 'inactive');
  if (opsErr) console.error('Driver status: could not set transport status active (ignored):', opsErr);
  return { id, name, active, changed, routes: [], mobilesHeld: 0 };
}
