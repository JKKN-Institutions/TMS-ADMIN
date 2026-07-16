import { NextResponse, type NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * GET one driver mobile (full row + resolved driver name/phone) by id. Backs the
 * in-module view/edit pages so they survive deep-link / hard refresh. Auth is
 * enforced by proxy.ts; writes go through the permission-gated POST/PUT/DELETE.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> } // Next 15/16: params is a Promise
) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'Driver mobile id is required' }, { status: 400 });

    const supabase = createServiceRoleClient();
    const { data: row, error } = await supabase
      .from('tms_driver_mobile')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) {
      if (error.code === '42P01') return NextResponse.json({ error: 'Driver mobile not found' }, { status: 404 });
      console.error('Driver mobile detail query error:', error);
      return NextResponse.json({ error: 'Failed to fetch driver mobile' }, { status: 500 });
    }
    if (!row) return NextResponse.json({ error: 'Driver mobile not found' }, { status: 404 });

    let driver_name = '—';
    let driver_phone: string | null = null;
    if ((row as { driver_staff_id?: string }).driver_staff_id) {
      const { data: s } = await supabase
        .from('staff')
        .select('first_name, last_name, phone')
        .eq('id', (row as { driver_staff_id: string }).driver_staff_id)
        .maybeSingle();
      if (s) {
        driver_name = `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() || '—';
        driver_phone = s.phone ?? null;
      }
    }

    let route_number: string | null = null;
    let route_name: string | null = null;
    if ((row as { route_id?: string | null }).route_id) {
      const { data: rt } = await supabase
        .from('tms_route')
        .select('route_number, route_name')
        .eq('id', (row as { route_id: string }).route_id)
        .maybeSingle();
      if (rt) {
        route_number = rt.route_number ?? null;
        route_name = rt.route_name ?? null;
      }
    }

    return NextResponse.json({ success: true, data: { ...row, driver_name, driver_phone, route_number, route_name } });
  } catch (e) {
    console.error('Driver mobile detail API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
