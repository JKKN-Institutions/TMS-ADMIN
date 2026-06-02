import { NextResponse, type NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { LEARNER_SELECT, mapLearner, type LearnerRow } from '@/lib/passengers/types';
import { loadPassengerRefs } from '@/lib/passengers/refs';

/**
 * GET one bus-required learner by id. Backs the in-module detail page so it
 * survives deep-link / hard refresh. Auth is enforced by proxy.ts (every /api
 * route requires an authenticated TMS user); withAuth is not used here because
 * it does not forward Next's dynamic `params` (matches the drivers detail route).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ learnerId: string }> }
) {
  try {
    const { learnerId } = await params;
    if (!learnerId) {
      return NextResponse.json({ error: 'Learner id is required' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    const { data: row, error } = await supabase
      .from('learners_profiles')
      .select(LEARNER_SELECT)
      .eq('id', learnerId)
      .maybeSingle();

    if (error) {
      if (error.code === '42P01') return NextResponse.json({ error: 'Learner not found' }, { status: 404 });
      console.error('Learner detail query error:', error);
      return NextResponse.json({ error: 'Failed to fetch learner' }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json({ error: 'Learner not found' }, { status: 404 });
    }

    const learnerRow = row as unknown as LearnerRow;
    const refs = await loadPassengerRefs(supabase, {
      institutionIds: [learnerRow.institution_id],
      departmentIds: [learnerRow.department_id],
      routeIds: [learnerRow.transport_route_id],
      stopIds: [learnerRow.transport_stop_id],
    });

    return NextResponse.json({ success: true, data: mapLearner(learnerRow, refs) });
  } catch (e) {
    console.error('Learner detail API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
