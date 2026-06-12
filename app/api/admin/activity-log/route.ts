import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

// GET /api/admin/activity-log?module=&action=&actor=&date_from=&date_to=&limit=
// Returns the newest matching entries (default 500, max 1000) plus quick stats.
async function getActivityLog(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, 'tms.activity.view'))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const moduleFilter = searchParams.get('module');
    const actionFilter = searchParams.get('action');
    const actorFilter = searchParams.get('actor');
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');
    const limit = Math.min(parseInt(searchParams.get('limit') || '500', 10) || 500, 1000);

    const supabase = createServiceRoleClient();
    let query = supabase
      .from('tms_activity_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (moduleFilter) query = query.eq('module', moduleFilter);
    if (actionFilter) query = query.eq('action', actionFilter);
    if (actorFilter) query = query.eq('actor_id', actorFilter);
    if (dateFrom) query = query.gte('created_at', dateFrom);
    if (dateTo) query = query.lte('created_at', dateTo);

    const { data: logs, error } = await query;
    if (error) {
      // 42P01 = relation does not exist (migration not applied yet) — empty, not 500.
      if ((error as { code?: string }).code === '42P01') {
        return NextResponse.json({
          success: true,
          data: [],
          stats: { total: 0, today: 0, week: 0 },
        });
      }
      console.error('Activity log fetch error:', error);
      return NextResponse.json({ error: 'Failed to fetch activity log' }, { status: 500 });
    }

    // Quick stats (cheap head-count queries, unfiltered — "what happened lately").
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [{ count: total }, { count: today }, { count: week }] = await Promise.all([
      supabase.from('tms_activity_log').select('id', { count: 'exact', head: true }),
      supabase
        .from('tms_activity_log')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', startOfToday.toISOString()),
      supabase
        .from('tms_activity_log')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', weekAgo.toISOString()),
    ]);

    return NextResponse.json({
      success: true,
      data: logs ?? [],
      stats: { total: total ?? 0, today: today ?? 0, week: week ?? 0 },
    });
  } catch (e) {
    console.error('Activity log API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth(getActivityLog);
