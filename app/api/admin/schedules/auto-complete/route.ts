import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * AUTO-COMPLETE TRIPS API
 * 
 * This endpoint automatically marks trips as completed when their scheduled date has passed.
 * It can be used for:
 * 1. Manual completion - call POST to this endpoint manually
 * 2. Scheduled completion - set up a cron job to call this endpoint regularly
 * 
 * To set up automatic completion:
 * - Call this endpoint daily via cron job or scheduled task
 * - Or integrate with a serverless function scheduler (Vercel Cron, etc.)
 * - Or use a monitoring service to ping this endpoint regularly
 * 
 * Example cron job (daily at 2 AM):
 * 0 2 * * * curl -X POST https://your-domain.com/api/admin/schedules/auto-complete
 */
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
    
    // Get yesterday's date (trips that should be completed)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    // Find all schedules that should be completed
    // (scheduled status, date is yesterday or earlier)
    const { data: eligibleSchedules, error: schedulesError } = await supabase
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
      .in('status', ['scheduled', 'in_progress'])
      .lte('schedule_date', yesterdayStr);

    if (schedulesError) {
      return NextResponse.json(
        { error: 'Failed to fetch eligible schedules' },
        { status: 500 }
      );
    }

    if (!eligibleSchedules || eligibleSchedules.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No trips found that require completion',
        completedTrips: []
      });
    }

    const completedTrips = [];
    const errors = [];

    // Process each eligible schedule
    for (const schedule of eligibleSchedules) {
      try {
        // Get bookings for this schedule
        const { data: bookings } = await supabase
          .from('bookings')
          .select(`
            *,
            students (
              student_name,
              roll_number
            )
          `)
          .eq('schedule_id', schedule.id)
          .eq('status', 'confirmed');

        // Update schedule status to completed
        const { error: updateError } = await supabase
          .from('schedules')
          .update({
            status: 'completed',
            completion_date: new Date().toISOString(),
            completion_notes: 'Auto-completed by system',
            updated_at: new Date().toISOString()
          })
          .eq('id', schedule.id);

        if (updateError) {
          errors.push({
            scheduleId: schedule.id,
            error: `Failed to update schedule: ${updateError.message}`
          });
          continue;
        }

        // Update bookings to completed
        if (bookings && bookings.length > 0) {
          await supabase
            .from('bookings')
            .update({
              status: 'completed',
              completion_date: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('schedule_id', schedule.id)
            .eq('status', 'confirmed');
        }

        // Create completion record
        await supabase
          .from('trip_completions')
          .insert({
            schedule_id: schedule.id,
            route_id: schedule.route_id,
            completion_date: new Date().toISOString(),
            passenger_count: bookings?.length || 0,
            completion_notes: 'Auto-completed by system',
            created_at: new Date().toISOString()
          });

        completedTrips.push({
          scheduleId: schedule.id,
          routeName: schedule.routes?.route_name,
          routeNumber: schedule.routes?.route_number,
          scheduleDate: schedule.schedule_date,
          passengerCount: bookings?.length || 0
        });

      } catch (error) {
        errors.push({
          scheduleId: schedule.id,
          error: `Processing error: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Auto-completion process finished. Completed ${completedTrips.length} trips.`,
      completedTrips,
      errors: errors.length > 0 ? errors : undefined,
      summary: {
        processed: eligibleSchedules.length,
        completed: completedTrips.length,
        failed: errors.length
      }
    });

  } catch (error) {
    console.error('Error in auto-complete process:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET - Check which trips are eligible for auto-completion
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
    
    // Get yesterday's date
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    // Find all schedules that are eligible for completion
    const { data: eligibleSchedules, error } = await supabase
      .from('schedules')
      .select(`
        id,
        schedule_date,
        status,
        routes!route_id (
          route_number,
          route_name
        )
      `)
      .in('status', ['scheduled', 'in_progress'])
      .lte('schedule_date', yesterdayStr)
      .order('schedule_date');

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch eligible schedules' },
        { status: 500 }
      );
    }

    // Get booking counts for each eligible schedule
    const schedulesWithCounts = await Promise.all(
      (eligibleSchedules || []).map(async (schedule) => {
        const { data: bookings } = await supabase
          .from('bookings')
          .select('id')
          .eq('schedule_id', schedule.id)
          .eq('status', 'confirmed');

        return {
          ...schedule,
          passengerCount: bookings?.length || 0
        };
      })
    );

    return NextResponse.json({
      eligibleSchedules: schedulesWithCounts,
      count: schedulesWithCounts.length,
      cutoffDate: yesterdayStr
    });

  } catch (error) {
    console.error('Error checking eligible trips:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 