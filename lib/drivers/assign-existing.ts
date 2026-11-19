/**
 * Make an EXISTING staff member a driver ("Existing staff member" on Create Driver).
 * Takes the service-role client as a parameter and does no auth itself: the route
 * owns auth, permission and activity logging.
 *
 * Only for people who are not drivers yet. Someone who already has a tms_driver row
 * is refused, so this path can never overwrite their saved transport details; the
 * edit page is the one place those change.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildTransportPayload } from './map';
import { OnboardError } from './onboard';
import { DRIVER_ROLE_KEY } from './onboarding-constants';

export const ALREADY_DRIVER_MESSAGE = 'This person is already a driver. Open their record and use Edit.';

export async function assignExistingStaffAsDriver(
  svc: SupabaseClient,
  staffId: string,
  transport: Record<string, unknown>,
  actorId: string,
): Promise<Record<string, unknown> | null> {
  const { data: staff, error: staffErr } = await svc
    .from('staff')
    .select('id, role_key')
    .eq('id', staffId)
    .maybeSingle();
  if (staffErr) {
    console.error('Create driver staff lookup error:', staffErr);
    throw new OnboardError({ status: 500, error: 'Failed to look up staff' });
  }
  if (!staff) throw new OnboardError({ status: 404, error: 'Staff member not found' });

  // Checked before any write: an existing driver keeps every saved detail.
  const { data: ops, error: opsErr } = await svc
    .from('tms_driver')
    .select('staff_id')
    .eq('staff_id', staffId)
    .maybeSingle();
  if (opsErr) {
    console.error('Create driver tms_driver lookup error:', opsErr);
    throw new OnboardError({ status: 500, error: 'Failed to look up the driver' });
  }
  if (ops) throw new OnboardError({ status: 409, error: ALREADY_DRIVER_MESSAGE });

  // Promote to driver only if not already (avoids needless writes to staff).
  if ((staff as { role_key: string | null }).role_key !== DRIVER_ROLE_KEY) {
    const { error: roleErr } = await svc
      .from('staff')
      .update({ role_key: DRIVER_ROLE_KEY, updated_by: actorId })
      .eq('id', staffId);
    if (roleErr) {
      console.error('Create driver role_key update error:', roleErr);
      throw new OnboardError({ status: 500, error: 'Failed to assign driver role' });
    }
  }

  const { data, error } = await svc
    .from('tms_driver')
    .upsert(
      { ...buildTransportPayload(staffId, transport), created_by: actorId, updated_by: actorId },
      { onConflict: 'staff_id' },
    )
    .select()
    .single();
  if (error) {
    console.error('Create driver tms_driver upsert error:', error);
    throw new OnboardError({ status: 500, error: 'Failed to save driver details' });
  }
  return (data as Record<string, unknown> | null) ?? null;
}
