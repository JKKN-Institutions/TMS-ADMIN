import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/activity/log';
import { UUID_RE } from '@/lib/route-check/admin';
import { checkIdFromUrl, loadCheckForUser } from '@/lib/route-check/check-access';
import { buildCheckView } from '@/lib/route-check/view';

/** POST — snapshot the counts and mark the draft submitted (guarded: 0 rows updated → 409). */
async function submit(request: NextRequest, auth: AuthContext) {
  try {
    const id = checkIdFromUrl(request.url);
    if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Route check not found' }, { status: 404 });
    const svc = createServiceRoleClient();
    const load = await loadCheckForUser(auth, svc, id, 'mutate');
    if (!load.ok) return NextResponse.json({ error: load.error }, { status: load.status });
    const view = await buildCheckView(svc, load.check);
    const c = view.counts;
    const { data, error } = await svc.from('tms_route_check')
      .update({ status: 'submitted', submitted_at: new Date().toISOString(), registered: c.registered, booked: c.booked,
        present: c.present, unpaid: c.unpaid, without_booking: c.withoutBooking, not_on_route: c.notOnRoute })
      .eq('id', id).eq('status', 'draft').select('id');
    if (error) { console.error('route-check submit error:', error); return NextResponse.json({ error: 'Failed to submit' }, { status: 500 }); }
    if (!data?.length) return NextResponse.json({ error: 'This check is already submitted' }, { status: 409 });
    await logActivity(auth, request, {
      module: 'route-checks', action: 'submit', entityType: 'tms_route_check', entityId: id,
      entityLabel: `${view.route.routeNumber ?? view.route.id} ${view.check.checkDate} ${view.check.leg}`,
      description: `Submitted route check for route ${view.route.routeNumber ?? view.route.id}: ${c.checked} checked, ${c.unpaid} unpaid, ${c.withoutBooking} without booking`,
      metadata: { routeId: view.route.id, leg: view.check.leg, date: view.check.checkDate, counts: c },
    });
    return NextResponse.json({ success: true, data: { counts: c } });
  } catch (e) {
    console.error('route-check submit error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => submit(request, auth));
