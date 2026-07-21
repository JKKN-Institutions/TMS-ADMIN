import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { buildDriverMobilePayload, DRIVER_MOBILE_IMAGE_BUCKET } from '@/lib/driver-mobiles/fields';
import { logActivity } from '@/lib/activity/log';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

// Resolve driver display name + phone for a set of staff ids (drivers originate
// from the MyJKKN `staff` table; tms_driver_mobile stores only driver_staff_id).
async function resolveDriverNames(
  supabase: ReturnType<typeof createServiceRoleClient>,
  staffIds: string[]
): Promise<Map<string, { name: string; phone: string | null }>> {
  const map = new Map<string, { name: string; phone: string | null }>();
  const ids = [...new Set(staffIds.filter(Boolean))];
  if (!ids.length) return map;
  const { data } = await supabase.from('staff').select('id, first_name, last_name, phone').in('id', ids);
  for (const s of (data ?? []) as { id: string; first_name: string | null; last_name: string | null; phone: string | null }[]) {
    const name = `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim();
    map.set(s.id, { name: name || '—', phone: s.phone ?? null });
  }
  return map;
}

// Resolve route number + name for a set of route ids (tms_driver_mobile stores only route_id).
async function resolveRouteInfo(
  supabase: ReturnType<typeof createServiceRoleClient>,
  routeIds: string[]
): Promise<Map<string, { number: string | null; name: string | null }>> {
  const map = new Map<string, { number: string | null; name: string | null }>();
  const ids = [...new Set(routeIds.filter(Boolean))];
  if (!ids.length) return map;
  const { data } = await supabase.from('tms_route').select('id, route_number, route_name').in('id', ids);
  for (const r of (data ?? []) as { id: string; route_number: string | null; route_name: string | null }[]) {
    map.set(r.id, { number: r.route_number ?? null, name: r.route_name ?? null });
  }
  return map;
}

async function getDriverMobiles() {
  try {
    const supabase = createServiceRoleClient();
    const { data: rows, error } = await supabase
      .from('tms_driver_mobile')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      if (error.code === '42P01') return NextResponse.json({ success: true, data: [], count: 0 });
      console.error('Driver mobiles query error:', error);
      return NextResponse.json({ error: 'Failed to fetch driver mobiles' }, { status: 500 });
    }
    const list = (rows ?? []) as { driver_staff_id: string; route_id: string | null; image_paths: string[] | null }[];
    const names = await resolveDriverNames(supabase, list.map((r) => r.driver_staff_id));
    const routes = await resolveRouteInfo(supabase, list.map((r) => r.route_id ?? '').filter(Boolean));

    // Batch-sign every phone photo across every row in ONE round trip.
    // Keyed by PATH, never by position — with N images per row an index-based
    // map would silently render one phone's photo on another phone's card.
    const imagePaths = [...new Set(list.flatMap((r) => r.image_paths ?? []).filter(Boolean))];
    const signed = new Map<string, string>();
    if (imagePaths.length) {
      const { data: urls } = await supabase.storage.from(DRIVER_MOBILE_IMAGE_BUCKET).createSignedUrls(imagePaths, 3600);
      for (const u of urls ?? []) {
        if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
      }
    }

    const data = list.map((r) => ({
      ...r,
      driver_name: names.get(r.driver_staff_id)?.name ?? '—',
      driver_phone: names.get(r.driver_staff_id)?.phone ?? null,
      route_number: r.route_id ? routes.get(r.route_id)?.number ?? null : null,
      route_name: r.route_id ? routes.get(r.route_id)?.name ?? null : null,
      // A path that fails to sign yields null in place, so the array stays
      // aligned with image_paths instead of shifting.
      image_urls: (r.image_paths ?? []).map((p) => signed.get(p) ?? null),
    }));
    return NextResponse.json({ success: true, data, count: data.length });
  } catch (e) {
    console.error('Driver mobiles API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function postDriverMobile(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.DRIVER_MOBILES_CREATE))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await request.json();
    const payload = buildDriverMobilePayload(body);
    if (!payload.driver_staff_id) {
      return NextResponse.json({ error: 'A driver must be selected' }, { status: 400 });
    }
    if (!payload.brand || !payload.model) {
      return NextResponse.json({ error: 'Brand and model are required' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('tms_driver_mobile')
      .insert([{ ...payload, created_by: auth.userId, updated_by: auth.userId }])
      .select()
      .single();
    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A mobile with this IMEI already exists' }, { status: 409 });
      }
      if (error.code === '23503') {
        return NextResponse.json({ error: 'Selected driver is not a valid onboarded driver' }, { status: 400 });
      }
      console.error('Driver mobile create error:', error);
      return NextResponse.json({ error: 'Failed to create driver mobile' }, { status: 500 });
    }
    await logActivity(auth, request, {
      module: 'driver-mobiles',
      action: 'create',
      entityType: 'tms_driver_mobile',
      entityId: data.id,
      entityLabel: `${data.brand} ${data.model}`,
      description: `Supplied ${data.brand} ${data.model} to a driver`,
      changes: { after: data },
    });
    return NextResponse.json({ success: true, data, message: 'Driver mobile created successfully' });
  } catch (e) {
    console.error('Driver mobile create error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function putDriverMobile(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.DRIVER_MOBILES_EDIT))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await request.json();
    const id: string | undefined = body?.id || body?.driverMobileId;
    if (!id) return NextResponse.json({ error: 'Driver mobile id is required' }, { status: 400 });

    const payload = buildDriverMobilePayload(body); // partial — only present keys
    if (Object.keys(payload).length === 0) {
      return NextResponse.json({ error: 'No editable fields provided' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    const { data: before } = await supabase.from('tms_driver_mobile').select('*').eq('id', id).maybeSingle();
    if (!before) return NextResponse.json({ error: 'Driver mobile not found' }, { status: 404 });

    const { data, error } = await supabase
      .from('tms_driver_mobile')
      .update({ ...payload, updated_by: auth.userId })
      .eq('id', id)
      .select()
      .single();
    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A mobile with this IMEI already exists' }, { status: 409 });
      }
      console.error('Driver mobile update error:', error);
      return NextResponse.json({ error: 'Failed to update driver mobile' }, { status: 500 });
    }
    await logActivity(auth, request, {
      module: 'driver-mobiles',
      action: 'update',
      entityType: 'tms_driver_mobile',
      entityId: data.id,
      entityLabel: `${data.brand} ${data.model}`,
      description: `Updated ${data.brand} ${data.model}`,
      changes: { before, after: data },
    });
    return NextResponse.json({ success: true, data, message: 'Driver mobile updated successfully' });
  } catch (e) {
    console.error('Driver mobile update error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function deleteDriverMobile(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.DRIVER_MOBILES_DELETE))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Driver mobile id is required' }, { status: 400 });

    const supabase = createServiceRoleClient();
    const { data: existing } = await supabase.from('tms_driver_mobile').select('*').eq('id', id).maybeSingle();
    if (!existing) return NextResponse.json({ error: 'Driver mobile not found' }, { status: 404 });

    const { error } = await supabase.from('tms_driver_mobile').delete().eq('id', id);
    if (error) {
      console.error('Driver mobile delete error:', error);
      return NextResponse.json({ error: 'Failed to delete driver mobile' }, { status: 500 });
    }
    await logActivity(auth, request, {
      module: 'driver-mobiles',
      action: 'delete',
      entityType: 'tms_driver_mobile',
      entityId: id,
      entityLabel: `${existing.brand} ${existing.model}`,
      description: `Deleted ${existing.brand} ${existing.model}`,
      changes: { before: existing },
    });
    return NextResponse.json({ success: true, message: 'Driver mobile deleted successfully' });
  } catch (e) {
    console.error('Driver mobile delete error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth(() => getDriverMobiles());
export const POST = withAuth((request, auth) => postDriverMobile(request, auth));
export const PUT = withAuth((request, auth) => putDriverMobile(request, auth));
export const DELETE = withAuth((request, auth) => deleteDriverMobile(request, auth));
