import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    // Get all drivers with their location data, route assignments, and vehicle information
    const { data: drivers, error: driversError } = await supabase
      .from('drivers')
      .select(`
        id,
        name,
        current_latitude,
        current_longitude,
        location_accuracy,
        location_timestamp,
        last_location_update,
        location_sharing_enabled,
        location_tracking_status,
        routes!fk_routes_driver (
          id,
          route_number,
          route_name,
          start_location,
          end_location,
          status,
          vehicle_id,
          vehicles!fk_routes_vehicle (
            id,
            registration_number,
            model,
            current_latitude,
            current_longitude,
            last_gps_update,
            gps_speed,
            gps_heading,
            gps_accuracy
          )
        )
      `)
      .order('name');

    if (driversError) {
      console.error('Error fetching drivers:', driversError);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch drivers' },
        { status: 500 }
      );
    }

    // Transform the data to flatten the structure with fallback for vehicle data
    const transformedDrivers = await Promise.all(drivers.map(async (driver) => {
      const route = driver.routes?.[0] || null;
      let vehicle = route?.vehicles?.[0] || null;

      // If relationship query didn't work, fetch vehicle data separately
      if (!vehicle && route?.vehicle_id) {
        const { data: vehicleData, error: vehicleError } = await supabase
          .from('vehicles')
          .select('*')
          .eq('id', route.vehicle_id)
          .single();
        
        if (!vehicleError && vehicleData) {
          vehicle = vehicleData;
        }
      }

      return {
        id: driver.id,
        name: driver.name,
        current_latitude: driver.current_latitude,
        current_longitude: driver.current_longitude,
        location_accuracy: driver.location_accuracy,
        location_timestamp: driver.location_timestamp,
        last_location_update: driver.last_location_update,
        location_sharing_enabled: driver.location_sharing_enabled,
        location_tracking_status: driver.location_tracking_status,
        route_id: route?.id || null,
        route_number: route?.route_number || null,
        route_name: route?.route_name || null,
        route_start_location: route?.start_location || null,
        route_end_location: route?.end_location || null,
        route_status: route?.status || null,
        vehicle_id: vehicle?.id || null,
        registration_number: vehicle?.registration_number || null,
        vehicle_model: vehicle?.model || null,
        vehicle_latitude: vehicle?.current_latitude || null,
        vehicle_longitude: vehicle?.current_longitude || null,
        vehicle_last_gps_update: vehicle?.last_gps_update || null,
        vehicle_gps_speed: vehicle?.gps_speed || null,
        vehicle_gps_heading: vehicle?.gps_heading || null,
        vehicle_gps_accuracy: vehicle?.gps_accuracy || null
      };
    }));

    // Calculate GPS status for each driver
    const driversWithStatus = transformedDrivers.map(driver => {
      let gpsStatus = 'offline';
      let timeSinceUpdate = null;
      let locationStatus = 'no_location';
      let statusMessage = 'No location data available';

      // Check driver location first
      if (driver.last_location_update && driver.location_sharing_enabled) {
        const lastUpdate = new Date(driver.last_location_update);
        const now = new Date();
        const minutesDiff = Math.floor((now.getTime() - lastUpdate.getTime()) / 60000);
        timeSinceUpdate = minutesDiff;
        
        if (minutesDiff <= 2) {
          gpsStatus = 'online';
          statusMessage = 'Driver location is live';
        } else if (minutesDiff <= 5) {
          gpsStatus = 'recent';
          statusMessage = 'Driver location recently active';
        } else {
          gpsStatus = 'offline';
          statusMessage = 'Driver location offline';
        }
        locationStatus = 'driver_app';
      }
      // Fallback to vehicle GPS if driver location not available
      else if (driver.vehicle_last_gps_update) {
        const lastUpdate = new Date(driver.vehicle_last_gps_update);
        const now = new Date();
        const minutesDiff = Math.floor((now.getTime() - lastUpdate.getTime()) / 60000);
        timeSinceUpdate = minutesDiff;
        
        if (minutesDiff <= 2) {
          gpsStatus = 'online';
          statusMessage = 'Vehicle GPS is live';
        } else if (minutesDiff <= 5) {
          gpsStatus = 'recent';
          statusMessage = 'Vehicle GPS recently active';
        } else {
          gpsStatus = 'offline';
          statusMessage = 'Vehicle GPS offline';
        }
        locationStatus = 'vehicle_gps';
      }
      // No location data available
      else {
        gpsStatus = 'offline';
        locationStatus = 'no_location';
        
        if (!driver.location_sharing_enabled) {
          statusMessage = 'Driver location sharing is disabled';
          locationStatus = 'sharing_disabled';
        } else if (!driver.route_id) {
          statusMessage = 'Driver not assigned to any route';
          locationStatus = 'no_route';
        } else if (!driver.vehicle_id) {
          statusMessage = 'No vehicle assigned to route';
          locationStatus = 'no_vehicle';
        } else {
          statusMessage = 'No location data available';
        }
      }

      return {
        ...driver,
        gps_status: gpsStatus,
        time_since_update: timeSinceUpdate,
        location_status: locationStatus,
        status_message: statusMessage
      };
    });

    return NextResponse.json({
      success: true,
      drivers: driversWithStatus,
      total: driversWithStatus.length,
      active_tracking: driversWithStatus.filter(d => d.location_sharing_enabled).length,
      online_drivers: driversWithStatus.filter(d => d.gps_status === 'online').length,
      last_updated: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in track all drivers API:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
