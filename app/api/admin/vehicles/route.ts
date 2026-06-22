import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { buildVehiclePayload } from '@/lib/vehicles/fields';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

async function getVehicles() {
  try {
    const supabase = createServiceRoleClient();
    const { data: vehicles, error } = await supabase
      .from('tms_vehicle')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      if (error.code === '42P01') return NextResponse.json({ success: true, data: [], count: 0 });
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
    const payload = buildVehiclePayload(body);
    if (!payload.registration_number || !payload.model || !payload.capacity) {
      return NextResponse.json({ error: 'Registration number, model, and capacity are required' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    const { data: existing } = await supabase
      .from('tms_vehicle')
      .select('id')
      .eq('registration_number', payload.registration_number as string)
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

    const payload = buildVehiclePayload(body);
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
