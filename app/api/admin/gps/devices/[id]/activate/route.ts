import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// POST - Activate a GPS device
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    // Update device status to active
    const { data: updatedDevice, error } = await supabase
      .from('gps_devices')
      .update({
        status: 'active',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error activating GPS device:', error);
      return NextResponse.json(
        { error: 'Failed to activate GPS device' },
        { status: 500 }
      );
    }

    if (!updatedDevice) {
      return NextResponse.json(
        { error: 'GPS device not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: updatedDevice,
      message: `GPS device ${updatedDevice.device_name} activated successfully`
    });

  } catch (error) {
    console.error('GPS device activation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 