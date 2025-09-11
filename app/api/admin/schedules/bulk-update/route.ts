import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
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
    const body = await request.json();
    const { schedule_ids, updates } = body;

    // Validate input
    if (!Array.isArray(schedule_ids) || schedule_ids.length === 0) {
      return NextResponse.json(
        { error: 'schedule_ids must be a non-empty array' },
        { status: 400 }
      );
    }

    if (!updates || typeof updates !== 'object') {
      return NextResponse.json(
        { error: 'updates must be an object' },
        { status: 400 }
      );
    }

    console.log('Bulk updating schedules:', { schedule_ids, updates });

    // Prepare the update object with timestamp
    const updateData = {
      ...updates,
      updated_at: new Date().toISOString()
    };

    // Remove any undefined values
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });

    // Perform the bulk update
    const { data, error } = await supabase
      .from('schedules')
      .update(updateData)
      .in('id', schedule_ids)
      .select('id, admin_scheduling_enabled, booking_enabled, schedule_date');

    if (error) {
      console.error('Error updating schedules:', error);
      return NextResponse.json(
        { error: 'Failed to update schedules: ' + error.message },
        { status: 500 }
      );
    }

    console.log('Successfully updated schedules:', data);

    // Log the bulk operation for audit trail
    const auditLog = {
      action: 'bulk_schedule_update',
      schedule_ids,
      updates: updateData,
      updated_count: data?.length || 0,
      timestamp: new Date().toISOString()
    };

    // Optionally store audit log (if you have an audit table)
    // await supabase.from('audit_logs').insert(auditLog);

    return NextResponse.json({
      success: true,
      updated_count: data?.length || 0,
      updated_schedules: data,
      message: `Successfully updated ${data?.length || 0} schedules`
    });

  } catch (error) {
    console.error('Error in bulk update API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 