import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { logActivity } from '@/lib/activity/log';
import { parseFineRatesBody } from '@/lib/fines/fields';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

interface StopRow {
  id: string;
  stop_name: string;
  sequence_order: number;
  route_id: string;
  tms_route: { route_number: string; route_name: string } | null;
}

/** Every stop on every route, left-joined to this year's configured fine. */
async function list(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const year = new URL(request.url).searchParams.get('year');
    if (!year) return NextResponse.json({ error: 'A transport year is required' }, { status: 400 });

    const supabase = createServiceRoleClient();

    const { data: stops, error: stopErr } = await supabase
      .from('tms_route_stop')
      .select('id, stop_name, sequence_order, route_id, tms_route(route_number, route_name)')
      .order('sequence_order', { ascending: true });
    if (stopErr) return NextResponse.json({ error: 'Failed to load route stops' }, { status: 500 });

    const { data: rates, error: rateErr } = await supabase
      .from('tms_fine_stop_rate')
      .select('stop_id, fine_amount')
      .eq('transport_year_id', year);
    // Fail loudly: a swallowed error here renders every stop as "not set" and
    // invites an operator to overwrite a good fine sheet with blanks.
    if (rateErr) return NextResponse.json({ error: 'Failed to load fine rates' }, { status: 500 });

    const fineBy = new Map<string, number>(
      ((rates ?? []) as Array<{ stop_id: string; fine_amount: number }>).map((r) => [
        r.stop_id,
        Number(r.fine_amount),
      ])
    );

    const rows = ((stops ?? []) as unknown as StopRow[]).map((s) => ({
      stop_id: s.id,
      stop_name: s.stop_name,
      sequence_order: s.sequence_order,
      route_id: s.route_id,
      route_number: s.tms_route?.route_number ?? null,
      route_name: s.tms_route?.route_name ?? null,
      fine_amount: fineBy.has(s.id) ? (fineBy.get(s.id) as number) : null,
    }));
    rows.sort(
      (a, b) =>
        String(a.route_number ?? '').localeCompare(String(b.route_number ?? '')) ||
        a.sequence_order - b.sequence_order
    );

    return NextResponse.json({ success: true, data: { rates: rows } });
  } catch (e) {
    console.error('Fine rates list error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** Bulk upsert. A null/blank amount DELETES that stop's fine for the year. */
async function upsert(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_EDIT))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const parsed = parseFineRatesBody(await request.json().catch(() => ({})));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const supabase = createServiceRoleClient();
    const now = new Date().toISOString();

    const toUpsert = parsed.rates
      .filter((r) => r.fine_amount !== null)
      .map((r) => ({
        transport_year_id: parsed.year,
        stop_id: r.stop_id,
        fine_amount: r.fine_amount as number,
        updated_at: now,
        updated_by: auth.userId,
      }));
    const toDelete = parsed.rates.filter((r) => r.fine_amount === null).map((r) => r.stop_id);

    // Upsert first, delete second. Without a transaction, delete-then-upsert can
    // permanently lose the whole fine sheet if the upsert then fails; this order
    // can only leave stale rows, which a retry clears.
    if (toUpsert.length) {
      const { error } = await supabase
        .from('tms_fine_stop_rate')
        .upsert(toUpsert, { onConflict: 'transport_year_id,stop_id' });
      if (error) {
        console.error('Fine rate upsert failed:', error.message);
        return NextResponse.json({ error: 'Failed to save fine rates' }, { status: 500 });
      }
    }
    if (toDelete.length) {
      // Chunked: ~500 stop ids in one .in() returns HTTP 400 from the gateway.
      for (let i = 0; i < toDelete.length; i += 150) {
        const { error } = await supabase
          .from('tms_fine_stop_rate')
          .delete()
          .eq('transport_year_id', parsed.year)
          .in('stop_id', toDelete.slice(i, i + 150));
        if (error) {
          console.error('Fine rate clear failed:', error.message);
          return NextResponse.json({ error: 'Failed to clear fine rates' }, { status: 500 });
        }
      }
    }

    await logActivity(auth, request, {
      module: 'fees',
      action: 'update',
      entityType: 'tms_fine_stop_rate',
      entityId: parsed.year,
      description: `Updated fine rates: ${toUpsert.length} saved, ${toDelete.length} cleared`,
      metadata: { saved: toUpsert.length, cleared: toDelete.length },
    });

    return NextResponse.json({
      success: true,
      data: { saved: toUpsert.length, cleared: toDelete.length },
      message: `Saved ${toUpsert.length} fine rate(s).`,
    });
  } catch (e) {
    console.error('Fine rates upsert error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => list(request, auth));
export const PUT = withAuth((request, auth) => upsert(request, auth));
