import { NextResponse } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';

interface StopJoin {
  stop_name: string;
  tms_route: { route_number: string; route_name: string } | null;
}

/**
 * The signed-in learner's boarding stop and route, for display on /student/fees.
 * Self-scoped: the learner comes from the SESSION, never from client input.
 */
async function context(_request: Request, auth: AuthContext) {
  try {
    const supabase = createServiceRoleClient();

    const { data: learner } = await supabase
      .from('learners_profiles')
      .select('id, transport_stop_id')
      .eq('profile_id', auth.userId)
      .maybeSingle();

    const stopId = (learner as { transport_stop_id: string | null } | null)?.transport_stop_id;
    if (!stopId) {
      return NextResponse.json({ success: true, data: { route_label: null, stop_name: null } });
    }

    const { data: stop } = await supabase
      .from('tms_route_stop')
      .select('stop_name, tms_route(route_number, route_name)')
      .eq('id', stopId)
      .maybeSingle();

    const r = stop as unknown as StopJoin | null;
    return NextResponse.json({
      success: true,
      data: {
        stop_name: r?.stop_name ?? null,
        route_label: r?.tms_route ? `${r.tms_route.route_number} — ${r.tms_route.route_name}` : null,
      },
    });
  } catch (e) {
    console.error('Transport context error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => context(request, auth));
