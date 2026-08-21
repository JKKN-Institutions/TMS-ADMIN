/**
 * Nightly repair of in-charge share allocation.
 *
 * The explicit recompute hooks cover the paths an admin actually uses, but
 * learner route changes also happen through route optimization
 * (lib/route-optimization/apply.ts) and through direct database edits. This
 * job is the safety net: it recomputes every route whose allocation no longer
 * matches its roster.
 *
 * It is NOT a rebalance. A route whose allocation is already correct is left
 * untouched, because splitRouteShare is deterministic — recomputing an
 * unchanged route produces the identical result, and reshuffling shares for
 * no reason is the thing this design exists to avoid.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { recomputeRouteAllocation } from '@/lib/boarding/allocation-repo';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Recompute every route regardless of drift. Use for the initial backfill.
  const force = request.nextUrl.searchParams.get('force') === '1';

  const svc = createServiceRoleClient();
  const summary = {
    routes: 0,
    recomputed: 0,
    skipped: 0,
    errors: 0,
    unownedLearners: 0,
    failures: [] as Array<{ routeId: string; message: string }>,
    details: [] as Array<{ routeId: string; inCharges: number; allocated: number; unowned: number }>,
  };

  const { data: routes, error } = await svc.from('tms_route').select('id');
  if (error) return NextResponse.json({ error: 'Failed to load routes' }, { status: 500 });

  for (const r of (routes ?? []) as { id: string }[]) {
    summary.routes += 1;
    try {
      if (!force) {
        // Drift check: allocation row count vs allocated-learner count. Cheap,
        // and catches the cases that matter (a learner added, moved or removed).
        const [{ count: allocCount }, { count: learnerCount }] = await Promise.all([
          svc.from('tms_incharge_roster_allocation').select('id', { count: 'exact', head: true }).eq('route_id', r.id),
          svc.from('learners_profiles').select('id', { count: 'exact', head: true }).eq('transport_route_id', r.id),
        ]);
        const { count: icCount } = await svc
          .from('tms_staff_route_assignment')
          .select('id', { count: 'exact', head: true })
          .eq('route_id', r.id)
          .eq('is_active', true);
        // A route with no in-charge legitimately holds zero allocations.
        const expected = (icCount ?? 0) === 0 ? 0 : learnerCount ?? 0;
        if ((allocCount ?? 0) === expected) {
          summary.skipped += 1;
          continue;
        }
      }
      const result = await recomputeRouteAllocation(svc, r.id, null);
      summary.recomputed += 1;
      summary.unownedLearners += result.unowned;
      summary.details.push(result);
    } catch (e) {
      summary.errors += 1;
      summary.failures.push({ routeId: r.id, message: e instanceof Error ? e.message : String(e) });
      console.error('[incharge-allocation-reconcile] failed for route', r.id, e);
    }
  }

  return NextResponse.json({ success: true, data: summary });
}
