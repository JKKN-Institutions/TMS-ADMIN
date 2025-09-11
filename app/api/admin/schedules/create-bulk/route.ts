import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('Create bulk schedules request body:', JSON.stringify(body, null, 2));
    
    const { schedules } = body;

    if (!schedules || !Array.isArray(schedules) || schedules.length === 0) {
      console.log('Invalid schedules array:', schedules);
      return NextResponse.json({ error: 'Schedules array is required' }, { status: 400 });
    }

    // Validate each schedule
    for (let i = 0; i < schedules.length; i++) {
      const schedule = schedules[i];
      console.log(`Validating schedule ${i}:`, JSON.stringify(schedule, null, 2));
      
      if (!schedule.routeId || !schedule.scheduleDate || !schedule.departureTime || !schedule.arrivalTime) {
        console.log(`Validation failed for schedule ${i}:`, {
          routeId: schedule.routeId,
          scheduleDate: schedule.scheduleDate,
          departureTime: schedule.departureTime,
          arrivalTime: schedule.arrivalTime
        });
        return NextResponse.json({ 
          error: `Missing required fields in schedule ${i + 1}: routeId, scheduleDate, departureTime, arrivalTime` 
        }, { status: 400 });
      }
      
      if (!schedule.availableSeats || schedule.availableSeats <= 0) {
        console.log(`Invalid availableSeats for schedule ${i}:`, schedule.availableSeats);
        return NextResponse.json({ 
          error: `Invalid availableSeats for schedule ${i + 1}: must be greater than 0` 
        }, { status: 400 });
      }
    }

    // Check for existing schedules on the same date for the same routes
    const existingSchedules = await supabase
      .from('schedules')
      .select('route_id, schedule_date')
      .in('route_id', schedules.map(s => s.routeId))
      .in('schedule_date', schedules.map(s => s.scheduleDate));

    if (existingSchedules.error) {
      console.error('Error checking existing schedules:', existingSchedules.error);
      return NextResponse.json({ error: 'Failed to check existing schedules' }, { status: 500 });
    }

    if (existingSchedules.data && existingSchedules.data.length > 0) {
      const conflicts = existingSchedules.data.map(existing => 
        `Route ${existing.route_id} on ${existing.schedule_date}`
      ).join(', ');
      
      console.log('Schedule conflicts found:', conflicts);
      return NextResponse.json({ 
        error: `Schedules already exist for: ${conflicts}` 
      }, { status: 409 });
    }

    // Transform schedules for database insertion
    const schedulesToInsert = schedules.map(schedule => ({
      route_id: schedule.routeId,
      schedule_date: schedule.scheduleDate,
      departure_time: schedule.departureTime,
      arrival_time: schedule.arrivalTime,
      available_seats: schedule.availableSeats,
      booked_seats: 0,
      status: schedule.status || 'scheduled',
      driver_id: schedule.driverId || null,
      vehicle_id: schedule.vehicleId || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));

    console.log('Inserting schedules:', JSON.stringify(schedulesToInsert, null, 2));

    // Insert schedules
    const { data: insertedSchedules, error: insertError } = await supabase
      .from('schedules')
      .insert(schedulesToInsert)
      .select();

    if (insertError) {
      console.error('Error inserting schedules:', insertError);
      return NextResponse.json({ error: 'Failed to create schedules: ' + insertError.message }, { status: 500 });
    }

    console.log('Successfully inserted schedules:', insertedSchedules?.length);

    // Get route information for notification
    const routeIds = schedules.map(s => s.routeId);
    const { data: routes } = await supabase
      .from('routes')
      .select('id, route_number, route_name')
      .in('id', routeIds);

    // Create notification about new schedules
    const routeNames = routes?.map(r => `${r.route_number} - ${r.route_name}`).join(', ') || 'Multiple routes';
    const scheduleDate = schedules[0].scheduleDate;
    
    await supabase
      .from('notifications')
      .insert({
        title: 'New Schedules Available',
        message: `New schedules are now available for ${routeNames} on ${new Date(scheduleDate).toLocaleDateString()}. Book your seats now!`,
        type: 'info',
        category: 'transport',
        target_audience: 'students',
        is_active: true,
        enable_push_notification: true,
        enable_email_notification: true,
        tags: ['schedules', 'booking', 'transport'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    return NextResponse.json({ 
      success: true, 
      created: insertedSchedules?.length || 0,
      schedules: insertedSchedules 
    }, { status: 201 });

  } catch (error) {
    console.error('Error in create-bulk schedules API:', error);
    return NextResponse.json({ error: 'Internal server error: ' + (error as Error).message }, { status: 500 });
  }
} 