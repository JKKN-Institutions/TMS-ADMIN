import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const { routeId, startDate, endDate } = await request.json();

    if (!routeId || !startDate || !endDate) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // Get all schedules for the route within the date range
    const { data: schedules, error } = await supabaseAdmin
      .from('schedules')
      .select('*')
      .eq('route_id', routeId)
      .gte('schedule_date', startDate)
      .lte('schedule_date', endDate)
      .order('schedule_date')
      .order('departure_time');

    if (error) {
      throw error;
    }

    return NextResponse.json(schedules || []);
  } catch (error) {
    console.error('Error fetching route calendar data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch route calendar data' },
      { status: 500 }
    );
  }
} 