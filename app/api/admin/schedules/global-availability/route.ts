import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const date = searchParams.get('date');

    if (date) {
      // Get availability for a specific date across all routes
      const { data: routes, error: routesError } = await supabase
        .from('routes')
        .select('id, route_number, route_name, start_location, end_location, total_capacity, fare, departure_time, arrival_time')
        .eq('status', 'active')
        .order('route_number');

      if (routesError) {
        console.error('Error fetching routes:', routesError);
        return NextResponse.json({ error: 'Failed to fetch routes' }, { status: 500 });
      }

      // Get availability data for this date
      const { data: availability, error: availabilityError } = await supabase
        .from('booking_availability')
        .select('*')
        .eq('availability_date', date);

      if (availabilityError) {
        console.error('Error fetching availability:', availabilityError);
        return NextResponse.json({ error: 'Failed to fetch availability' }, { status: 500 });
      }

      // Get current bookings count for each route on this date
      const { data: bookings, error: bookingsError } = await supabase
        .from('bookings')
        .select('route_id, id')
        .eq('trip_date', date)
        .eq('status', 'confirmed');

      if (bookingsError) {
        console.error('Error fetching bookings:', bookingsError);
        return NextResponse.json({ error: 'Failed to fetch bookings' }, { status: 500 });
      }

      // Count bookings per route
      const bookingCounts = bookings?.reduce((acc: any, booking: any) => {
        acc[booking.route_id] = (acc[booking.route_id] || 0) + 1;
        return acc;
      }, {}) || {};

      // Combine routes with their availability data
      const routeAvailabilities = routes?.map((route: any) => {
        const routeAvailability = availability?.find((a: any) => a.route_id === route.id);
        return {
          route_id: route.id,
          route: route,
          is_booking_enabled: routeAvailability?.is_booking_enabled ?? true,
          max_bookings_per_day: routeAvailability?.max_bookings_per_day || null,
          special_instructions: routeAvailability?.special_instructions || null,
          current_bookings: bookingCounts[route.id] || 0
        };
      }) || [];

      return NextResponse.json(routeAvailabilities);
    }

    if (startDate && endDate) {
      // Get availability summary for date range
      const { data: availability, error } = await supabase
        .from('booking_availability')
        .select('*')
        .gte('availability_date', startDate)
        .lte('availability_date', endDate)
        .order('availability_date');

      if (error) {
        console.error('Error fetching availability range:', error);
        return NextResponse.json({ error: 'Failed to fetch availability' }, { status: 500 });
      }

      return NextResponse.json(availability || []);
    }

    return NextResponse.json({ error: 'Date or date range required' }, { status: 400 });
  } catch (error) {
    console.error('Error in global availability API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { date, routes } = body;

    if (!date || !routes || !Array.isArray(routes)) {
      return NextResponse.json({ error: 'Date and routes array are required' }, { status: 400 });
    }

    console.log('Saving availability for date:', date, 'with routes:', routes.length);

    // Bulk upsert availability for all routes on the specific date
    const updates = routes.map((route: any) => ({
      route_id: route.routeId,
      availability_date: date,
      is_booking_enabled: route.isBookingEnabled,
      max_bookings_per_day: route.maxBookingsPerDay,
      special_instructions: route.specialInstructions,
      // created_by: null, // Let database handle this field (it's optional)
      updated_at: new Date().toISOString()
    }));

    console.log('Upserting records:', updates);

    const { data, error } = await supabase
      .from('booking_availability')
      .upsert(updates, { 
        onConflict: 'route_id,availability_date',
        ignoreDuplicates: false 
      })
      .select();

    if (error) {
      console.error('Error bulk updating availability:', error);
      return NextResponse.json({ error: 'Failed to update availability' }, { status: 500 });
    }

    console.log('Successfully saved availability data:', data?.length || 0, 'records');
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in global availability API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 