import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const { scheduleId, action, reason } = await request.json();

    if (!scheduleId || !action) {
      return NextResponse.json({ error: 'Schedule ID and action are required' }, { status: 400 });
    }

    if (!['enable', 'disable'].includes(action)) {
      return NextResponse.json({ error: 'Action must be either "enable" or "disable"' }, { status: 400 });
    }

    // Get schedule details first
    const { data: schedule, error: scheduleError } = await supabase
      .from('schedules')
      .select(`
        id,
        schedule_date,
        departure_time,
        booking_enabled,
        routes:route_id (route_number, route_name)
      `)
      .eq('id', scheduleId)
      .single();

    if (scheduleError || !schedule) {
      return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
    }

    const shouldEnable = action === 'enable';
    
    // Get existing bookings if disabling
    let affectedBookings = [];
    if (action === 'disable') {
      const { data: bookings } = await supabase
        .from('bookings')
        .select(`
          id,
          student_id,
          status,
          students:student_id (student_name, email)
        `)
        .eq('schedule_id', scheduleId)
        .in('status', ['confirmed', 'pending']);

      affectedBookings = bookings || [];
    }

    // Update the schedule
    const { error: updateError } = await supabase
      .from('schedules')
      .update({ 
        booking_enabled: shouldEnable,
        updated_at: new Date().toISOString()
      })
      .eq('id', scheduleId);

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update schedule' }, { status: 500 });
    }

    // Handle booking cancellations if disabling
    if (action === 'disable' && affectedBookings.length > 0) {
      // Cancel existing bookings
      await supabase
        .from('bookings')
        .update({ 
          status: 'cancelled',
          cancellation_reason: `Schedule disabled: ${reason || 'Administrative decision'}`,
          updated_at: new Date().toISOString()
        })
        .eq('schedule_id', scheduleId)
        .in('status', ['confirmed', 'pending']);

      // Create notifications for affected students
      const notifications = affectedBookings.map(booking => ({
        title: 'Schedule Cancelled',
        message: `Your booking for Route ${schedule.routes?.route_number} on ${new Date(schedule.schedule_date).toLocaleDateString()} has been cancelled.`,
        type: 'alert',
        category: 'transport',
        target_audience: 'individual',
        target_student_id: booking.student_id,
        is_active: true,
        created_at: new Date().toISOString()
      }));

      if (notifications.length > 0) {
        await supabase.from('notifications').insert(notifications);
      }
    }

    let message = `Schedule ${action}d successfully`;
    if (action === 'disable' && affectedBookings.length > 0) {
      message += `. ${affectedBookings.length} booking${affectedBookings.length !== 1 ? 's' : ''} cancelled.`;
    }

    return NextResponse.json({
      success: true,
      message,
      affected_bookings: affectedBookings.length
    }, { status: 200 });

  } catch (error) {
    console.error('Error in toggle-status API:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
} 