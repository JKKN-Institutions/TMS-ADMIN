import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// POST - Resolve grievance
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    const { 
      resolution, 
      resolution_category, 
      public_response, 
      internal_notes, 
      resolved_by,
      follow_up_required = false,
      follow_up_date 
    } = body;
    
    if (!resolution) {
      return NextResponse.json({ error: 'Resolution is required' }, { status: 400 });
    }
    
    // Get current grievance data
    const { data: currentGrievance, error: grievanceError } = await supabase
      .from('grievances')
      .select('*')
      .eq('id', id)
      .single();
    
    if (grievanceError || !currentGrievance) {
      return NextResponse.json({ error: 'Grievance not found' }, { status: 404 });
    }
    
    if (currentGrievance.status === 'resolved') {
      return NextResponse.json({ error: 'Grievance is already resolved' }, { status: 400 });
    }
    
    // Calculate resolution time
    const resolvedAt = new Date();
    const createdAt = new Date(currentGrievance.created_at);
    const resolutionTime = resolvedAt.getTime() - createdAt.getTime();
    
    // Update grievance with resolution
    const { data: updatedGrievance, error: updateError } = await supabase
      .from('grievances')
      .update({
        status: 'resolved',
        resolution,
        resolution_category,
        public_response,
        internal_notes,
        resolved_at: resolvedAt.toISOString(),
        actual_resolution_time: `${Math.floor(resolutionTime / (1000 * 60 * 60))} hours`,
        follow_up_required,
        follow_up_date
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
        ),
        admin_users!assigned_to (
          id,
          name,
          email,
          role
        )
      `)
      .single();
    
    if (updateError) {
      console.error('Error updating grievance:', updateError);
      return NextResponse.json({ error: 'Failed to resolve grievance' }, { status: 500 });
    }
    
    // Add communication record for resolution
    await supabase
      .from('grievance_communications')
      .insert({
        grievance_id: id,
        sender_type: 'admin',
        sender_id: resolved_by,
        recipient_type: 'student',
        recipient_id: currentGrievance.student_id,
        message: `Grievance resolved: ${resolution}`,
        communication_type: 'resolution',
        is_internal: false
      });
    
    return NextResponse.json(updatedGrievance);
    
  } catch (error) {
    console.error('Error in POST /api/admin/grievances/[id]/resolve:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Reopen resolved grievance
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    const { reason, reopened_by } = body;
    
    // Get current grievance data
    const { data: currentGrievance, error: grievanceError } = await supabase
      .from('grievances')
      .select('*')
      .eq('id', id)
      .single();
    
    if (grievanceError || !currentGrievance) {
      return NextResponse.json({ error: 'Grievance not found' }, { status: 404 });
    }
    
    if (currentGrievance.status !== 'resolved') {
      return NextResponse.json({ error: 'Grievance is not resolved' }, { status: 400 });
    }
    
    // Reopen grievance
    const { data: updatedGrievance, error: updateError } = await supabase
      .from('grievances')
      .update({
        status: 'in_progress',
        resolved_at: null,
        actual_resolution_time: null,
        internal_notes: currentGrievance.internal_notes 
          ? `${currentGrievance.internal_notes}\n\n[REOPENED] ${reason || 'No reason provided'}`
          : `[REOPENED] ${reason || 'No reason provided'}`
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
        ),
        admin_users!assigned_to (
          id,
          name,
          email,
          role
        )
      `)
      .single();
    
    if (updateError) {
      console.error('Error updating grievance:', updateError);
      return NextResponse.json({ error: 'Failed to reopen grievance' }, { status: 500 });
    }
    
    // Add communication record for reopening
    await supabase
      .from('grievance_communications')
      .insert({
        grievance_id: id,
        sender_type: 'admin',
        sender_id: reopened_by,
        recipient_type: 'student',
        recipient_id: currentGrievance.student_id,
        message: `Grievance reopened: ${reason || 'No reason provided'}`,
        communication_type: 'status_change',
        is_internal: false
      });
    
    return NextResponse.json(updatedGrievance);
    
  } catch (error) {
    console.error('Error in DELETE /api/admin/grievances/[id]/resolve:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 