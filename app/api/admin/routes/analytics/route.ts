import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { istToday } from '@/lib/booking/window';
import { loadRouteBoard } from '@/lib/routes/board';
import { summariseRoutes, busiestRoutes, biggestNoShows } from '@/lib/routes/analytics';

// GET /api/admin/routes/analytics
//
// Powers Routes > Analytics: the operations board for a day, plus the
// fleet-level roll-up derived from it. The board previously lived on the admin
// dashboard; it moved here because a 9-column operating table belongs in the
// module that owns routes, not on an overview page.

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

async function getRouteAnalytics(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, 'tms.routes.view'))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // A caller may ask for another day; anything unparseable falls back to
    // today rather than querying a garbage date.
    const requested = new URL(request.url).searchParams.get('date');
    const date = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : istToday();

    const { routes, degraded } = await loadRouteBoard(date);

    return NextResponse.json({
      success: true,
      data: {
        date,
        routes,
        summary: summariseRoutes(routes),
        busiest: busiestRoutes(routes, 10),
        noShows: biggestNoShows(routes, 5),
        degraded,
      },
    });
  } catch (error) {
    console.error('Route analytics API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth(getRouteAnalytics);
