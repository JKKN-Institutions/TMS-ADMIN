import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ACTIVE_LIFECYCLE_STATUSES } from '@/lib/passengers/types';

/**
 * GET the learner roster for one route — the drill-down behind the route
 * detail page's "Capacity" figure. Uses the SAME filter the capacity count
 * uses (bus_required + ACTIVE_LIFECYCLE_STATUSES) so the list length always
 * matches the number the user clicked.
 *
 * Auth is enforced by proxy.ts (every /api route requires an authenticated TMS
 * user), matching the sibling /api/admin/routes/[routeId] handler.
 */

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);

interface StopRow {
  id: string;
  stop_name: string | null;
  stop_time: string | null;
  evening_time: string | null;
  sequence_order: number | null;
}
interface LearnerRow {
  first_name: string | null;
  last_name: string | null;
  register_number: string | null;
  roll_number: string | null;
  student_mobile: string | null;
  lifecycle_status: string | null;
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
      console.error('Route learners: route query error', routeErr);
      return NextResponse.json({ error: 'Failed to fetch route' }, { status: 500 });
    }
    if (!route) return NextResponse.json({ error: 'Route not found' }, { status: 404 });

    const [{ data: stops }, { data: learners, error: lErr }] = await Promise.all([
      supabase
        .from('tms_route_stop')
        .select('id, stop_name, stop_time, evening_time, sequence_order')
        .eq('route_id', routeId),
      supabase
        .from('learners_profiles')
        .select('first_name, last_name, register_number, roll_number, student_mobile, lifecycle_status, transport_stop_id')
        .eq('transport_route_id', routeId)
        .eq('bus_required', true)
        .in('lifecycle_status', [...ACTIVE_LIFECYCLE_STATUSES])
        .limit(2000),
    ]);
    if (lErr) {
      console.error('Route learners: learner query error', lErr);
      return NextResponse.json({ error: 'Failed to fetch learners' }, { status: 500 });
    }

    const stopById = new Map<string, StopRow>(((stops ?? []) as StopRow[]).map((s) => [s.id, s]));

    const roster = ((learners ?? []) as LearnerRow[])
      .map((l) => {
        const s = l.transport_stop_id ? stopById.get(l.transport_stop_id) : undefined;
        return {
          name: [l.first_name, l.last_name].filter(Boolean).join(' ').trim() || '(unnamed)',
          register_number: l.register_number ?? null,
          roll_number: l.roll_number ?? null,
          mobile: l.student_mobile ?? null,
          status: l.lifecycle_status ?? null,
          stop_id: l.transport_stop_id ?? null,
          stop_name: s?.stop_name ?? null,
          sequence_order: s?.sequence_order ?? null,
          pickup: hhmm(s?.stop_time ?? null),
          evening: hhmm(s?.evening_time ?? null),
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
        learners: roster,
      },
    });
  } catch (e) {
    console.error('Route learners API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
