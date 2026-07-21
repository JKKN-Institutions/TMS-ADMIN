import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

// withAuth drops Next's route context, so pull the [id] from the path:
// /api/admin/fees/<id>/stop-rates
function feeIdFromPath(request: NextRequest): string | null {
  const parts = request.nextUrl.pathname.split('/').filter(Boolean);
  const i = parts.indexOf('fees');
  return i >= 0 && parts[i + 1] ? parts[i + 1] : null;
}

interface StopRow {
  id: string;
  stop_name: string;
  sequence_order: number;
  route_id: string;
  tms_route: { route_number: string; route_name: string } | null;
}

/**
 * Every stop on every route, left-joined to this structure's configured rate.
 * Returns the full stop list (not just configured ones) so the admin UI can
 * show which stops still need a rate.
 */
async function list(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const id = feeIdFromPath(request);
    if (!id) return NextResponse.json({ error: 'Fee structure id is required' }, { status: 400 });

    const supabase = createServiceRoleClient();

    // Validate that this is a stop-wise structure
    const { data: fs } = await supabase
      .from('tms_fee_structure')
      .select('id, fee_mode')
      .eq('id', id)
      .maybeSingle();
    if (!fs) return NextResponse.json({ error: 'Fee structure not found' }, { status: 404 });
    if (fs.fee_mode !== 'stop_wise') {
      return NextResponse.json(
        { error: 'Stop rates apply only to stop-wise fee structures.' },
        { status: 400 }
      );
    }

    const { data: stops, error: stopErr } = await supabase
      .from('tms_route_stop')
      .select('id, stop_name, sequence_order, route_id, tms_route(route_number, route_name)')
      .order('sequence_order', { ascending: true });
    if (stopErr) {
      return NextResponse.json({ error: 'Failed to load route stops' }, { status: 500 });
    }

    const { data: rates, error: rateErr } = await supabase
      .from('tms_fee_structure_stop_rate')
      .select('stop_id, annual_amount')
      .eq('fee_structure_id', id);
    if (rateErr) {
      return NextResponse.json({ error: 'Failed to load stop rates' }, { status: 500 });
    }
    const rateBy = new Map<string, number>(
      ((rates ?? []) as Array<{ stop_id: string; annual_amount: number }>).map((r) => [
        r.stop_id,
        Number(r.annual_amount),
      ])
    );

    const rows = ((stops ?? []) as unknown as StopRow[]).map((s) => ({
      stop_id: s.id,
      stop_name: s.stop_name,
      sequence_order: s.sequence_order,
      route_id: s.route_id,
      route_number: s.tms_route?.route_number ?? null,
      route_name: s.tms_route?.route_name ?? null,
      annual_amount: rateBy.has(s.id) ? (rateBy.get(s.id) as number) : null,
    }));
    rows.sort(
      (a, b) =>
        String(a.route_number ?? '').localeCompare(String(b.route_number ?? '')) ||
        a.sequence_order - b.sequence_order
    );

    return NextResponse.json({ success: true, data: { rates: rows } });
  } catch (e) {
    console.error('Stop rates list error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** Upsert a batch of stop rates. A null/absent amount DELETES that stop's rate. */
async function upsert(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_EDIT))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const id = feeIdFromPath(request);
    if (!id) return NextResponse.json({ error: 'Fee structure id is required' }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const input = Array.isArray(body?.rates) ? body.rates : null;
    if (!input) return NextResponse.json({ error: 'rates[] is required' }, { status: 400 });

    const supabase = createServiceRoleClient();

    const { data: fs } = await supabase
      .from('tms_fee_structure')
      .select('id, fee_mode')
      .eq('id', id)
      .maybeSingle();
    if (!fs) return NextResponse.json({ error: 'Fee structure not found' }, { status: 404 });
    if (fs.fee_mode !== 'stop_wise') {
      return NextResponse.json(
        { error: 'Stop rates apply only to stop-wise fee structures.' },
        { status: 400 }
      );
    }

    const toUpsert: Array<{
      fee_structure_id: string;
      stop_id: string;
      annual_amount: number;
      updated_at: string;
    }> = [];
    const toDelete: string[] = [];
    for (const r of input as Array<{ stop_id?: string; annual_amount?: unknown }>) {
      if (!r?.stop_id) continue;
      if (r.annual_amount === null || r.annual_amount === undefined || r.annual_amount === '') {
        toDelete.push(r.stop_id);
        continue;
      }
      const amount = Number(r.annual_amount);
      if (!Number.isFinite(amount) || amount < 0) {
        return NextResponse.json(
          { error: `Invalid amount for stop ${r.stop_id}` },
          { status: 400 }
        );
      }
      toUpsert.push({
        fee_structure_id: id,
        stop_id: r.stop_id,
        annual_amount: amount,
        updated_at: new Date().toISOString(),
      });
    }

    // Upsert first, delete second. Without a transaction, delete-then-upsert can
    // permanently lose an operator's entire price list if the upsert fails (no recovery).
    // Upsert-then-delete can only leave stale rows, which a retry clears.
    if (toUpsert.length) {
      const { error } = await supabase
        .from('tms_fee_structure_stop_rate')
        .upsert(toUpsert, { onConflict: 'fee_structure_id,stop_id' });
      if (error) return NextResponse.json({ error: 'Failed to save stop rates' }, { status: 500 });
    }
    if (toDelete.length) {
      const { error } = await supabase
        .from('tms_fee_structure_stop_rate')
        .delete()
        .eq('fee_structure_id', id)
        .in('stop_id', toDelete);
      if (error) return NextResponse.json({ error: 'Failed to clear stop rates' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: { saved: toUpsert.length, cleared: toDelete.length },
      message: `Saved ${toUpsert.length} stop rate(s).`,
    });
  } catch (e) {
    console.error('Stop rates upsert error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => list(request, auth));
export const PUT = withAuth((request, auth) => upsert(request, auth));
