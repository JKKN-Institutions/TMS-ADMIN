import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import {
  buildCoverage, summarizeCoverage, DEFAULT_COVERAGE_THRESHOLD, type RawRouteCoverage,
} from '@/lib/attendance/coverage';
import { istToday } from '@/lib/booking/window';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** `days` back from `date`, as YYYY-MM-DD. Integer UTC math; no timezone lib. */
function minusDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) - days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * GET /api/admin/attendance/coverage — the routes x service-days grid.
 *
 * One RPC call. The function returns one row per route with its days folded
 * into jsonb, so the payload is 25 rows for any range and the PostgREST
 * 1,000-row cap is unreachable. Defaults to the last 30 days ending today.
 */
async function getCoverage(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const url = new URL(request.url);
    const to = url.searchParams.get('to') || istToday();
    const from = url.searchParams.get('from') || minusDays(to, 29);
    if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) {
      return NextResponse.json({ error: 'from and to must be YYYY-MM-DD' }, { status: 400 });
    }
    if (from > to) {
      return NextResponse.json({ error: 'from must not be after to' }, { status: 400 });
    }
    const direction = url.searchParams.get('direction') === 'return' ? 'return' : 'onward';

    const rawThreshold = Number(url.searchParams.get('threshold'));
    const threshold =
      Number.isFinite(rawThreshold) && rawThreshold > 0 && rawThreshold <= 1
        ? rawThreshold
        : DEFAULT_COVERAGE_THRESHOLD;

    const svc = createServiceRoleClient();
    const { data, error } = await svc.rpc('tms_attendance_coverage', {
      p_from: from, p_to: to, p_direction: direction,
    });

    if (error) {
      // A missing function or table is an empty grid, not a 500. Anything else
      // is reported as an error -- an empty grid would read as "no route was
      // ever marked", which is a different and far more alarming claim.
      if (error.code === '42P01' || error.code === '42883') {
        return NextResponse.json({
          success: true,
          data: { from, to, direction, threshold, dates: [], routes: [], summary: summarizeCoverage([]) },
        });
      }
      console.error('admin attendance coverage error:', error);
      return NextResponse.json({ error: 'Failed to load attendance coverage' }, { status: 500 });
    }

    const { routes, dates } = buildCoverage((data ?? []) as RawRouteCoverage[], threshold);
    return NextResponse.json({
      success: true,
      data: { from, to, direction, threshold, dates, routes, summary: summarizeCoverage(routes) },
    });
  } catch (e) {
    console.error('admin attendance coverage error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getCoverage(request, auth));
