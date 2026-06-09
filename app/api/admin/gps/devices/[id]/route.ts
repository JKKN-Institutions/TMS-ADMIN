import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Per-device GPS endpoints backing the in-module View / Edit / Delete flow.
 *
 * GET    → one device (lets the View & Edit pages survive deep-link / refresh)
 * PUT    → update the user-editable fields only (device_id + telemetry excluded)
 * DELETE → remove the device (replaces the old fake local-state delete)
 *
 * Matches the existing GPS route style (service-role client, no withAuth). The
 * proxy authenticates every /api request; granular permission is enforced in the
 * UI (canManage / canDelete). Hardening these to withAuth + a permission check is
 * a noted follow-up, consistent with the wider service-role-route auth gap.
 */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Columns a client may change. device_id is the immutable hardware id; battery_level,
// signal_strength and last_heartbeat are device-reported telemetry — all excluded.
const EDITABLE = ['device_name', 'device_model', 'sim_number', 'imei', 'status', 'notes'] as const;
const VALID_STATUS = ['active', 'inactive', 'offline', 'maintenance', 'error'];

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'Device id is required' }, { status: 400 });

    const { data, error } = await supabase.from('gps_devices').select('*').eq('id', id).maybeSingle();
    if (error) {
      console.error('GPS device detail query error:', error);
      return NextResponse.json({ error: 'Failed to fetch GPS device' }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: 'GPS device not found' }, { status: 404 });
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error('GPS device detail API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'Device id is required' }, { status: 400 });

    const body = await request.json();

    if (body.device_name !== undefined && !String(body.device_name).trim()) {
      return NextResponse.json({ error: 'Device name is required' }, { status: 400 });
    }
    if (body.status !== undefined && !VALID_STATUS.includes(body.status)) {
      return NextResponse.json({ error: 'Invalid status value' }, { status: 400 });
    }

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const key of EDITABLE) {
      if (body[key] === undefined) continue;
      const value = typeof body[key] === 'string' ? body[key].trim() : body[key];
      update[key] = value === '' ? null : value;
    }

    const { data, error } = await supabase
      .from('gps_devices')
      .update(update)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      console.error('GPS device update error:', error);
      return NextResponse.json({ error: 'Failed to update GPS device' }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: 'GPS device not found' }, { status: 404 });
    return NextResponse.json({ success: true, data, message: 'GPS device updated successfully' });
  } catch (e) {
    console.error('GPS device update API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'Device id is required' }, { status: 400 });

    const { error } = await supabase.from('gps_devices').delete().eq('id', id);
    if (error) {
      console.error('GPS device delete error:', error);
      return NextResponse.json({ error: 'Failed to delete GPS device' }, { status: 500 });
    }
    return NextResponse.json({ success: true, message: 'GPS device deleted successfully' });
  } catch (e) {
    console.error('GPS device delete API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
