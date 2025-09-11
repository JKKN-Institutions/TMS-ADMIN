import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  try {
    // Create Supabase client with service role key for admin operations
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
    
    const status = searchParams.get('status') || 'all';
    const route = searchParams.get('route') || '';
    const dateRange = searchParams.get('dateRange') || '30days';

    // Calculate date range
    const today = new Date();
    let startDate = today.toISOString().split('T')[0];
    let endDate = '';
    
    switch (dateRange) {
      case '7days':
        const next7Days = new Date();
        next7Days.setDate(today.getDate() + 7);
        endDate = next7Days.toISOString().split('T')[0];
        break;
      case '30days':
        const next30Days = new Date();
        next30Days.setDate(today.getDate() + 30);
        endDate = next30Days.toISOString().split('T')[0];
        break;
      default:
        // For 'all', we'll get schedules up to 6 months ahead
        const next6Months = new Date();
        next6Months.setMonth(today.getMonth() + 6);
        endDate = next6Months.toISOString().split('T')[0];
    }

    // Build the query
    let query = supabase
      .from('schedules')
      .select(`
        id,
        schedule_date,
        departure_time,
        arrival_time,
        available_seats,
        booked_seats,
        total_seats,
        admin_scheduling_enabled,
        booking_enabled,
        status,
        booking_deadline,
        special_instructions,
        created_at,
        updated_at,
        routes!route_id (
          id,
          route_number,
          route_name,
          start_location,
          end_location
        )
      `)
      .gte('schedule_date', startDate)
      .lte('schedule_date', endDate)
      .order('schedule_date', { ascending: true })
      .order('departure_time', { ascending: true });

    // Apply status filter
    switch (status) {
      case 'pending_approval':
        query = query.eq('admin_scheduling_enabled', false);
        break;
      case 'approved':
        query = query.eq('admin_scheduling_enabled', true).eq('booking_enabled', false);
        break;
      case 'active':
        query = query.eq('admin_scheduling_enabled', true).eq('booking_enabled', true);
        break;
      case 'disabled':
        query = query.eq('admin_scheduling_enabled', false).eq('booking_enabled', false);
        break;
      case 'completed':
        query = query.eq('status', 'completed');
        break;
      // Don't add any filter for 'all' - let all statuses through
    }

    // Apply route filter if specified
    if (route) {
      query = query.eq('route_id', route);
    }

    const { data: schedules, error } = await query;

    if (error) {
      console.error('Error fetching schedules:', error);
      return NextResponse.json({ error: 'Failed to fetch schedules' }, { status: 500 });
    }

    // Transform the data to match the expected format
    const transformedSchedules = schedules?.map(schedule => ({
      id: schedule.id,
      route: {
        id: (schedule.routes as any)?.id || '',
        routeNumber: (schedule.routes as any)?.route_number || '',
        routeName: (schedule.routes as any)?.route_name || '',
        startLocation: (schedule.routes as any)?.start_location || '',
        endLocation: (schedule.routes as any)?.end_location || ''
      },
      scheduleDate: schedule.schedule_date,
      departureTime: schedule.departure_time,
      arrivalTime: schedule.arrival_time,
      availableSeats: schedule.available_seats,
      bookedSeats: schedule.booked_seats || 0,
      totalSeats: schedule.total_seats || schedule.available_seats + (schedule.booked_seats || 0),
      admin_scheduling_enabled: schedule.admin_scheduling_enabled || false,
      booking_enabled: schedule.booking_enabled || false,
      status: schedule.status,
      booking_deadline: schedule.booking_deadline,
      special_instructions: schedule.special_instructions,
      created_at: schedule.created_at,
      updated_at: schedule.updated_at
    })) || [];

    return NextResponse.json(transformedSchedules);

  } catch (error) {
    console.error('Error in enhanced schedule list API:', error);
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
} 