import { NextResponse, NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Helper function to get Supabase client
function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Server configuration error');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

// Helper function to format data for database
function formatForDB(value: any) {
  if (value === '' || value === undefined) return null;
  return value;
}

// Helper function to format date properly
function formatDate(dateValue: any) {
  if (!dateValue || dateValue === '') return null;
  // If it's already a valid date string, return as is
  if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    return dateValue;
  }
  return null;
}

export async function GET() {
  try {
    const supabase = getSupabaseClient();

    // Fetch drivers from database
    const { data: rawDrivers, error } = await supabase
      .from('drivers')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch drivers' },
        { status: 500 }
      );
    }

    // Transform data to match frontend expectations
    const drivers = (rawDrivers || []).map(driver => ({
      id: driver.id,
      name: driver.name,
      driver_name: driver.name || 'Unknown Driver', // Schema uses 'name' not 'driver_name'
      phone: driver.phone,
      phone_number: driver.phone || 'N/A', // Schema uses 'phone' not 'phone_number'
      email: driver.email || 'N/A',
      license_number: driver.license_number || 'N/A',
      experience_years: driver.experience_years || 0,
      rating: driver.rating || 4.0,
      status: driver.status || 'active',
      address: driver.address,
      emergency_contact_name: driver.emergency_contact_name,
      emergency_contact_phone: driver.emergency_contact_phone,
      license_expiry: driver.license_expiry,
      medical_certificate_expiry: driver.medical_certificate_expiry,
      aadhar_number: driver.aadhar_number,
      total_trips: driver.total_trips || 0,
      assigned_route_id: driver.assigned_route_id,
      created_at: driver.created_at,
      updated_at: driver.updated_at,
      // Location tracking fields
      location_sharing_enabled: driver.location_sharing_enabled || false,
      location_enabled: driver.location_enabled || false,
      location_tracking_status: driver.location_tracking_status || 'inactive',
      current_latitude: driver.current_latitude,
      current_longitude: driver.current_longitude,
      location_accuracy: driver.location_accuracy,
      location_timestamp: driver.location_timestamp,
      last_location_update: driver.last_location_update,
      // Default relationship fields
      routes: null,
      vehicles: null
    }));

    return NextResponse.json({ 
      success: true, 
      data: drivers,
      count: drivers.length
    });

  } catch (error) {
    console.error('Drivers API Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Add new driver
export async function POST(request: NextRequest) {
  try {
    const driverData = await request.json();
    console.log('API: Adding new driver:', driverData);

    // Validate required fields
    if (!driverData.name || !driverData.licenseNumber || !driverData.phone) {
      return NextResponse.json(
        { error: 'Name, license number, and phone are required' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();

    // Check if license number already exists
    const { data: existingDriver } = await supabase
      .from('drivers')
      .select('id')
      .eq('license_number', driverData.licenseNumber)
      .single();

    if (existingDriver) {
      return NextResponse.json(
        { error: 'Driver with this license number already exists' },
        { status: 409 }
      );
    }

    // Prepare driver data with proper field mapping
    const insertData = {
      name: driverData.name,
      license_number: driverData.licenseNumber,
      aadhar_number: driverData.aadharNumber,
      phone: driverData.phone,
      email: formatForDB(driverData.email),
      experience_years: driverData.experienceYears || 0,
      rating: driverData.rating || 4.0,
      total_trips: driverData.totalTrips || 0,
      status: driverData.status || 'active',
      address: formatForDB(driverData.address),
      emergency_contact_name: formatForDB(driverData.emergencyContactName),
      emergency_contact_phone: formatForDB(driverData.emergencyContactPhone),
      license_expiry: formatDate(driverData.licenseExpiry),
      medical_certificate_expiry: formatDate(driverData.medicalCertificateExpiry),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    console.log('API: Formatted data for database insert:', insertData);

    // Insert new driver
    const { data: newDriver, error } = await supabase
      .from('drivers')
      .insert([insertData])
      .select()
      .single();

    if (error) {
      console.error('Database error adding driver:', error);
      return NextResponse.json(
        { error: 'Failed to add driver: ' + error.message },
        { status: 500 }
      );
    }

    console.log('API: Driver added successfully:', newDriver);

    return NextResponse.json({
      success: true,
      data: newDriver,
      message: 'Driver added successfully'
    });

  } catch (error) {
    console.error('Error adding driver:', error);
    return NextResponse.json(
      { error: 'Failed to add driver' },
      { status: 500 }
    );
  }
}

// PUT - Update existing driver
export async function PUT(request: NextRequest) {
  try {
    const { driverId, driverData } = await request.json();
    console.log('API: Updating driver:', driverId, driverData);

    if (!driverId) {
      return NextResponse.json(
        { error: 'Driver ID is required' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();

    // Prepare driver data with proper field mapping
    const updateData = {
      name: driverData.name,
      license_number: driverData.licenseNumber,
      aadhar_number: driverData.aadharNumber,
      phone: driverData.phone,
      email: formatForDB(driverData.email),
      experience_years: driverData.experienceYears || 0,
      rating: driverData.rating || 4.0,
      total_trips: driverData.totalTrips || 0,
      status: driverData.status || 'active',
      address: formatForDB(driverData.address),
      emergency_contact_name: formatForDB(driverData.emergencyContactName),
      emergency_contact_phone: formatForDB(driverData.emergencyContactPhone),
      license_expiry: formatDate(driverData.licenseExpiry),
      medical_certificate_expiry: formatDate(driverData.medicalCertificateExpiry),
      updated_at: new Date().toISOString()
    };

    console.log('API: Formatted data for database update:', updateData);

    // Update driver
    const { data: updatedDriver, error } = await supabase
      .from('drivers')
      .update(updateData)
      .eq('id', driverId)
      .select()
      .single();

    if (error) {
      console.error('Database error updating driver:', error);
      return NextResponse.json(
        { error: 'Failed to update driver: ' + error.message },
        { status: 500 }
      );
    }

    console.log('API: Driver updated successfully:', updatedDriver);

    return NextResponse.json({
      success: true,
      data: updatedDriver,
      message: 'Driver updated successfully'
    });

  } catch (error) {
    console.error('Error updating driver:', error);
    return NextResponse.json(
      { error: 'Failed to update driver' },
      { status: 500 }
    );
  }
} 