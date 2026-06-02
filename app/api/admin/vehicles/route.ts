import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';

// Service-role client bypasses RLS, so writes are gated by explicit tms.vehicles.*
// permission checks here (defense-in-depth; super admins bypass).
async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

// Add modal sends camelCase; map to the tms_vehicle column names.
function mapCreatePayload(b: Record<string, unknown>) {
  return {
    registration_number: String(b.registrationNumber ?? '').trim(),
    model: String(b.model ?? '').trim(),
    capacity: parseInt(String(b.capacity)) || 0,
    fuel_type: (b.fuelType as string) || 'diesel',
    status: (b.status as string) || 'active',
    insurance_expiry: (b.insuranceExpiry as string) || null,
    fitness_expiry: (b.fitnessExpiry as string) || null,
    next_maintenance: (b.nextMaintenance as string) || null,
    last_maintenance: (b.lastMaintenance as string) || null,
    mileage: b.mileage ? parseFloat(String(b.mileage)) : 0,
    purchase_date: (b.purchaseDate as string) || null,
    chassis_number: (b.chassisNumber as string) || null,
    engine_number: (b.engineNumber as string) || null,
    gps_device_id: (b.gpsDeviceId as string) || null,
    live_tracking_enabled: !!b.liveTrackingEnabled,
  };
}

// Edit modal sends snake_case; whitelist the editable columns.
const EDITABLE = [
  'registration_number', 'model', 'capacity', 'fuel_type', 'status', 'mileage',
  'last_maintenance', 'next_maintenance', 'insurance_expiry', 'fitness_expiry',
  'purchase_date', 'chassis_number', 'engine_number', 'gps_device_id', 'live_tracking_enabled',
] as const;
const DATE_FIELDS = ['last_maintenance', 'next_maintenance', 'insurance_expiry', 'fitness_expiry', 'purchase_date'];

function mapEditPayload(b: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of EDITABLE) {
    if (k in b) out[k] = b[k];
  }
  if ('capacity' in out) out.capacity = parseInt(String(out.capacity)) || 0;
  if ('mileage' in out) out.mileage = out.mileage ? parseFloat(String(out.mileage)) : 0;
  for (const d of DATE_FIELDS) if (out[d] === '') out[d] = null;
  return out;
}

async function getVehicles() {
  try {
    const supabase = createServiceRoleClient();
    const { data: vehicles, error } = await supabase
      .from('tms_vehicle')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      // Table absent (42P01) → degrade to empty list until the migration is applied.
      if (error.code === '42P01') {
        return NextResponse.json({ success: true, data: [], count: 0 });
      }
      console.error('Vehicles query error:', error);
      return NextResponse.json({ error: 'Failed to fetch vehicles' }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: vehicles ?? [], count: vehicles?.length ?? 0 });
  } catch (e) {
    console.error('Vehicles API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function postVehicle(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, 'tms.vehicles.create'))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await request.json();
    const payload = mapCreatePayload(body);
    if (!payload.registration_number || !payload.model || !payload.capacity) {
      return NextResponse.json({ error: 'Registration number, model, and capacity are required' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    const { data: existing } = await supabase
      .from('tms_vehicle')
      .select('id')
      .eq('registration_number', payload.registration_number)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ error: 'A vehicle with this registration number already exists' }, { status: 409 });
    }

    const { data, error } = await supabase
      .from('tms_vehicle')
      .insert([{ ...payload, created_by: auth.userId, updated_by: auth.userId }])
      .select()
      .single();
    if (error) {
      console.error('Vehicle create error:', error);
      return NextResponse.json({ error: 'Failed to create vehicle' }, { status: 500 });
    }
    return NextResponse.json({ success: true, data, message: 'Vehicle created successfully' });
  } catch (e) {
    console.error('Vehicle create error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function putVehicle(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, 'tms.vehicles.edit'))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await request.json();
    const id: string | undefined = body?.id || body?.vehicleId;
    if (!id) return NextResponse.json({ error: 'Vehicle id is required' }, { status: 400 });

    const payload = mapEditPayload(body);
    if (Object.keys(payload).length === 0) {
      return NextResponse.json({ error: 'No editable fields provided' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('tms_vehicle')
      .update({ ...payload, updated_by: auth.userId })
      .eq('id', id)
      .select()
      .single();
    if (error) {
      console.error('Vehicle update error:', error);
      return NextResponse.json({ error: 'Failed to update vehicle' }, { status: 500 });
    }
    return NextResponse.json({ success: true, data, message: 'Vehicle updated successfully' });
  } catch (e) {
    console.error('Vehicle update error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function deleteVehicle(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, 'tms.vehicles.delete'))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Vehicle id is required' }, { status: 400 });

    const supabase = createServiceRoleClient();
    const { error } = await supabase.from('tms_vehicle').delete().eq('id', id);
    if (error) {
      console.error('Vehicle delete error:', error);
      return NextResponse.json({ error: 'Failed to delete vehicle' }, { status: 500 });
    }
    return NextResponse.json({ success: true, message: 'Vehicle deleted successfully' });
  } catch (e) {
    console.error('Vehicle delete error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth(() => getVehicles());
export const POST = withAuth((request, auth) => postVehicle(request, auth));
export const PUT = withAuth((request, auth) => putVehicle(request, auth));
export const DELETE = withAuth((request, auth) => deleteVehicle(request, auth));
