import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    // Fetch vehicles from database
    const { data: vehicles, error } = await supabase
      .from('vehicles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch vehicles' },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      success: true, 
      data: vehicles || [],
      count: vehicles?.length || 0
    });

  } catch (error) {
    console.error('Vehicles API Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Create new vehicle
export async function POST(request: NextRequest) {
  try {
    const vehicleData = await request.json();

    // Validate required fields
    if (!vehicleData.registrationNumber || !vehicleData.model || !vehicleData.capacity) {
      return NextResponse.json(
        { error: 'Registration number, model, and capacity are required' },
        { status: 400 }
      );
    }

    // Check if registration number already exists
    const { data: existingVehicle } = await supabase
      .from('vehicles')
      .select('id')
      .eq('registration_number', vehicleData.registrationNumber)
      .single();

    if (existingVehicle) {
      return NextResponse.json(
        { error: 'Vehicle with this registration number already exists' },
        { status: 409 }
      );
    }

    // Prepare vehicle data with proper field mapping
    const newVehicleData = {
      registration_number: vehicleData.registrationNumber,
      model: vehicleData.model,
      capacity: parseInt(vehicleData.capacity),
      fuel_type: vehicleData.fuelType || 'diesel',
      status: vehicleData.status || 'active',
      insurance_expiry: vehicleData.insuranceExpiry || null,
      fitness_expiry: vehicleData.fitnessExpiry || null,
      next_maintenance: vehicleData.nextMaintenance || null,
      mileage: vehicleData.mileage ? parseFloat(vehicleData.mileage) : 0,
      purchase_date: vehicleData.purchaseDate || null,
      chassis_number: vehicleData.chassisNumber || null,
      engine_number: vehicleData.engineNumber || null,
      gps_device_id: vehicleData.gpsDeviceId || null,
      live_tracking_enabled: vehicleData.liveTrackingEnabled || false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Insert new vehicle
    const { data: newVehicle, error } = await supabase
      .from('vehicles')
      .insert([newVehicleData])
      .select()
      .single();

    if (error) {
      console.error('Error creating vehicle:', error);
      return NextResponse.json(
        { error: 'Failed to create vehicle' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: newVehicle,
      message: 'Vehicle created successfully'
    });

  } catch (error) {
    console.error('Vehicle creation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 