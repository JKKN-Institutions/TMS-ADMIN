import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { logActivity } from '@/lib/activity/log';
import { ACTIVE_LIFECYCLE_STATUSES } from '@/lib/passengers/types';

async function getRoutes() {
  try {
    // Create Supabase admin client (server-side only)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch routes with their stops embedded (single query — the list page only
    // needs route_stops.length, so we select just the stop ids). This replaces
    // the old per-route getRouteStops calls the client used to fan out.
    const { data: routes, error } = await supabase
      .from('tms_route')
      .select('*, route_stops:tms_route_stop(id)')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch routes' },
        { status: 500 }
      );
    }

    // Active learner count per route (same filter the route detail's Capacity uses:
    // bus_required + ACTIVE_LIFECYCLE_STATUSES) so the list count, the detail
    // Capacity figure and the learners drill-down all agree.
    const { data: assigns } = await supabase
      .from('learners_profiles')
      .select('transport_route_id')
      .eq('bus_required', true)
      .in('lifecycle_status', [...ACTIVE_LIFECYCLE_STATUSES])
      .not('transport_route_id', 'is', null)
      .limit(20000);

    const learnerCounts: Record<string, number> = {};
    for (const a of (assigns ?? []) as { transport_route_id: string }[]) {
      learnerCounts[a.transport_route_id] = (learnerCounts[a.transport_route_id] ?? 0) + 1;
    }
    const data = (routes ?? []).map((r) => ({ ...r, _learnerCount: learnerCounts[r.id] ?? 0 }));

    return NextResponse.json({
      success: true,
      data,
      count: data.length,
    });

  } catch (error) {
    console.error('Routes API Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function postRoute(request: NextRequest, auth: AuthContext) {
  try {
    const { action, routeId, routeData, stops } = await request.json();

    if (action === 'getRouteStops') {
      return await getRouteStops(routeId);
    }

    if (action === 'addRoute') {
      return await addRoute(request, routeData, stops, auth);
    }

    return NextResponse.json(
      { error: 'Unknown action' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Routes API Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function getRouteStops(routeId: string) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: stops, error } = await supabase
      .from('tms_route_stop')
      .select('*')
      .eq('route_id', routeId)
              .order('sequence_order', { ascending: true });

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch route stops' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: stops || []
    });

  } catch (error) {
    console.error('Error fetching route stops:', error);
    return NextResponse.json(
      { error: 'Failed to fetch route stops' },
      { status: 500 }
    );
  }
}

async function addRoute(request: NextRequest, routeData: any, stops: any[], auth: AuthContext) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Insert the route
    const { data: route, error: routeError } = await supabase
      .from('tms_route')
      .insert([routeData])
      .select()
      .single();

    if (routeError) {
      console.error('Database error adding route:', routeError);
      return NextResponse.json(
        { error: 'Failed to add route' },
        { status: 500 }
      );
    }

    // Insert route stops if provided
    if (stops && stops.length > 0) {
      const stopsWithRouteId = stops.map(stop => ({
        ...stop,
        route_id: route.id
      }));

      const { error: stopsError } = await supabase
        .from('tms_route_stop')
        .insert(stopsWithRouteId);

      if (stopsError) {
        console.error('Database error adding route stops:', stopsError);
        // If stops insertion fails, we might want to rollback the route
        // For now, we'll just log the error
      }
    }

    await logActivity(auth, request, {
      module: 'routes',
      action: 'create',
      entityType: 'tms_route',
      entityId: route.id,
      entityLabel: route.route_number ?? route.route_name,
      description: `Created route ${route.route_number ?? route.route_name}`,
    });
    return NextResponse.json({
      success: true,
      data: route
    });

  } catch (error) {
    console.error('Error adding route:', error);
    return NextResponse.json(
      { error: 'Failed to add route' },
      { status: 500 }
    );
  }
}

async function putRoute(request: NextRequest, auth: AuthContext) {
  try {
    const { routeId, routeData } = await request.json();

    if (!routeId) {
      return NextResponse.json(
        { error: 'Route ID is required' },
        { status: 400 }
      );
    }

    // Create Supabase admin client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Update route
    const { data: updatedRoute, error } = await supabase
      .from('tms_route')
      .update({
        route_number: routeData.route_number,
        route_name: routeData.route_name,
        start_location: routeData.start_location,
        end_location: routeData.end_location,
        start_latitude: routeData.start_latitude,
        start_longitude: routeData.start_longitude,
        end_latitude: routeData.end_latitude,
        end_longitude: routeData.end_longitude,
        departure_time: routeData.departure_time,
        arrival_time: routeData.arrival_time,
        distance: routeData.distance,
        duration: routeData.duration,
        total_capacity: routeData.total_capacity,
        fare: routeData.fare,
        status: routeData.status,
        driver_id: routeData.driver_id,
        vehicle_id: routeData.vehicle_id,
        updated_at: new Date().toISOString()
      })
      .eq('id', routeId)
      .select()
      .single();

    if (error) {
      console.error('Database error updating route:', error);
      return NextResponse.json(
        { error: 'Failed to update route' },
        { status: 500 }
      );
    }

    await logActivity(auth, request, {
      module: 'routes',
      action: 'update',
      entityType: 'tms_route',
      entityId: updatedRoute?.id ?? routeId,
      entityLabel: updatedRoute?.route_number ?? updatedRoute?.route_name,
      description: `Updated route ${updatedRoute?.route_number ?? routeId}`,
    });
    return NextResponse.json({
      success: true,
      data: updatedRoute,
      message: 'Route updated successfully'
    });

  } catch (error) {
    console.error('Error updating route:', error);
    return NextResponse.json(
      { error: 'Failed to update route' },
      { status: 500 }
    );
  }
}

export const GET = withAuth(() => getRoutes());
export const POST = withAuth((request, auth) => postRoute(request, auth));
export const PUT = withAuth((request, auth) => putRoute(request, auth));