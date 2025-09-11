import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  try {
    // Get all active routes
    const { data: routes, error: routesError } = await supabaseAdmin
      .from('routes')
      .select('*')
      .eq('status', 'active')
      .order('route_number');

    if (routesError) {
      throw routesError;
    }

    const routeSummaries = await Promise.all(
      routes.map(async (route: any) => {
        // Get next upcoming trip for this route with proper filtering
        const now = new Date();
        const todayStr = now.getFullYear() + '-' + 
                        String(now.getMonth() + 1).padStart(2, '0') + '-' + 
                        String(now.getDate()).padStart(2, '0');
        
        // Get tomorrow's date as minimum for safer trip selection
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.getFullYear() + '-' + 
                           String(tomorrow.getMonth() + 1).padStart(2, '0') + '-' + 
                           String(tomorrow.getDate()).padStart(2, '0');
        
        const { data: allUpcomingTrips } = await supabaseAdmin
          .from('schedules')
          .select(`
            *,
            admin_scheduling_enabled,
            booking_enabled,
            booking_deadline,
            scheduling_instructions
          `)
          .eq('route_id', route.id)
          .gte('schedule_date', tomorrowStr)  // Start from tomorrow to avoid today's confusion
          .in('status', ['scheduled', 'in_progress'])
          .order('schedule_date', { ascending: true })
          .order('departure_time', { ascending: true });

        // Filter trips to find the most appropriate "next trip"
        let nextTrip = null;
        
        if (allUpcomingTrips && allUpcomingTrips.length > 0) {
          // First, try to find the earliest trip that's approved and open for booking
          nextTrip = allUpcomingTrips.find((trip: any) => 
            trip.admin_scheduling_enabled && 
            trip.booking_enabled &&
            (!trip.booking_deadline || new Date(trip.booking_deadline) > now)
          );
          
          // If no open trips found, get the earliest approved trip
          if (!nextTrip) {
            nextTrip = allUpcomingTrips.find((trip: any) => trip.admin_scheduling_enabled);
          }
          
          // If no approved trips, get the earliest trip (needs approval)
          if (!nextTrip) {
            nextTrip = allUpcomingTrips[0];
          }
        }

        // Get monthly statistics
        const currentMonth = new Date();
        const firstDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
        const lastDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);

        const firstDayStr = firstDayOfMonth.getFullYear() + '-' + 
                          String(firstDayOfMonth.getMonth() + 1).padStart(2, '0') + '-' + 
                          String(firstDayOfMonth.getDate()).padStart(2, '0');
        
        const lastDayStr = lastDayOfMonth.getFullYear() + '-' + 
                         String(lastDayOfMonth.getMonth() + 1).padStart(2, '0') + '-' + 
                         String(lastDayOfMonth.getDate()).padStart(2, '0');

        const { data: monthlySchedules } = await supabaseAdmin
          .from('schedules')
          .select('*')
          .eq('route_id', route.id)
          .gte('schedule_date', firstDayStr)
          .lte('schedule_date', lastDayStr);

        const { data: monthlyBookings } = await supabaseAdmin
          .from('bookings')
          .select('*')
          .eq('route_id', route.id)
          .gte('trip_date', firstDayStr)
          .lte('trip_date', lastDayStr)
          .eq('status', 'confirmed');

        return {
          route: {
            id: route.id,
            routeNumber: route.route_number,
            routeName: route.route_name,
            startLocation: route.start_location,
            endLocation: route.end_location,
            fare: route.fare,
            totalCapacity: route.total_capacity
          },
          nextTrip: nextTrip ? {
            id: nextTrip.id,
            scheduleDate: nextTrip.schedule_date,
            departureTime: nextTrip.departure_time,
            arrivalTime: nextTrip.arrival_time,
            availableSeats: nextTrip.available_seats,
            bookedSeats: nextTrip.booked_seats,
            status: nextTrip.status,
            admin_scheduling_enabled: nextTrip.admin_scheduling_enabled || false,
            booking_enabled: nextTrip.booking_enabled || false,
            booking_deadline: nextTrip.booking_deadline || null,
            scheduling_instructions: nextTrip.scheduling_instructions || null
          } : null,
          totalSchedulesThisMonth: monthlySchedules?.length || 0,
          totalBookingsThisMonth: monthlyBookings?.length || 0
        };
      })
    );

    // Sort routes by booking activity (routes with bookings first)
    const sortedSummaries = routeSummaries.sort((a, b) => {
      // Routes with next trips first
      if (a.nextTrip && !b.nextTrip) return -1;
      if (!a.nextTrip && b.nextTrip) return 1;
      
      // Routes with more bookings first
      if (a.totalBookingsThisMonth !== b.totalBookingsThisMonth) {
        return b.totalBookingsThisMonth - a.totalBookingsThisMonth;
      }
      
      // Routes with more schedules first
      if (a.totalSchedulesThisMonth !== b.totalSchedulesThisMonth) {
        return b.totalSchedulesThisMonth - a.totalSchedulesThisMonth;
      }
      
      // Finally sort by route number
      return a.route.routeNumber.localeCompare(b.route.routeNumber);
    });

    return NextResponse.json(sortedSummaries);
  } catch (error) {
    console.error('Error fetching route summaries:', error);
    return NextResponse.json(
      { error: 'Failed to fetch route summaries' },
      { status: 500 }
    );
  }
} 