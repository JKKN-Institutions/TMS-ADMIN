import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET - Fetch all GPS devices
export async function GET() {
  try {
    const { data: devices, error } = await supabase
      .from('gps_devices')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching GPS devices:', error);
      return NextResponse.json(
        { error: 'Failed to fetch GPS devices' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: devices || [],
      count: devices?.length || 0
    });

  } catch (error) {
    console.error('GPS devices API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Create new GPS device
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { device_id, device_name, device_model, sim_number, imei, notes } = body;

    // Validate required fields
    if (!device_id || !device_name) {
      return NextResponse.json(
        { error: 'Device ID and device name are required' },
        { status: 400 }
      );
    }

    // Check if device_id already exists
    const { data: existingDevice } = await supabase
      .from('gps_devices')
      .select('id')
      .eq('device_id', device_id)
      .single();

    if (existingDevice) {
      return NextResponse.json(
        { error: 'Device ID already exists' },
        { status: 409 }
      );
    }

    // Create new GPS device
    const { data: newDevice, error } = await supabase
      .from('gps_devices')
      .insert([{
        device_id,
        device_name,
        device_model: device_model || null,
        sim_number: sim_number || null,
        imei: imei || null,
        notes: notes || null,
        status: 'inactive', // Default status
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) {
      console.error('Error creating GPS device:', error);
      return NextResponse.json(
        { error: 'Failed to create GPS device' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: newDevice,
      message: 'GPS device created successfully'
    });

  } catch (error) {
    console.error('GPS device creation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 