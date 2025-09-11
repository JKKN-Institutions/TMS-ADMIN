import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    // Test the drivers query
    const { data: drivers, error: driversError } = await supabase
      .from('drivers')
      .select(`
        id,
        name,
        current_latitude,
        current_longitude,
        location_sharing_enabled,
        location_tracking_status,
        last_location_update,
        routes!fk_routes_driver (
          id,
          route_number,
          route_name,
          vehicle_id,
          vehicles!fk_routes_vehicle (
            id,
            registration_number,
            model
          )
        )
      `)
      .order('name');

    if (driversError) {
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch drivers',
        details: driversError
      });
    }

    // Test the main API endpoint
    const mainApiResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3001'}/api/admin/track-all/drivers`);
    const mainApiData = await mainApiResponse.json();

    return NextResponse.json({
      success: true,
      testResults: {
        totalDrivers: drivers.length,
        driversWithLocation: drivers.filter(d => d.current_latitude && d.current_longitude).length,
        driversWithRoutes: drivers.filter(d => d.routes && d.routes.length > 0).length,
        activeTracking: drivers.filter(d => d.location_sharing_enabled).length,
        mainApiSuccess: mainApiResponse.ok,
        mainApiData: mainApiData.success ? {
          total: mainApiData.total,
          active_tracking: mainApiData.active_tracking,
          online_drivers: mainApiData.online_drivers
        } : null
      },
      sampleDriver: drivers.length > 0 ? {
        id: drivers[0].id,
        name: drivers[0].name,
        hasLocation: !!(drivers[0].current_latitude && drivers[0].current_longitude),
        locationSharingEnabled: drivers[0].location_sharing_enabled,
        hasRoute: !!(drivers[0].routes && drivers[0].routes.length > 0),
        routeInfo: drivers[0].routes?.[0] ? {
          routeNumber: drivers[0].routes[0].route_number,
          routeName: drivers[0].routes[0].route_name,
          hasVehicle: !!(drivers[0].routes[0].vehicles && drivers[0].routes[0].vehicles.length > 0)
        } : null
      } : null
    });

  } catch (error) {
    console.error('Test API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
