import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  request: NextRequest,
  { params }: { params: { driverId: string } }
) {
  try {
    const { driverId } = params;

    if (!driverId) {
      return NextResponse.json(
        { success: false, error: 'Driver ID is required' },
        { status: 400 }
      );
    }

    // Get route assignments from driver_route_assignments table
    const { data: assignments, error: assignmentsError } = await supabase
      .from('driver_route_assignments')
      .select(`
        id,
        route_id,
        assigned_at,
        is_active,
        routes (
          id,
          route_number,
          route_name,
          start_location,
          end_location,
          status
        )
      `)
      .eq('driver_id', driverId)
      .eq('is_active', true)
      .order('assigned_at', { ascending: false });

    if (assignmentsError) {
      console.error('Error fetching driver route assignments:', assignmentsError);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch route assignments' },
        { status: 500 }
      );
    }

    // Also check for direct route assignments in routes table
    const { data: directRoutes, error: directRoutesError } = await supabase
      .from('routes')
      .select(`
        id,
        route_number,
        route_name,
        start_location,
        end_location,
        status
      `)
      .eq('driver_id', driverId)
      .eq('status', 'active');

    if (directRoutesError) {
      console.error('Error fetching direct route assignments:', directRoutesError);
    }

    // Combine both sources
    const allAssignments = [
      ...(assignments || []).map((assignment: any) => ({
        id: assignment.id,
        route_id: assignment.route_id,
        assigned_at: assignment.assigned_at,
        is_active: assignment.is_active,
        route: assignment.routes,
        source: 'driver_route_assignments'
      })),
      ...(directRoutes || []).map((route: any) => ({
        id: route.id,
        route_id: route.id,
        assigned_at: null,
        is_active: true,
        route: route,
        source: 'routes.driver_id'
      }))
    ];

    return NextResponse.json({
      success: true,
      assignments: allAssignments,
      count: allAssignments.length
    });

  } catch (error) {
    console.error('Error in driver route assignments API:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}




