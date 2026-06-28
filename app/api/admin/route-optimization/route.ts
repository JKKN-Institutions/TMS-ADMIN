import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { DEFAULT_OPTIONS } from '@/lib/route-optimization/engine';
import { loadOptimizationAnalysis, peakBookingDate } from '@/lib/route-optimization/data';

/**
 * GET /api/admin/route-optimization?date=YYYY-MM-DD&threshold=50
 *
 * Read-only occupancy + consolidation analysis for one travel_date, plus the
 * list of optimization runs already applied for that date (for the Undo panel).
 *
 * Operates entirely on the modern tms_ plane (tms_route / tms_route_stop /
 * tms_booking / tms_vehicle). Nothing is written here — applying transfers is
 * POST /execute-transfers, undoing is POST /rollback.
 */

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function canView(auth: AuthContext): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', {
    permission_name: TMS_PERMISSIONS.ROUTES_VIEW,
  });
  return !!data;
}

async function handleGet(request: NextRequest, auth: AuthContext) {
  if (!(await canView(auth))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const isYmd = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

  const thresholdRaw = Number(params.get('threshold'));
  const threshold =
    Number.isFinite(thresholdRaw) && thresholdRaw >= 1 && thresholdRaw <= 100
      ? Math.round(thresholdRaw)
      : DEFAULT_OPTIONS.underUtilizedMaxPercent;

  // Planning horizon: ?from&to → analyze the busiest day in the range.
  // Daily horizon (default): ?date (or today).
  const from = params.get('from');
  const to = params.get('to');
  const planning = isYmd(from) && isYmd(to);

  try {
    const supabase = createServiceRoleClient();

    let date: string;
    let peakInfo: { date: string; totalBookings: number; daysWithBookings: number } | null = null;
    if (planning) {
      peakInfo = await peakBookingDate(supabase, from, to);
      date = peakInfo?.date ?? to;
    } else {
      date = isYmd(params.get('date')) ? (params.get('date') as string) : todayIso();
    }

    const analysis = await loadOptimizationAnalysis(supabase, date, threshold);

    const { data: appliedRuns, error: runsErr } = await supabase
      .from('tms_route_optimization')
      .select(
        'id, travel_date, mode, threshold_percent, total_moves, routes_cancelled, estimated_savings, status, created_at, created_by, rolled_back_at'
      )
      .eq('travel_date', date)
      .order('created_at', { ascending: false });
    if (runsErr) {
      console.error('route-optimization: runs query failed', runsErr);
    }

    return NextResponse.json({
      success: true,
      data: analysis,
      appliedRuns: appliedRuns ?? [],
      horizon: planning ? 'planning' : 'daily',
      range: planning ? { from, to } : null,
      peak: peakInfo,
    });
  } catch (error) {
    console.error('route-optimization: analyze failed', error);
    return NextResponse.json({ error: 'Failed to analyze route optimization' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => handleGet(request, auth));
