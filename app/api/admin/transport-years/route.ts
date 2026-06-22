import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { buildTransportYearPayload } from '@/lib/transport-years/fields';
import { logActivity } from '@/lib/activity/log';

// Super admins pass everything; everyone else is checked against the RPC.
async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

// end_date must be strictly after start_date (mirrors the DB check constraint
// tms_transport_year_date_order — validated here so callers get a 400, not a 500).
function badDateOrder(payload: Record<string, unknown>): boolean {
  const start = payload.start_date as string | null | undefined;
  const end = payload.end_date as string | null | undefined;
  return !!start && !!end && end <= start;
}

async function getTransportYears() {
  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('tms_transport_year')
      .select('*')
      .order('start_date', { ascending: false });
    if (error) {
      // 42P01 = table doesn't exist yet → return empty so the UI renders.
      if (error.code === '42P01') return NextResponse.json({ success: true, data: [], count: 0 });
      console.error('Transport years query error:', error);
      return NextResponse.json({ error: 'Failed to fetch transport years' }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: data ?? [], count: data?.length ?? 0 });
  } catch (e) {
    console.error('Transport years API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function postTransportYear(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.TRANSPORT_YEARS_CREATE))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await request.json();
    const payload = buildTransportYearPayload(body);
    if (!payload.name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }
    if (!payload.start_date || !payload.end_date) {
      return NextResponse.json({ error: 'Start date and end date are required' }, { status: 400 });
    }
    if (badDateOrder(payload)) {
      return NextResponse.json({ error: 'End date must be after start date' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    const { data: existing } = await supabase
      .from('tms_transport_year')
      .select('id')
      .eq('name', payload.name as string)
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        { error: 'A transport year with this name already exists' },
        { status: 409 }
      );
    }

    const { data, error } = await supabase
      .from('tms_transport_year')
      .insert([{ ...payload, created_by: auth.userId, updated_by: auth.userId }])
      .select()
      .single();
    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'A transport year with this name already exists' },
          { status: 409 }
        );
      }
      console.error('Transport year create error:', error);
      return NextResponse.json({ error: 'Failed to create transport year' }, { status: 500 });
    }

    await logActivity(auth, request, {
      module: 'transport-years',
      action: 'create',
      entityType: 'tms_transport_year',
      entityId: data.id,
      entityLabel: data.name,
      description: `Created transport year ${data.name}`,
      changes: { after: data },
    });
    return NextResponse.json({ success: true, data, message: 'Transport year created successfully' });
  } catch (e) {
    console.error('Transport year create error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function putTransportYear(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.TRANSPORT_YEARS_EDIT))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await request.json();
    const id: string | undefined = body?.id || body?.transportYearId;
    if (!id) return NextResponse.json({ error: 'Transport year id is required' }, { status: 400 });

    const payload = buildTransportYearPayload(body); // partial — only present keys
    if (Object.keys(payload).length === 0) {
      return NextResponse.json({ error: 'No editable fields provided' }, { status: 400 });
    }
    if (badDateOrder(payload)) {
      return NextResponse.json({ error: 'End date must be after start date' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    const { data: before } = await supabase
      .from('tms_transport_year')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (!before) {
      return NextResponse.json({ error: 'Transport year not found' }, { status: 404 });
    }

    const { data, error } = await supabase
      .from('tms_transport_year')
      .update({ ...payload, updated_by: auth.userId })
      .eq('id', id)
      .select()
      .single();
    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'A transport year with this name already exists' },
          { status: 409 }
        );
      }
      // 23514 = check constraint (date order) — only one date was sent and it
      // crossed the other one already stored on the row.
      if (error.code === '23514') {
        return NextResponse.json({ error: 'End date must be after start date' }, { status: 400 });
      }
      console.error('Transport year update error:', error);
      return NextResponse.json({ error: 'Failed to update transport year' }, { status: 500 });
    }

    await logActivity(auth, request, {
      module: 'transport-years',
      action: 'update',
      entityType: 'tms_transport_year',
      entityId: data.id,
      entityLabel: data.name,
      description: `Updated transport year ${data.name}`,
      changes: { before, after: data },
    });
    return NextResponse.json({ success: true, data, message: 'Transport year updated successfully' });
  } catch (e) {
    console.error('Transport year update error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function deleteTransportYear(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.TRANSPORT_YEARS_DELETE))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const id = new URL(request.url).searchParams.get('id'); // DELETE id comes from the query string
    if (!id) return NextResponse.json({ error: 'Transport year id is required' }, { status: 400 });

    const supabase = createServiceRoleClient();
    const { data: existing } = await supabase
      .from('tms_transport_year')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (!existing) {
      return NextResponse.json({ error: 'Transport year not found' }, { status: 404 });
    }

    const { error } = await supabase.from('tms_transport_year').delete().eq('id', id);
    if (error) {
      console.error('Transport year delete error:', error);
      return NextResponse.json({ error: 'Failed to delete transport year' }, { status: 500 });
    }

    await logActivity(auth, request, {
      module: 'transport-years',
      action: 'delete',
      entityType: 'tms_transport_year',
      entityId: id,
      entityLabel: existing.name,
      description: `Deleted transport year ${existing.name}`,
      changes: { before: existing },
    });
    return NextResponse.json({ success: true, message: 'Transport year deleted successfully' });
  } catch (e) {
    console.error('Transport year delete error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth(() => getTransportYears());
export const POST = withAuth((request, auth) => postTransportYear(request, auth));
export const PUT = withAuth((request, auth) => putTransportYear(request, auth));
export const DELETE = withAuth((request, auth) => deleteTransportYear(request, auth));
