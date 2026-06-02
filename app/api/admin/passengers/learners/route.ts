import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { LEARNER_SELECT, mapLearner, type LearnerRow } from '@/lib/passengers/types';
import { loadPassengerRefs } from '@/lib/passengers/refs';

/**
 * GET bus-required learners for the Passenger module's Learners page.
 *
 * Reads the MyJKKN-owned `learners_profiles` master (TMS only reads it) filtered
 * to `bus_required = true`. `.eq('bus_required', true)` is null-safe — the column
 * is a nullable boolean and NULL rows are excluded, matching "IS TRUE". Route/stop
 * and institution/department names are resolved via a batch ref lookup.
 *
 * Permission: tms.enrollment.view (the existing Passengers permission). The proxy
 * already gates the route on authentication; this adds the granular check that
 * the legacy service-role routes were missing.
 */
async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

async function getLearners(_request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, 'tms.enrollment.view'))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('learners_profiles')
      .select(LEARNER_SELECT)
      .eq('bus_required', true)
      .order('first_name', { ascending: true });

    if (error) {
      // Table missing (42P01) degrades to an empty list so the UI still works.
      if (error.code === '42P01') return NextResponse.json({ success: true, data: [], count: 0 });
      console.error('Learners query error:', error);
      return NextResponse.json({ error: 'Failed to fetch learners' }, { status: 500 });
    }

    const rows = (data ?? []) as unknown as LearnerRow[];
    const refs = await loadPassengerRefs(supabase, {
      institutionIds: rows.map((r) => r.institution_id),
      departmentIds: rows.map((r) => r.department_id),
      routeIds: rows.map((r) => r.transport_route_id),
      stopIds: rows.map((r) => r.transport_stop_id),
    });

    const result = rows.map((r) => mapLearner(r, refs));
    return NextResponse.json({ success: true, data: result, count: result.length });
  } catch (e) {
    console.error('Learners API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getLearners(request, auth));
