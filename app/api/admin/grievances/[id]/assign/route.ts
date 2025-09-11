import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// POST - Assign grievance to admin user
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params; // Fix Next.js 15 issue by awaiting params
    const body = await request.json();
    
    console.log('🔧 Assignment API - Starting assignment process');
    console.log('📋 Grievance ID:', id);
    console.log('📦 Request body:', body);
    
    const { 
      assigned_to, 
      assigned_by, 
      assignment_reason, 
      priority, 
      notes,
      expected_resolution_date 
    } = body;
    
    console.log('✅ Extracted assignment data:', {
      assigned_to,
      assigned_by,
      assignment_reason,
      priority,
      notes,
      expected_resolution_date
    });
    
    if (!assigned_to) {
      console.error('❌ Missing assigned_to field');
      return NextResponse.json({ error: 'assigned_to is required' }, { status: 400 });
    }
    
    // Verify the admin user exists
    console.log('🔍 Verifying admin user exists...');
    const { data: adminUser, error: adminError } = await supabaseAdmin
      .from('admin_users')
      .select('id, name, email, role')
      .eq('id', assigned_to)
      .single();
    
    if (adminError || !adminUser) {
      console.error('❌ Admin user not found:', adminError);
      return NextResponse.json({ error: 'Admin user not found' }, { status: 404 });
    }
    
    console.log('✅ Admin user found:', adminUser);
    
    // Get current grievance data
    console.log('🔍 Fetching current grievance data...');
    const { data: currentGrievance, error: grievanceError } = await supabaseAdmin
      .from('grievances')
      .select('*')
      .eq('id', id)
      .single();
    
    if (grievanceError || !currentGrievance) {
      console.error('❌ Grievance not found:', grievanceError);
      return NextResponse.json({ error: 'Grievance not found' }, { status: 404 });
    }
    
    console.log('✅ Current grievance data:', currentGrievance);
    
    // Prepare updates
    const updates: any = {
      assigned_to,
      status: currentGrievance.status === 'open' ? 'in_progress' : currentGrievance.status,
      updated_at: new Date().toISOString()
    };
    
    // Update priority if provided
    if (priority) {
      updates.priority = priority;
    }
    
    // Update expected resolution date if provided
    if (expected_resolution_date) {
      updates.expected_resolution_date = expected_resolution_date;
    }
    
    console.log('🔄 Updating grievance with:', updates);
    
    // Update grievance with new assignment
    const { data: updatedGrievance, error: updateError } = await supabaseAdmin
      .from('grievances')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    
    if (updateError) {
      console.error('❌ Error updating grievance:', updateError);
      return NextResponse.json({ error: 'Failed to update grievance', details: updateError }, { status: 500 });
    }
    
    console.log('✅ Grievance updated successfully:', updatedGrievance);
    
    // Try to log the assignment activity (but don't fail if it doesn't work)
    let activityLogged = false;
    try {
      const { data: activityId, error: activityError } = await supabaseAdmin
        .rpc('log_grievance_activity', {
          p_grievance_id: id,
          p_activity_type: 'grievance_assigned',
          p_visibility: 'public',
          p_actor_type: 'admin',
          p_actor_id: assigned_to,
          p_actor_name: adminUser.name,
          p_action_description: `Grievance assigned to ${adminUser.name} (${adminUser.role})`,
          p_action_details: {
            assigned_to: assigned_to,
            assigned_to_name: adminUser.name,
            assigned_to_role: adminUser.role,
            assigned_by: assigned_by,
            assignment_reason: assignment_reason || 'Manual assignment',
            priority: priority || currentGrievance.priority,
            notes: notes,
            expected_resolution_date: expected_resolution_date,
            timestamp: new Date().toISOString()
          },
          p_old_values: {
            assigned_to: currentGrievance.assigned_to,
            status: currentGrievance.status,
            priority: currentGrievance.priority
          },
          p_new_values: {
            assigned_to: assigned_to,
            status: updates.status,
            priority: updates.priority || currentGrievance.priority
          },
          p_is_milestone: true
        });
      
      if (activityError) {
        console.warn('⚠️ Activity logging failed, but assignment succeeded:', activityError);
      } else {
        console.log('✅ Activity logged successfully:', activityId);
        activityLogged = true;
      }
    } catch (error) {
      console.warn('⚠️ Activity logging failed, but assignment succeeded:', error);
    }
    
    // Try to create assignment history record (but don't fail if it doesn't work)
    let historyLogged = false;
    try {
      const { error: historyError } = await supabaseAdmin
        .from('grievance_assignment_history')
        .insert({
          grievance_id: id,
          assigned_by: assigned_by || 'unknown',
          assigned_to,
          assignment_reason: assignment_reason || 'Manual assignment',
          assignment_type: 'manual',
          priority_level: priority || currentGrievance.priority,
          expected_resolution_date,
          assignment_notes: notes,
          is_active: true
        });
      
      if (historyError) {
        console.warn('⚠️ Assignment history logging failed, but assignment succeeded:', historyError);
      } else {
        console.log('✅ Assignment history logged successfully');
        historyLogged = true;
      }
    } catch (error) {
      console.warn('⚠️ Assignment history logging failed, but assignment succeeded:', error);
    }
    
    console.log('🎉 Assignment completed successfully!');
    
    return NextResponse.json({
      success: true,
      grievance: updatedGrievance,
      assignment: {
        assigned_to,
        assigned_to_name: adminUser.name,
        assigned_to_role: adminUser.role,
        assignment_reason: assignment_reason || 'Manual assignment',
        priority: priority || currentGrievance.priority,
        notes,
        expected_resolution_date,
        assigned_at: new Date().toISOString()
      },
      activity_logged: activityLogged,
      history_logged: historyLogged
    });
    
  } catch (error) {
    console.error('❌ Error in POST /api/admin/grievances/[id]/assign:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Unassign grievance
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params; // Fix Next.js 15 issue by awaiting params
    const body = await request.json();
    const { unassigned_by, unassignment_reason } = body;
    
    // Get current grievance data
    const { data: currentGrievance, error: grievanceError } = await supabaseAdmin
      .from('grievances')
      .select(`
        *,
        admin_users!assigned_to (
          id,
          name,
          email,
          role
        )
      `)
      .eq('id', id)
      .single();
    
    if (grievanceError || !currentGrievance) {
      return NextResponse.json({ error: 'Grievance not found' }, { status: 404 });
    }
    
    if (!currentGrievance.assigned_to) {
      return NextResponse.json({ error: 'Grievance is not assigned to anyone' }, { status: 400 });
    }
    
    const previouslyAssignedAdmin = currentGrievance.admin_users;
    
    // Update grievance to remove assignment
    const { data: updatedGrievance, error: updateError } = await supabaseAdmin
      .from('grievances')
      .update({
        assigned_to: null,
        status: 'open',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select(`
        *,
        students (
          id,
          student_name,
          roll_number,
          email,
          mobile
        ),
        routes (
          id,
          route_name,
          route_number
        )
      `)
      .single();
    
    if (updateError) {
      console.error('Error updating grievance:', updateError);
      return NextResponse.json({ error: 'Failed to update grievance' }, { status: 500 });
    }
    
    // Try to log the unassignment activity (but don't fail if it doesn't work)
    let activityLogged = false;
    try {
      const { error: activityError } = await supabaseAdmin
        .rpc('log_grievance_activity', {
          p_grievance_id: id,
          p_activity_type: 'grievance_unassigned',
          p_visibility: 'public',
          p_actor_type: 'admin',
          p_actor_id: unassigned_by,
          p_actor_name: 'System Admin',
          p_action_description: `Grievance unassigned from ${previouslyAssignedAdmin?.name || 'Unknown Admin'}`,
          p_action_details: {
            unassigned_from: currentGrievance.assigned_to,
            unassigned_from_name: previouslyAssignedAdmin?.name,
            unassigned_from_role: previouslyAssignedAdmin?.role,
            unassigned_by,
            unassignment_reason: unassignment_reason || 'Manual unassignment',
            timestamp: new Date().toISOString()
          },
          p_old_values: {
            assigned_to: currentGrievance.assigned_to,
            status: currentGrievance.status
          },
          p_new_values: {
            assigned_to: null,
            status: 'open'
          },
          p_is_milestone: false
        });
      
      if (activityError) {
        console.warn('⚠️ Activity logging failed, but unassignment succeeded:', activityError);
      } else {
        activityLogged = true;
      }
    } catch (error) {
      console.warn('⚠️ Activity logging failed, but unassignment succeeded:', error);
    }
    
    // Try to update assignment history (but don't fail if it doesn't work)
    let historyUpdated = false;
    try {
      const { error: historyError } = await supabaseAdmin
        .from('grievance_assignment_history')
        .update({
          is_active: false,
          unassigned_at: new Date().toISOString(),
          unassigned_by,
          unassignment_reason: unassignment_reason || 'Manual unassignment'
        })
        .eq('grievance_id', id)
        .eq('assigned_to', currentGrievance.assigned_to)
        .eq('is_active', true);
      
      if (historyError) {
        console.warn('⚠️ Assignment history update failed, but unassignment succeeded:', historyError);
      } else {
        historyUpdated = true;
      }
    } catch (error) {
      console.warn('⚠️ Assignment history update failed, but unassignment succeeded:', error);
    }
    
    return NextResponse.json({
      success: true,
      grievance: updatedGrievance,
      unassignment: {
        unassigned_from: currentGrievance.assigned_to,
        unassigned_from_name: previouslyAssignedAdmin?.name,
        unassigned_by,
        unassignment_reason: unassignment_reason || 'Manual unassignment',
        unassigned_at: new Date().toISOString()
      },
      activity_logged: activityLogged,
      history_updated: historyUpdated
    });
    
  } catch (error) {
    console.error('Error in DELETE /api/admin/grievances/[id]/assign:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 