import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const { startDate, endDate, routeFilter } = await request.json();

    // Base query for schedules with related data
    let query = supabase
      .from('schedules')
      .select(`
        id,
        route_id,
        schedule_date,
        departure_time,
        arrival_time,
        available_seats,
        booked_seats,
        status,
        driver_id,
        vehicle_id,
        booking_enabled,
        admin_scheduling_enabled,
        is_booking_window_open,
        routes!route_id (
          id,
          route_number,
          route_name,
          start_location,
          end_location,
          total_capacity,
          status
        ),
        drivers!driver_id (
          id,
          name
        ),
        vehicles!vehicle_id (
          id,
          registration_number
        )
      `)
      .gte('schedule_date', startDate)
      .lte('schedule_date', endDate)
      .order('schedule_date', { ascending: true })
      .order('departure_time', { ascending: true });

    // Apply route filter if specified
    if (routeFilter && routeFilter !== 'all') {
      query = query.eq('route_id', routeFilter);
    }

    const { data: schedules, error } = await query;

    if (error) {
      console.error('Error fetching schedules:', error);
      return NextResponse.json({ error: 'Failed to fetch schedules' }, { status: 500 });
    }

    // Filter out schedules with inactive routes
    const activeSchedules = schedules?.filter(schedule => 
      schedule.routes && schedule.routes.status === 'active'
    ) || [];

    // Transform data for calendar component with correct calculations
    const formattedSchedules = activeSchedules.map((schedule: any) => {
      const totalCapacity = schedule.routes?.total_capacity || 40; // Default fallback
      const bookedSeats = schedule.booked_seats || 0;
      const availableSeats = Math.max(0, totalCapacity - bookedSeats);
      
      return {
        id: schedule.id,
        routeId: schedule.route_id,
        scheduleDate: schedule.schedule_date,
        departureTime: schedule.departure_time,
        arrivalTime: schedule.arrival_time,
        totalSeats: totalCapacity,
        bookedSeats: bookedSeats,
        availableSeats: availableSeats,
        status: schedule.status,
        bookingEnabled: schedule.booking_enabled !== false,
        adminSchedulingEnabled: schedule.admin_scheduling_enabled !== false,
        isBookingWindowOpen: schedule.is_booking_window_open !== false,
        route: schedule.routes ? {
          id: schedule.routes.id,
          routeNumber: schedule.routes.route_number,
          routeName: schedule.routes.route_name,
          startLocation: schedule.routes.start_location,
          endLocation: schedule.routes.end_location,
          totalCapacity: schedule.routes.total_capacity,
          status: schedule.routes.status
        } : null,
        driver: schedule.drivers ? {
          id: schedule.drivers.id,
          name: schedule.drivers.name
        } : null,
        vehicle: schedule.vehicles ? {
          id: schedule.vehicles.id,
          number: schedule.vehicles.registration_number
        } : null
      };
    });

    return NextResponse.json(formattedSchedules, { status: 200 });
  } catch (error) {
    console.error('Error in global calendar API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const routeFilter = searchParams.get('routeFilter');

    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'Start date and end date are required' }, { status: 400 });
    }

    // Base query for schedules with related data
    let query = supabase
      .from('schedules')
      .select(`
        id,
        route_id,
        schedule_date,
        departure_time,
        arrival_time,
        available_seats,
        booked_seats,
        status,
        driver_id,
        vehicle_id,
        booking_enabled,
        admin_scheduling_enabled,
        is_booking_window_open,
        routes!route_id (
          id,
          route_number,
          route_name,
          start_location,
          end_location,
          total_capacity,
          status
        ),
        drivers!driver_id (
          id,
          name
        ),
        vehicles!vehicle_id (
          id,
          registration_number
        )
      `)
      .gte('schedule_date', startDate)
      .lte('schedule_date', endDate)
      .order('schedule_date', { ascending: true })
      .order('departure_time', { ascending: true });

    // Apply route filter if specified
    if (routeFilter && routeFilter !== 'all') {
      query = query.eq('route_id', routeFilter);
    }

    const { data: schedules, error } = await query;

    if (error) {
      console.error('Error fetching schedules:', error);
      return NextResponse.json({ error: 'Failed to fetch schedules' }, { status: 500 });
    }

    // Filter out schedules with inactive routes
    const activeSchedules = schedules?.filter(schedule => 
      schedule.routes && schedule.routes.status === 'active'
    ) || [];

    // Transform data for calendar component with correct calculations
    const formattedSchedules = activeSchedules.map((schedule: any) => {
      const totalCapacity = schedule.routes?.total_capacity || 40; // Default fallback
      const bookedSeats = schedule.booked_seats || 0;
      const availableSeats = Math.max(0, totalCapacity - bookedSeats);
      
      return {
        id: schedule.id,
        routeId: schedule.route_id,
        scheduleDate: schedule.schedule_date,
        departureTime: schedule.departure_time,
        arrivalTime: schedule.arrival_time,
        totalSeats: totalCapacity,
        bookedSeats: bookedSeats,
        availableSeats: availableSeats,
        status: schedule.status,
        bookingEnabled: schedule.booking_enabled !== false,
        adminSchedulingEnabled: schedule.admin_scheduling_enabled !== false,
        isBookingWindowOpen: schedule.is_booking_window_open !== false,
        route: schedule.routes ? {
          id: schedule.routes.id,
          routeNumber: schedule.routes.route_number,
          routeName: schedule.routes.route_name,
          startLocation: schedule.routes.start_location,
          endLocation: schedule.routes.end_location,
          totalCapacity: schedule.routes.total_capacity,
          status: schedule.routes.status
        } : null,
        driver: schedule.drivers ? {
          id: schedule.drivers.id,
          name: schedule.drivers.name
        } : null,
        vehicle: schedule.vehicles ? {
          id: schedule.vehicles.id,
          number: schedule.vehicles.registration_number
        } : null
      };
    });

    return NextResponse.json(formattedSchedules, { status: 200 });
  } catch (error) {
    console.error('Error in global calendar API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 