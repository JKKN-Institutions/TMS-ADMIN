import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET - Search for regular stops from other routes
export async function GET(request: NextRequest) {
  try {
    console.log('Search stops API called');
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';
    const excludeRouteId = searchParams.get('excludeRouteId');
    const limit = parseInt(searchParams.get('limit') || '20');

    console.log('Search params:', { query, excludeRouteId, limit });

    // Check if Supabase client is configured
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Missing Supabase environment variables');
      return NextResponse.json(
        { error: 'Database configuration error' },
        { status: 500 }
      );
    }

    // Start with a simple query first
    let queryBuilder = supabase
      .from('route_stops')
      .select(`
        id,
        stop_name,
        stop_time,
        sequence_order,
        route_id
      `)
      .order('stop_name');

    // Exclude the current route if specified
    if (excludeRouteId) {
      queryBuilder = queryBuilder.neq('route_id', excludeRouteId);
    }

    // Apply search filter if query is provided
    if (query.trim()) {
      queryBuilder = queryBuilder.ilike('stop_name', `%${query}%`);
    }

    // Apply limit
    queryBuilder = queryBuilder.limit(limit);

    console.log('Executing Supabase query...');
    const { data: stops, error } = await queryBuilder;

    if (error) {
      console.error('Supabase error searching stops:', error);
      return NextResponse.json(
        { error: 'Failed to search stops', details: error.message },
        { status: 500 }
      );
    }

    console.log(`Found ${stops?.length || 0} stops`);

    // Get unique route IDs and fetch route information
    const routeIds = [...new Set(stops?.map(stop => stop.route_id).filter(Boolean))];
    console.log('Fetching route info for:', routeIds.length, 'routes');

    let routesMap: { [key: string]: any } = {};
    if (routeIds.length > 0) {
      try {
        const { data: routes, error: routesError } = await supabase
          .from('routes')
          .select('id, route_name, route_code')
          .in('id', routeIds);

        if (routesError) {
          console.error('Error fetching routes:', routesError);
        } else if (routes) {
          routesMap = routes.reduce((acc, route) => {
            acc[route.id] = route;
            return acc;
          }, {});
          console.log('Fetched', routes.length, 'route details');
        }
      } catch (error) {
        console.error('Exception fetching routes:', error);
      }
    }

    // Group stops by route with error handling
    let groupedStops: any[] = [];
    
    try {
      const grouped = stops?.reduce((acc: any, stop: any) => {
        const routeId = stop.route_id || 'unknown';
        const route = routesMap[routeId] || { 
          id: routeId, 
          route_name: `Route ${routeId.substring(0, 8)}...`, 
          route_code: null 
        };
        
        if (!acc[routeId]) {
          acc[routeId] = {
            route: route,
            stops: []
          };
        }
        
        acc[routeId].stops.push({
          id: stop.id,
          stop_name: stop.stop_name,
          stop_time: stop.stop_time,
          sequence_order: stop.sequence_order,
          route_id: stop.route_id,
          is_major_stop: false
        });
        
        return acc;
      }, {}) || {};
      
      groupedStops = Object.values(grouped);
      console.log('Successfully grouped into', groupedStops.length, 'route groups');
    } catch (error) {
      console.error('Error grouping stops:', error);
      // Fallback: return ungrouped stops
      groupedStops = [{
        route: { id: 'mixed', route_name: 'Various Routes', route_code: null },
        stops: stops || []
      }];
    }

    return NextResponse.json({ 
      stops: groupedStops,
      totalCount: stops?.length || 0,
      message: 'Search completed successfully'
    });
  } catch (error) {
    console.error('Error in search stops:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
