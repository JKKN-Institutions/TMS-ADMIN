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

    const learnerRow = learner as { id: string; transport_stop_id: string | null } | null;

    // Whether this learner is actually billed by a stop_wise structure. Flat
    // and tiered fees have nothing to do with the boarding stop, so the
    // "your fee is based on your stop" card on /student/fees must be gated on
    // this — not on merely having a transport_stop_id, which every learner on
    // every mode has (review finding I5: ~1,950 flat/tiered students were
    // being told a false explanation of how they're charged).
    let stopWise = false;
    if (learnerRow?.id) {
      const { data: bills } = await supabase
        .from('tms_fee_bill')
        .select('tms_fee_structure(fee_mode)')
        .eq('person_id', learnerRow.id)
        .eq('person_type', 'learner');
      stopWise = ((bills ?? []) as unknown as Array<{ tms_fee_structure: { fee_mode: string } | null }>).some(
        (b) => b.tms_fee_structure?.fee_mode === 'stop_wise'
      );
    }

    const stopId = learnerRow?.transport_stop_id;
    if (!stopId) {
      return NextResponse.json({ success: true, data: { route_label: null, stop_name: null, stop_wise: stopWise } });
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
        stop_wise: stopWise,
      },
    });
  } catch (e) {
    console.error('Transport context error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => context(request, auth));
