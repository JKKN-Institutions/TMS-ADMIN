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
    const { searchParams } = new URL(request.url);
    const routeId = searchParams.get('routeId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 1000;

    const { driverId } = params;

    if (!driverId) {
      return NextResponse.json(
        { success: false, error: 'Driver ID is required' },
        { status: 400 }
      );
    }

    // Validate driver exists
    const { data: driver, error: driverError } = await supabase
      .from('drivers')
      .select(`
        id,
        name,
        license_number,
        phone,
        email,
        current_latitude,
        current_longitude,
        location_accuracy,
        location_timestamp,
        last_location_update,
        location_sharing_enabled,
        location_enabled,
        location_tracking_status,
        status
      `)
      .eq('id', driverId)
      .single();

    if (driverError || !driver) {
      return NextResponse.json(
        { success: false, error: 'Driver not found' },
        { status: 404 }
      );
    }

    // Get recent location tracking data
    let trackingData = null;
    let query = supabase
      .from('location_tracking')
      .select(`
        id,
        tracking_date,
        tracking_timestamp,
        latitude,
        longitude,
        accuracy,
        speed,
        heading,
        location_source,
        data_quality,
        created_at,
        routes!inner (
          id,
          route_number,
          route_name
        ),
        vehicles (
          id,
          registration_number,
          model
        )
      `)
      .eq('driver_id', driverId)
      .eq('is_active', true)
      .order('tracking_timestamp', { ascending: false })
      .limit(limit);

    // Add filters
    if (routeId) {
      query = query.eq('route_id', routeId);
    }

    if (startDate) {
      query = query.gte('tracking_date', startDate);
    }

    if (endDate) {
      query = query.lte('tracking_date', endDate);
    }

    const { data: tracking, error: trackingError } = await query;

    if (!trackingError && tracking) {
      trackingData = tracking;
    }

    // Get driver's assigned routes
    const { data: assignedRoutes, error: routesError } = await supabase
      .from('driver_route_assignments')
      .select(`
        routes (
          id,
          route_number,
          route_name,
          start_location,
          end_location
        )
      `)
      .eq('driver_id', driverId)
      .eq('is_active', true);

    return NextResponse.json({
      success: true,
      driver: {
        id: driver.id,
        name: driver.name,
        licenseNumber: driver.license_number,
        phone: driver.phone,
        email: driver.email,
        status: driver.status,
        currentLocation: {
          latitude: driver.current_latitude,
          longitude: driver.current_longitude,
          accuracy: driver.location_accuracy,
          timestamp: driver.location_timestamp,
          lastUpdate: driver.last_location_update
        },
        trackingStatus: driver.location_tracking_status || 'inactive',
        sharingEnabled: driver.location_sharing_enabled === true,
        trackingEnabled: driver.location_enabled === true
      },
      assignedRoutes: assignedRoutes?.map(ar => ar.routes) || [],
      trackingHistory: trackingData || []
    });

  } catch (error) {
    console.error('Error in admin driver location get API:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
