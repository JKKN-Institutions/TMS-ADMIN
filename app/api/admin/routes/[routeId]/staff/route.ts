import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * GET the STAFF roster for one route — the staff twin of the learners roster
 * (../learners). Uses the SAME filter the route's staff count uses
 * (bus_required + is_active = true) so the list length always matches the
 * number the user clicked. Staff carry the same transport wiring as learners:
 * transport_route_id / transport_stop_id denormalised onto the staff row.
 *
 * Auth is enforced by proxy.ts (every /api route requires an authenticated TMS
 * user), matching the sibling /api/admin/routes/[routeId]/learners handler.
 */

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);

interface StopRow {
  id: string;
  stop_name: string | null;
  stop_time: string | null;
  evening_time: string | null;
  sequence_order: number | null;
}
interface StaffMemberRow {
  first_name: string | null;
  last_name: string | null;
  staff_id: string | null;
  designation: string | null;
  phone: string | null;
  email: string | null;
  status: string | null;
  transport_stop_id: string | null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ routeId: string }> }) {
  try {
    const { routeId } = await params;
    if (!routeId) return NextResponse.json({ error: 'Route id is required' }, { status: 400 });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: route, error: routeErr } = await supabase
      .from('tms_route')
      .select('id, route_number, route_name')
      .eq('id', routeId)
      .maybeSingle();
    if (routeErr) {
      console.error('Route staff: route query error', routeErr);
      return NextResponse.json({ error: 'Failed to fetch route' }, { status: 500 });
    }
    if (!route) return NextResponse.json({ error: 'Route not found' }, { status: 404 });

    const [{ data: stops }, { data: staff, error: sErr }] = await Promise.all([
      supabase
        .from('tms_route_stop')
        .select('id, stop_name, stop_time, evening_time, sequence_order')
        .eq('route_id', routeId),
      supabase
        .from('staff')
        .select('first_name, last_name, staff_id, designation, phone, email, status, transport_stop_id')
        .eq('transport_route_id', routeId)
        .eq('bus_required', true)
        .eq('is_active', true)
        .limit(2000),
    ]);
    if (sErr) {
      // The staff directory may not exist in every environment — treat a missing
      // table as an empty roster rather than an error.
      if (sErr.code === '42P01') {
        return NextResponse.json({
          success: true,
          data: {
            route: { id: route.id, route_number: route.route_number, route_name: route.route_name },
            total: 0,
            staff: [],
          },
        });
      }
      console.error('Route staff: staff query error', sErr);
      return NextResponse.json({ error: 'Failed to fetch staff' }, { status: 500 });
    }

    const stopById = new Map<string, StopRow>(((stops ?? []) as StopRow[]).map((s) => [s.id, s]));

    const roster = ((staff ?? []) as StaffMemberRow[])
      .map((s) => {
        const stop = s.transport_stop_id ? stopById.get(s.transport_stop_id) : undefined;
        return {
          name: [s.first_name, s.last_name].filter(Boolean).join(' ').trim() || '(unnamed)',
          staff_id: s.staff_id ?? null,
          designation: s.designation ?? null,
          mobile: s.phone ?? null,
          email: s.email ?? null,
          status: s.status ?? null,
          stop_id: s.transport_stop_id ?? null,
          stop_name: stop?.stop_name ?? null,
          sequence_order: stop?.sequence_order ?? null,
          pickup: hhmm(stop?.stop_time ?? null),
          evening: hhmm(stop?.evening_time ?? null),
        };
      })
      .sort((a, b) => {
        // Boarding order (stop sequence), unassigned stops last, then by name.
        const sa = a.sequence_order ?? Number.MAX_SAFE_INTEGER;
        const sb = b.sequence_order ?? Number.MAX_SAFE_INTEGER;
        return sa - sb || a.name.localeCompare(b.name);
      });

    return NextResponse.json({
      success: true,
      data: {
        route: { id: route.id, route_number: route.route_number, route_name: route.route_name },
        total: roster.length,
        staff: roster,
      },
    });
  } catch (e) {
    console.error('Route staff API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
