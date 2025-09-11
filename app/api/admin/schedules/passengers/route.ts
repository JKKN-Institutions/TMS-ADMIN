import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const { routeId, date } = await request.json();

    if (!routeId || !date) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // Get all bookings for the route on the specified date with passenger details
    const { data: bookings, error } = await supabaseAdmin
      .from('bookings')
      .select(`
        *,
        student:students(
          student_name,
          roll_number,
          email,
          mobile
        ),
        schedule:schedules(
          departure_time,
          arrival_time
        )
      `)
      .eq('route_id', routeId)
      .eq('trip_date', date)
      .eq('status', 'confirmed')
      .order('boarding_stop')
      .order('seat_number');

    if (error) {
      throw error;
    }

    // Transform the data to match the expected format
    const passengers = (bookings || []).map((booking: any) => ({
      id: booking.id,
      studentName: booking.student?.student_name || 'Unknown',
      rollNumber: booking.student?.roll_number || 'N/A',
      email: booking.student?.email || 'N/A',
      mobile: booking.student?.mobile || 'N/A',
      seatNumber: booking.seat_number || 'TBD',
      boardingStop: booking.boarding_stop || 'N/A',
      paymentStatus: booking.payment_status || 'pending',
      bookingDate: booking.created_at,
      scheduleTime: booking.schedule?.departure_time 
        ? `${booking.schedule.departure_time} - ${booking.schedule.arrival_time}`
        : 'N/A'
    }));

    return NextResponse.json(passengers);
  } catch (error) {
    console.error('Error fetching passengers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch passengers' },
      { status: 500 }
    );
  }
} 