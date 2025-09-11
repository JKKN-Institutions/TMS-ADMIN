import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    // Get activity timeline for the grievance
    const { data: activities, error } = await supabaseAdmin
      .from('grievance_activity_log')
      .select(`
        id,
        activity_type,
        visibility,
        actor_type,
        actor_id,
        actor_name,
        action_description,
        action_details,
        old_values,
        new_values,
        is_milestone,
        created_at
      `)
      .eq('grievance_id', id)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    // Format activities for display
    const formattedActivities = activities.map(activity => ({
      id: activity.id,
      type: activity.activity_type,
      visibility: activity.visibility,
      actor: {
        type: activity.actor_type,
        id: activity.actor_id,
        name: activity.actor_name
      },
      description: activity.action_description,
      details: activity.action_details,
      oldValues: activity.old_values,
      newValues: activity.new_values,
      isMilestone: activity.is_milestone,
      timestamp: activity.created_at
    }));

    return NextResponse.json({
      success: true,
      data: formattedActivities
    });

  } catch (error) {
    console.error('Error fetching grievance activities:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch grievance activities',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// POST - Add a new activity (for manual activity logging)
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();

    const {
      activity_type,
      visibility = 'public',
      actor_type,
      actor_id,
      actor_name,
      action_description,
      action_details,
      old_values,
      new_values,
      is_milestone = false
    } = body;

    // Insert activity log
    const { data: activity, error } = await supabaseAdmin
      .from('grievance_activity_log')
      .insert({
        grievance_id: id,
        activity_type,
        visibility,
        actor_type,
        actor_id,
        actor_name,
        action_description,
        action_details,
        old_values,
        new_values,
        is_milestone
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      data: {
        id: activity.id,
        type: activity.activity_type,
        visibility: activity.visibility,
        actor: {
          type: activity.actor_type,
          id: activity.actor_id,
          name: activity.actor_name
        },
        description: activity.action_description,
        details: activity.action_details,
        oldValues: activity.old_values,
        newValues: activity.new_values,
        isMilestone: activity.is_milestone,
        timestamp: activity.created_at
      }
    });

  } catch (error) {
    console.error('Error adding grievance activity:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to add grievance activity',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 