import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// POST - Update GPS location for a vehicle
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      device_id, 
      vehicle_id, 
      latitude, 
      longitude, 
      speed, 
      heading, 
      accuracy, 
      altitude, 
      timestamp 
    } = body;

    // Validate required fields
    if (!device_id || !latitude || !longitude) {
      return NextResponse.json(
        { error: 'Device ID, latitude and longitude are required' },
        { status: 400 }
      );
    }

    // Validate coordinate ranges
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return NextResponse.json(
        { error: 'Invalid GPS coordinates' },
        { status: 400 }
      );
    }

    // Verify GPS device exists and is active
    const { data: device, error: deviceError } = await supabase
      .from('gps_devices')
      .select('id, status')
      .eq('device_id', device_id)
      .single();

    if (deviceError || !device) {
      return NextResponse.json(
        { error: 'GPS device not found' },
        { status: 404 }
      );
    }

    if (device.status !== 'active') {
      return NextResponse.json(
        { error: 'GPS device is not active' },
        { status: 400 }
      );
    }

    // Find vehicle with this GPS device
    const { data: vehicle, error: vehicleError } = await supabase
      .from('vehicles')
      .select('id, registration_number, live_tracking_enabled')
      .eq('gps_device_id', device.id)
      .single();

    if (vehicleError || !vehicle) {
      return NextResponse.json(
        { error: 'Vehicle with this GPS device not found' },
        { status: 404 }
      );
    }

    if (!vehicle.live_tracking_enabled) {
      return NextResponse.json(
        { error: 'Live tracking is not enabled for this vehicle' },
        { status: 400 }
      );
    }

    const currentTime = new Date().toISOString();
    const gpsTimestamp = timestamp || currentTime;

    // Update vehicle's current location
    const { error: updateError } = await supabase
      .from('vehicles')
      .update({
        current_latitude: latitude,
        current_longitude: longitude,
        gps_speed: speed || null,
        gps_heading: heading || null,
        gps_accuracy: accuracy || null,
        last_gps_update: gpsTimestamp,
        updated_at: currentTime
      })
      .eq('id', vehicle.id);

    if (updateError) {
      console.error('Error updating vehicle GPS location:', updateError);
      return NextResponse.json(
        { error: 'Failed to update vehicle location' },
        { status: 500 }
      );
    }

    // Store location in history
    const { error: historyError } = await supabase
      .from('gps_location_history')
      .insert([{
        vehicle_id: vehicle.id,
        gps_device_id: device.id,
        latitude,
        longitude,
        speed: speed || null,
        heading: heading || null,
        accuracy: accuracy || null,
        altitude: altitude || null,
        timestamp: gpsTimestamp,
        created_at: currentTime
      }]);

    if (historyError) {
      console.error('Error storing GPS location history:', historyError);
      // Don't fail the request if history storage fails
    }

    // Update device heartbeat
    await supabase
      .from('gps_devices')
      .update({
        last_heartbeat: currentTime,
        updated_at: currentTime
      })
      .eq('id', device.id);

    return NextResponse.json({
      success: true,
      message: 'GPS location updated successfully',
      data: {
        vehicle_id: vehicle.id,
        registration_number: vehicle.registration_number,
        latitude,
        longitude,
        timestamp: gpsTimestamp
      }
    });

  } catch (error) {
    console.error('GPS location update error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET - Get current GPS locations for all routes or specific route
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const routeId = searchParams.get('route_id');

    let query = supabase
      .from('routes')
      .select(`
        id,
        route_number,
        route_name,
        status,
        vehicle_id,
        current_latitude,
        current_longitude,
        gps_speed,
        gps_heading,
        gps_accuracy,
        last_gps_update,
        live_tracking_enabled,
        vehicles!fk_routes_vehicle (
          id,
          registration_number,
          current_latitude,
          current_longitude,
          gps_speed,
          gps_heading,
          gps_accuracy,
          last_gps_update,
          live_tracking_enabled,
          gps_devices (
            device_id,
            device_name,
            status,
            last_heartbeat
          )
        )
      `);

    if (routeId) {
      query = query.eq('id', routeId);
    }

    const { data: routes, error } = await query.order('route_number');

    if (error) {
      console.error('Error fetching GPS locations:', error);
      return NextResponse.json(
        { error: 'Failed to fetch GPS locations' },
        { status: 500 }
      );
    }

    const mapped = (routes || []).map((r: any) => {
      const vehicle = r.vehicles?.[0];
      const current = vehicle?.current_latitude && vehicle?.current_longitude
        ? {
            latitude: vehicle.current_latitude,
            longitude: vehicle.current_longitude,
            accuracy: vehicle.gps_accuracy,
            speed: vehicle.gps_speed,
            heading: vehicle.gps_heading,
            lastUpdate: vehicle.last_gps_update
          }
        : (r.current_latitude && r.current_longitude ? {
            latitude: r.current_latitude,
            longitude: r.current_longitude,
            accuracy: r.gps_accuracy,
            speed: r.gps_speed,
            heading: r.gps_heading,
            lastUpdate: r.last_gps_update
          } : null);
      return { ...r, current_location: current };
    });

    return NextResponse.json({ success: true, data: mapped, count: mapped.length });

  } catch (error) {
    console.error('GPS location fetch error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 