import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// GET - Get specific grievance by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params; // Fix Next.js 15 issue by awaiting params
    
    const { data, error } = await supabaseAdmin
      .from('grievances')
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
          route_number,
          start_location,
          end_location
        ),
        admin_users!assigned_to (
          id,
          name,
          email,
          role
        )
      `)
      .eq('id', id)
      .single();
    
    if (error) {
      console.error('Error fetching grievance:', error);
      return NextResponse.json({ error: 'Grievance not found' }, { status: 404 });
    }
    
    return NextResponse.json(data);
    
  } catch (error) {
    console.error('Error in GET /api/admin/grievances/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH - Update specific fields of a grievance
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params; // Fix Next.js 15 issue by awaiting params
    const body = await request.json();
    
    console.log('🔄 Update API - Starting grievance update process');
    console.log('📋 Grievance ID:', id);
    console.log('📦 Update Data:', body);
    
    // Valid enum values for grievance status (expanded to include frontend values)
    const validStatuses = ['open', 'in_progress', 'resolved', 'closed', 'escalated', 'pending_approval', 'on_hold', 'under_review'];
    
    // Map frontend field names to database column names
    const updateData: any = {
      updated_at: new Date().toISOString()
    };
    
    // Handle status without mapping - preserve the exact frontend value
    if (body.status) {
      if (validStatuses.includes(body.status)) {
        updateData.status = body.status;
        console.log(`📝 Status set directly: ${body.status}`);
      } else {
        console.warn(`⚠️ Invalid status: ${body.status}, keeping current status`);
      }
    }
    
    // Map other fields correctly
    if (body.priority) updateData.priority = body.priority;
    if (body.urgency) updateData.urgency = body.urgency;
    if (body.category) updateData.category = body.category;
    if (body.subject) updateData.subject = body.subject;
    if (body.description) updateData.description = body.description;
    if (body.resolution) updateData.resolution = body.resolution;
    if (body.resolved_at) updateData.resolved_at = body.resolved_at;
    if (body.assigned_to) updateData.assigned_to = body.assigned_to;
    if (body.escalated_to) updateData.escalated_to = body.escalated_to;
    if (body.escalation_reason) updateData.escalation_reason = body.escalation_reason;
    if (body.follow_up_required !== undefined) updateData.follow_up_required = body.follow_up_required;
    if (body.follow_up_date) updateData.follow_up_date = body.follow_up_date;
    if (body.tags) updateData.tags = body.tags;
    if (body.closure_reason) updateData.closure_reason = body.closure_reason;
    
    // Handle frontend field name mappings
    if (body.estimatedResolutionDate) updateData.expected_resolution_date = body.estimatedResolutionDate;
    if (body.updateNote) updateData.internal_notes = body.updateNote;
    if (body.publicResponse) updateData.public_response = body.publicResponse;
    if (body.resolutionCategory) updateData.resolution_category = body.resolutionCategory;
    
    // Handle the status-specific updates
    if (updateData.status === 'resolved') {
      updateData.resolved_at = new Date().toISOString();
      if (body.resolution) updateData.resolution = body.resolution;
    }
    
    console.log('🔄 Mapped update data:', updateData);
    
    const { data, error } = await supabaseAdmin
      .from('grievances')
      .update(updateData)
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
    
    if (error) {
      console.error('❌ Error updating grievance:', error);
      return NextResponse.json({ error: 'Failed to update grievance', details: error }, { status: 500 });
    }
    
    console.log('✅ Grievance updated successfully:', data);
    return NextResponse.json(data);
    
  } catch (error) {
    console.error('❌ Error in PATCH /api/admin/grievances/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 