import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../../../lib/supabase';

// GET - Get booking controls for a specific schedule
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const scheduleId = searchParams.get('schedule_id');
    const routeId = searchParams.get('route_id');
    const date = searchParams.get('date');

    if (!scheduleId && (!routeId || !date)) {
      return NextResponse.json(
        { error: 'Either schedule_id or both route_id and date are required' },
        { status: 400 }
      );
    }

    let query = supabase
      .from('schedules')
      .select(`
        *,
        routes:route_id (
          route_name,
          route_number,
          status
        )
      `);

    if (scheduleId) {
      query = query.eq('id', scheduleId);
    } else {
      query = query.eq('route_id', routeId).eq('schedule_date', date);
    }

    const { data, error } = await query.single();

    if (error) {
      console.error('Error fetching schedule:', error);
      return NextResponse.json(
        { error: 'Failed to fetch schedule' },
        { status: 500 }
      );
    }

    // Get booking availability settings
    const { data: availabilityData } = await supabase
      .from('booking_availability')
      .select('*')
      .eq('route_id', data.route_id)
      .eq('availability_date', data.schedule_date)
      .single();

    const result = {
      ...data,
      booking_availability: availabilityData || null,
      booking_window: {
        start_time: availabilityData?.booking_start_time || '06:00:00',
        end_time: availabilityData?.cutoff_time || '19:00:00',
        booking_date: new Date(new Date(data.schedule_date).getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      }
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in GET /api/admin/schedules/booking-controls:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT - Update booking controls for a specific schedule
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      schedule_id,
      admin_scheduling_enabled,
      booking_enabled,
      scheduling_instructions,
      booking_end_time = '19:00:00'
    } = body;

    if (!schedule_id) {
      return NextResponse.json(
        { error: 'Schedule ID is required' },
        { status: 400 }
      );
    }

    // Get the schedule first to get route_id and schedule_date
    const { data: schedule, error: scheduleError } = await supabase
      .from('schedules')
      .select('route_id, schedule_date')
      .eq('id', schedule_id)
      .single();

    if (scheduleError || !schedule) {
      return NextResponse.json(
        { error: 'Schedule not found' },
        { status: 404 }
      );
    }

    // Check if schedule date is in the past or today
    const today = new Date();
    const todayStr = today.getFullYear() + '-' + 
                    String(today.getMonth() + 1).padStart(2, '0') + '-' + 
                    String(today.getDate()).padStart(2, '0');
    
    const scheduleDate = new Date(schedule.schedule_date);
    const scheduleDateStr = schedule.schedule_date;

    if (scheduleDateStr <= todayStr) {
      return NextResponse.json(
        { error: 'Cannot enable booking controls for past dates or today. Only future dates are allowed.' },
        { status: 400 }
      );
    }

    // Only allow enabling, not disabling for future dates
    if (admin_scheduling_enabled && scheduleDateStr <= todayStr) {
      return NextResponse.json(
        { error: 'Cannot enable scheduling for past dates or today. Passengers must book at least one day in advance.' },
        { status: 400 }
      );
    }

    // Calculate booking deadline (7 PM the day before by default)
    const bookingDate = new Date(scheduleDate.getTime() - 24 * 60 * 60 * 1000);
    const booking_deadline = `${bookingDate.toISOString().split('T')[0]} ${booking_end_time}`;

    // Check if booking deadline is in the past
    if (admin_scheduling_enabled && new Date(booking_deadline) <= new Date()) {
      return NextResponse.json(
        { error: 'Booking deadline has already passed. Cannot enable booking for this schedule.' },
        { status: 400 }
      );
    }

    // Update the schedule
    const { error: updateError } = await supabase
      .from('schedules')
      .update({
        admin_scheduling_enabled,
        booking_enabled: booking_enabled && admin_scheduling_enabled,
        scheduling_instructions,
        booking_deadline,
        is_booking_window_open: new Date() <= new Date(booking_deadline),
        updated_at: new Date().toISOString()
      })
      .eq('id', schedule_id);

    if (updateError) {
      console.error('Error updating schedule:', updateError);
      return NextResponse.json(
        { error: 'Failed to update schedule' },
        { status: 500 }
      );
    }

    // Update or create booking availability record
    const { error: upsertError } = await supabase
      .from('booking_availability')
      .upsert({
        route_id: schedule.route_id,
        availability_date: schedule.schedule_date,
        admin_enabled: admin_scheduling_enabled,
        is_booking_enabled: booking_enabled && admin_scheduling_enabled,
        booking_start_time: '06:00:00', // Default booking start time
        cutoff_time: booking_end_time,
        requires_admin_approval: true,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'route_id,availability_date'
      });

    if (upsertError) {
      console.error('Error updating booking availability:', upsertError);
      return NextResponse.json(
        { error: 'Failed to update booking availability' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'Booking controls updated successfully',
      schedule_id,
      admin_scheduling_enabled,
      booking_enabled: booking_enabled && admin_scheduling_enabled,
      booking_deadline
    });
  } catch (error) {
    console.error('Error in PUT /api/admin/schedules/booking-controls:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Bulk update booking controls for multiple schedules
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      route_id,
      date_range: { start_date, end_date },
      admin_scheduling_enabled,
      booking_enabled,
      scheduling_instructions,
      booking_end_time = '19:00:00'
    } = body;

    if (!route_id || !start_date || !end_date) {
      return NextResponse.json(
        { error: 'Route ID and date range are required' },
        { status: 400 }
      );
    }

    // Check if date range includes past dates or today
    const today = new Date();
    const todayStr = today.getFullYear() + '-' + 
                    String(today.getMonth() + 1).padStart(2, '0') + '-' + 
                    String(today.getDate()).padStart(2, '0');

    if (admin_scheduling_enabled && (start_date <= todayStr || end_date <= todayStr)) {
      return NextResponse.json(
        { error: 'Cannot enable booking controls for past dates or today. Only future dates are allowed.' },
        { status: 400 }
      );
    }

    // Get all schedules in the date range
    const { data: schedules, error: schedulesError } = await supabase
      .from('schedules')
      .select('id, schedule_date')
      .eq('route_id', route_id)
      .gte('schedule_date', start_date)
      .lte('schedule_date', end_date);

    if (schedulesError) {
      console.error('Error fetching schedules:', schedulesError);
      return NextResponse.json(
        { error: 'Failed to fetch schedules' },
        { status: 500 }
      );
    }

    if (!schedules || schedules.length === 0) {
      return NextResponse.json(
        { error: 'No schedules found in the specified date range' },
        { status: 404 }
      );
    }

    // Filter out past dates and today if trying to enable
    const validSchedules = schedules.filter(schedule => {
      if (admin_scheduling_enabled && schedule.schedule_date <= todayStr) {
        return false; // Skip past dates and today when enabling
      }
      return true;
    });

    if (admin_scheduling_enabled && validSchedules.length === 0) {
      return NextResponse.json(
        { error: 'No future schedules found in the specified date range. Cannot enable booking for past dates or today.' },
        { status: 400 }
      );
    }

    // Check if any booking deadlines would be in the past
    const invalidSchedules = validSchedules.filter(schedule => {
      if (admin_scheduling_enabled) {
        const scheduleDate = new Date(schedule.schedule_date);
        const bookingDate = new Date(scheduleDate.getTime() - 24 * 60 * 60 * 1000);
        const booking_deadline = `${bookingDate.toISOString().split('T')[0]} ${booking_end_time}`;
        return new Date(booking_deadline) <= new Date();
      }
      return false;
    });

    if (invalidSchedules.length > 0) {
      return NextResponse.json(
        { error: `Cannot enable booking for ${invalidSchedules.length} schedule(s) as their booking deadlines have already passed.` },
        { status: 400 }
      );
    }

    // Update all valid schedules
    const scheduleUpdates = validSchedules.map(schedule => {
      const scheduleDate = new Date(schedule.schedule_date);
      const bookingDate = new Date(scheduleDate.getTime() - 24 * 60 * 60 * 1000);
      const booking_deadline = `${bookingDate.toISOString().split('T')[0]} ${booking_end_time}`;

      return {
        id: schedule.id,
        admin_scheduling_enabled,
        booking_enabled: booking_enabled && admin_scheduling_enabled,
        scheduling_instructions,
        booking_deadline,
        is_booking_window_open: new Date() <= new Date(booking_deadline),
        updated_at: new Date().toISOString()
      };
    });

    const { error: updateError } = await supabase
      .from('schedules')
      .upsert(scheduleUpdates);

    if (updateError) {
      console.error('Error bulk updating schedules:', updateError);
      return NextResponse.json(
        { error: 'Failed to update schedules' },
        { status: 500 }
      );
    }

    // Create booking availability records for each valid date
    const availabilityRecords = validSchedules.map(schedule => ({
      route_id,
      availability_date: schedule.schedule_date,
      admin_enabled: admin_scheduling_enabled,
      is_booking_enabled: booking_enabled && admin_scheduling_enabled,
      booking_start_time: '06:00:00', // Default booking start time
      cutoff_time: booking_end_time,
      requires_admin_approval: true,
      updated_at: new Date().toISOString()
    }));

    const { error: availabilityError } = await supabase
      .from('booking_availability')
      .upsert(availabilityRecords, {
        onConflict: 'route_id,availability_date'
      });

    if (availabilityError) {
      console.error('Error bulk updating booking availability:', availabilityError);
      return NextResponse.json(
        { error: 'Failed to update booking availability' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'Booking controls updated successfully',
      updated_schedules: validSchedules.length,
      skipped_schedules: schedules.length - validSchedules.length,
      route_id,
      admin_scheduling_enabled,
      booking_enabled: booking_enabled && admin_scheduling_enabled
    });
  } catch (error) {
    console.error('Error in POST /api/admin/schedules/booking-controls:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 