import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * GET one route (full tms_route row + its ordered stops) by id. Backs the
 * in-module route view/edit pages so they survive deep-link / hard refresh.
 * Auth is enforced by proxy.ts (every /api route requires an authenticated TMS
 * user), matching the sibling [routeId]/stops handler.
 *
 * Note: this is the handler for /api/admin/routes/[routeId] itself — distinct
 * from the existing [routeId]/stops and [routeId]/possible-stops children.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ routeId: string }> }
) {
  try {
    const { routeId } = await params;
    if (!routeId) {
      return NextResponse.json({ error: 'Route id is required' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: route, error } = await supabase
      .from('tms_route')
      .select('*')
      .eq('id', routeId)
      .maybeSingle();

    if (error) {
      console.error('Route detail query error:', error);
      return NextResponse.json({ error: 'Failed to fetch route' }, { status: 500 });
    }
    if (!route) {
      return NextResponse.json({ error: 'Route not found' }, { status: 404 });
    }

    const { data: stops } = await supabase
      .from('tms_route_stop')
      .select('*')
      .eq('route_id', routeId)
      .order('sequence_order', { ascending: true });

    return NextResponse.json({ success: true, data: { ...route, route_stops: stops ?? [] } });
  } catch (e) {
    console.error('Route detail API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
