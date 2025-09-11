import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const studentId = params.id;

    if (!studentId) {
      return NextResponse.json(
        { success: false, error: 'Student ID is required' },
        { status: 400 }
      );
    }

    // Get student location data
    const { data: student, error } = await supabase
      .from('students')
      .select(`
        id,
        student_name,
        external_id,
        current_latitude,
        current_longitude,
        location_accuracy,
        location_timestamp,
        last_location_update,
        location_sharing_enabled,
        location_enabled
      `)
      .eq('external_id', studentId)
      .single();

    if (error || !student) {
      return NextResponse.json(
        { success: false, error: 'Student not found' },
        { status: 404 }
      );
    }

    // Check if location sharing is enabled
    if (!student.location_sharing_enabled) {
      return NextResponse.json({
        success: true,
        location: null,
        message: 'Location sharing is disabled for this student'
      });
    }

    // Check if location data exists
    if (!student.current_latitude || !student.current_longitude) {
      return NextResponse.json({
        success: true,
        location: null,
        message: 'No location data available'
      });
    }

    // Return location data
    const locationData = {
      latitude: student.current_latitude,
      longitude: student.current_longitude,
      accuracy: student.location_accuracy || 0,
      timestamp: student.location_timestamp,
      lastUpdate: student.last_location_update,
      sharingEnabled: student.location_sharing_enabled,
      trackingEnabled: student.location_enabled
    };

    return NextResponse.json({
      success: true,
      location: locationData,
      studentName: student.student_name
    });

  } catch (error) {
    console.error('Error fetching student location:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const studentId = params.id;
    const body = await request.json();
    const { locationSharingEnabled, locationEnabled } = body;

    if (!studentId) {
      return NextResponse.json(
        { success: false, error: 'Student ID is required' },
        { status: 400 }
      );
    }

    // Check if student exists
    const { data: student, error: studentError } = await supabase
      .from('students')
      .select('id')
      .eq('external_id', studentId)
      .single();

    if (studentError || !student) {
      return NextResponse.json(
        { success: false, error: 'Student not found' },
        { status: 404 }
      );
    }

    // Update location settings
    const updateData: any = {};
    
    if (locationSharingEnabled !== undefined) {
      updateData.location_sharing_enabled = locationSharingEnabled;
    }
    
    if (locationEnabled !== undefined) {
      updateData.location_enabled = locationEnabled;
    }

    const { error: updateError } = await supabase
      .from('students')
      .update(updateData)
      .eq('id', student.id);

    if (updateError) {
      console.error('Error updating student location settings:', updateError);
      return NextResponse.json(
        { success: false, error: 'Failed to update location settings' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Location settings updated successfully'
    });

  } catch (error) {
    console.error('Error updating student location settings:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
} 