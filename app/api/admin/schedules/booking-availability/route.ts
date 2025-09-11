import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const routeId = searchParams.get('routeId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!routeId) {
      return NextResponse.json({ error: 'Route ID is required' }, { status: 400 });
    }

    let query = supabase
      .from('booking_availability')
      .select('*')
      .eq('route_id', routeId)
      .order('availability_date', { ascending: true });

    if (startDate) {
      query = query.gte('availability_date', startDate);
    }

    if (endDate) {
      query = query.lte('availability_date', endDate);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching booking availability:', error);
      return NextResponse.json({ error: 'Failed to fetch booking availability' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in booking availability API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { routeId, availabilityDate, isBookingEnabled, maxBookingsPerDay, specialInstructions } = body;

    if (!routeId || !availabilityDate) {
      return NextResponse.json({ error: 'Route ID and date are required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('booking_availability')
      .upsert({
        route_id: routeId,
        availability_date: availabilityDate,
        is_booking_enabled: isBookingEnabled,
        max_bookings_per_day: maxBookingsPerDay,
        special_instructions: specialInstructions,
        updated_at: new Date().toISOString()
      })
      .select();

    if (error) {
      console.error('Error updating booking availability:', error);
      return NextResponse.json({ error: 'Failed to update booking availability' }, { status: 500 });
    }

    return NextResponse.json(data[0]);
  } catch (error) {
    console.error('Error in booking availability API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { routeId, dates, isBookingEnabled, maxBookingsPerDay, specialInstructions } = body;

    if (!routeId || !dates || !Array.isArray(dates)) {
      return NextResponse.json({ error: 'Route ID and dates array are required' }, { status: 400 });
    }

    // Bulk update multiple dates
    const updates = dates.map(date => ({
      route_id: routeId,
      availability_date: date,
      is_booking_enabled: isBookingEnabled,
      max_bookings_per_day: maxBookingsPerDay,
      special_instructions: specialInstructions,
      updated_at: new Date().toISOString()
    }));

    const { data, error } = await supabase
      .from('booking_availability')
      .upsert(updates)
      .select();

    if (error) {
      console.error('Error bulk updating booking availability:', error);
      return NextResponse.json({ error: 'Failed to update booking availability' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in booking availability API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 