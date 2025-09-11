import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { scheduleId, completionNotes } = await request.json();

    if (!scheduleId) {
      return NextResponse.json(
        { error: 'Schedule ID is required' },
        { status: 400 }
      );
    }

    // Get the schedule with route and booking information
    const { data: schedule, error: scheduleError } = await supabase
      .from('schedules')
      .select(`
        *,
        routes!route_id (
          route_number,
          route_name,
          start_location,
          end_location
        )
      `)
      .eq('id', scheduleId)
      .single();

    if (scheduleError || !schedule) {
      return NextResponse.json(
        { error: 'Schedule not found' },
        { status: 404 }
      );
    }

    // Check if the trip is eligible for completion
    const tripDate = new Date(schedule.schedule_date);
    const currentDate = new Date();
    
    // Only allow completion if the trip date has passed
    if (tripDate >= currentDate) {
      return NextResponse.json(
        { error: 'Cannot complete a trip that has not occurred yet' },
        { status: 400 }
      );
    }

    // Get all bookings for this schedule
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select(`
        *,
        students (
          student_name,
          email,
          mobile,
          roll_number
        )
      `)
      .eq('schedule_id', scheduleId)
      .eq('status', 'confirmed');

    if (bookingsError) {
      return NextResponse.json(
        { error: 'Failed to fetch booking information' },
        { status: 500 }
      );
    }

    // Update the schedule status to completed
    const { error: updateError } = await supabase
      .from('schedules')
      .update({
        status: 'completed',
        completion_date: new Date().toISOString(),
        completion_notes: completionNotes || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', scheduleId);

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to update schedule status' },
        { status: 500 }
      );
    }

    // Update all confirmed bookings to completed status
    if (bookings && bookings.length > 0) {
      const { error: bookingUpdateError } = await supabase
        .from('bookings')
        .update({
          status: 'completed',
          completion_date: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('schedule_id', scheduleId)
        .eq('status', 'confirmed');

      if (bookingUpdateError) {
        console.error('Failed to update booking statuses:', bookingUpdateError);
      }
    }

    // Create completion record for tracking
    const { error: completionError } = await supabase
      .from('trip_completions')
      .insert({
        schedule_id: scheduleId,
        route_id: schedule.route_id,
        completion_date: new Date().toISOString(),
        passenger_count: bookings?.length || 0,
        completion_notes: completionNotes || null,
        created_at: new Date().toISOString()
      });

    if (completionError) {
      console.error('Failed to create completion record:', completionError);
      // Don't fail the request if completion record fails
    }

    return NextResponse.json({
      success: true,
      message: 'Trip completed successfully',
      schedule: {
        id: schedule.id,
        route: schedule.routes,
        date: schedule.schedule_date,
        passengerCount: bookings?.length || 0
      },
      passengers: bookings?.map(booking => ({
        id: booking.id,
        studentName: booking.students?.student_name,
        rollNumber: booking.students?.roll_number,
        seatNumber: booking.seat_number,
        boardingStop: booking.boarding_stop
      })) || []
    });

  } catch (error) {
    console.error('Error completing trip:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET - Get completed trips with passenger information
export async function GET(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { searchParams } = new URL(request.url);
    
    const routeId = searchParams.get('routeId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const limit = parseInt(searchParams.get('limit') || '50');

    // Build query for completed trips
    let query = supabase
      .from('schedules')
      .select(`
        *,
        routes!route_id (
          route_number,
          route_name,
          start_location,
          end_location
        ),
        drivers!driver_id (
          name
        ),
        vehicles!vehicle_id (
          registration_number
        )
      `)
      .eq('status', 'completed')
      .order('completion_date', { ascending: false })
      .limit(limit);

    if (routeId) {
      query = query.eq('route_id', routeId);
    }

    if (startDate) {
      query = query.gte('schedule_date', startDate);
    }

    if (endDate) {
      query = query.lte('schedule_date', endDate);
    }

    const { data: completedTrips, error } = await query;

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch completed trips' },
        { status: 500 }
      );
    }

    // Get passenger information for each completed trip
    const tripsWithPassengers = await Promise.all(
      (completedTrips || []).map(async (trip) => {
        const { data: passengers } = await supabase
          .from('bookings')
          .select(`
            *,
            students (
              student_name,
              roll_number,
              email,
              mobile
            )
          `)
          .eq('schedule_id', trip.id)
          .eq('status', 'completed');

        return {
          ...trip,
          passengers: passengers?.map(booking => ({
            id: booking.id,
            studentName: booking.students?.student_name,
            rollNumber: booking.students?.roll_number,
            email: booking.students?.email,
            mobile: booking.students?.mobile,
            seatNumber: booking.seat_number,
            boardingStop: booking.boarding_stop,
            paymentStatus: booking.payment_status
          })) || []
        };
      })
    );

    return NextResponse.json(tripsWithPassengers);

  } catch (error) {
    console.error('Error fetching completed trips:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 