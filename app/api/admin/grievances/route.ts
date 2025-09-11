import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { DatabaseService } from '@/lib/database';

// GET - Fetch all grievances with enhanced filters and pagination
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const status = searchParams.get('status');
    const category = searchParams.get('category');
    const grievanceType = searchParams.get('grievance_type');
    const priority = searchParams.get('priority');
    const urgency = searchParams.get('urgency');
    const assignedTo = searchParams.get('assigned_to');
    const unassigned = searchParams.get('unassigned') === 'true';
    const search = searchParams.get('search');
    const sortBy = searchParams.get('sort_by') || 'created_at';
    const sortOrder = searchParams.get('sort_order') || 'desc';
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');
    const dateRange = searchParams.get('date_range');
    const includeResolved = searchParams.get('include_resolved') === 'true';
    const includeComments = searchParams.get('include_comments') === 'true';
    const tags = searchParams.get('tags')?.split(',').filter(Boolean);
    
    const offset = (page - 1) * limit;
    
    let query = supabaseAdmin
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
        ),
        escalated_admin:admin_users!escalated_to (
          id,
          name,
          email,
          role
        )${includeComments ? `,
        grievance_communications (
          id,
          message,
          sender_type,
          sender_id,
          communication_type,
          is_internal,
          read_at,
          created_at,
          admin_users!grievance_communications_sender_id_fkey (
            id,
            name,
            role
          ),
          students!grievance_communications_sender_id_fkey (
            id,
            student_name,
            roll_number
          )
        )` : ''}
      `, { count: 'exact' });
    
    // Apply filters
    if (status) query = query.eq('status', status);
    if (category) query = query.eq('category', category);
    if (grievanceType) query = query.eq('grievance_type', grievanceType);
    if (priority) query = query.eq('priority', priority);
    if (urgency) query = query.eq('urgency', urgency);
    if (assignedTo) query = query.eq('assigned_to', assignedTo);
    if (unassigned) query = query.is('assigned_to', null);
    if (dateFrom) query = query.gte('created_at', dateFrom);
    if (dateTo) query = query.lte('created_at', dateTo);
    
    // Handle date range filter
    if (dateRange && dateRange !== 'all') {
      const now = new Date();
      let startDate: Date;
      
      switch (dateRange) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case 'quarter':
          startDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
          break;
        default:
          startDate = new Date(0); // No filter
      }
      
      if (startDate.getTime() > 0) {
        query = query.gte('created_at', startDate.toISOString());
      }
    }
    
    if (!includeResolved) query = query.neq('status', 'resolved');
    if (tags && tags.length > 0) {
      query = query.overlaps('tags', tags);
    }
    
    // Apply search
    if (search) {
      query = query.or(`
        subject.ilike.%${search}%,
        description.ilike.%${search}%,
        driver_name.ilike.%${search}%,
        vehicle_registration.ilike.%${search}%,
        location_details.ilike.%${search}%,
        internal_notes.ilike.%${search}%,
        students.student_name.ilike.%${search}%,
        students.roll_number.ilike.%${search}%
      `);
    }
    
    // Apply sorting and pagination
    query = query
      .order(sortBy, { ascending: sortOrder === 'asc' })
      .range(offset, offset + limit - 1);
    
    const { data, error, count } = await query;
    
    if (error) {
      console.error('Error fetching grievances:', error);
      return NextResponse.json({ error: 'Failed to fetch grievances' }, { status: 500 });
    }
    
    const totalPages = Math.ceil((count || 0) / limit);
    
    return NextResponse.json({
      grievances: data,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
    
  } catch (error) {
    console.error('Error in GET /api/admin/grievances:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Create a new grievance (admin on behalf of student) with enhanced fields
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const {
      student_id,
      route_id,
      driver_name,
      vehicle_registration,
      category,
      grievance_type = 'service_complaint',
      priority = 'medium',
      urgency = 'medium',
      subject,
      description,
      location_details,
      incident_date,
      incident_time,
      witness_details,
      tags = [],
      assigned_to,
      internal_notes,
      estimated_resolution_time
    } = body;
    
    // Validate required fields
    if (!student_id || !category || !subject || !description) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    
    // Verify student exists
    const { data: student, error: studentError } = await supabaseAdmin
      .from('students')
      .select('id, student_name')
      .eq('id', student_id)
      .single();
    
    if (studentError || !student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }
    
    // Get configuration for this category to determine SLA
    const { data: config, error: configError } = await supabaseAdmin
      .from('grievance_categories_config')
      .select('*')
      .eq('category', category)
      .eq('grievance_type', grievance_type)
      .single();
    
    if (configError) {
      console.log('No specific config found for category, using defaults');
    }
    
    // Calculate estimated resolution time based on SLA
    const slaHours = config?.sla_hours || 72;
    const calculatedResolutionTime = estimated_resolution_time || `${slaHours} hours`;
    
    const grievanceData = {
      student_id,
      route_id: route_id || null,
      driver_name: driver_name || null,
      vehicle_registration: vehicle_registration || null,
      category,
      grievance_type,
      priority,
      urgency,
      subject: subject.trim(),
      description: description.trim(),
      location_details: location_details || null,
      incident_date: incident_date || null,
      incident_time: incident_time || null,
      witness_details: witness_details || null,
      tags: tags.length > 0 ? tags : null,
      assigned_to: assigned_to || config?.auto_assign_to || null,
      internal_notes: internal_notes || null,
      estimated_resolution_time: calculatedResolutionTime,
      status: assigned_to ? 'in_progress' : 'open'
    };
    
    const { data, error } = await supabaseAdmin
      .from('grievances')
      .insert(grievanceData)
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
      .single();
    
    if (error) {
      console.error('Error creating grievance:', error);
      return NextResponse.json({ error: 'Failed to create grievance' }, { status: 500 });
    }
    
    // If assigned, create assignment record
    if (data.assigned_to) {
      await supabaseAdmin
        .from('grievance_assignments')
        .insert({
          grievance_id: data.id,
          assigned_to: data.assigned_to,
          assignment_reason: 'Assigned during creation',
          is_active: true
        });
    }
    
    return NextResponse.json(data, { status: 201 });
    
  } catch (error) {
    console.error('Error in POST /api/admin/grievances:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT - Update an existing grievance with enhanced fields
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;
    
    if (!id) {
      return NextResponse.json({ error: 'Grievance ID is required' }, { status: 400 });
    }
    
    // Get current grievance data
    const { data: currentGrievance, error: fetchError } = await supabaseAdmin
      .from('grievances')
      .select('*')
      .eq('id', id)
      .single();
    
    if (fetchError || !currentGrievance) {
      return NextResponse.json({ error: 'Grievance not found' }, { status: 404 });
    }
    
    // Handle status change
    if (updates.status && updates.status !== currentGrievance.status) {
      if (updates.status === 'resolved') {
        updates.resolved_at = new Date().toISOString();
        
        // Calculate actual resolution time
        const createdAt = new Date(currentGrievance.created_at);
        const resolvedAt = new Date();
        const resolutionTimeHours = (resolvedAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
        updates.actual_resolution_time = `${resolutionTimeHours.toFixed(2)} hours`;
      }
    }
    
    // Handle assignment change
    if (updates.assigned_to && updates.assigned_to !== currentGrievance.assigned_to) {
      // Create new assignment record
      await supabaseAdmin
        .from('grievance_assignments')
        .insert({
          grievance_id: id,
          assigned_to: updates.assigned_to,
          assigned_by: updates.assigned_by || null,
          assignment_reason: updates.assignment_reason || 'Reassigned',
          is_active: true
        });
      
      // Deactivate old assignment
      if (currentGrievance.assigned_to) {
        await supabaseAdmin
          .from('grievance_assignments')
          .update({
            is_active: false,
            unassigned_at: new Date().toISOString(),
            unassignment_reason: 'Reassigned to another admin'
          })
          .eq('grievance_id', id)
          .eq('assigned_to', currentGrievance.assigned_to)
          .eq('is_active', true);
      }
    }
    
    // Handle escalation
    if (updates.escalated_to && updates.escalated_to !== currentGrievance.escalated_to) {
      updates.escalated_at = new Date().toISOString();
    }
    
    // Update tags (merge with existing if specified)
    if (updates.tags && updates.merge_tags) {
      const existingTags = currentGrievance.tags || [];
      updates.tags = [...new Set([...existingTags, ...updates.tags])];
      delete updates.merge_tags;
    }
    
    const { data, error } = await supabaseAdmin
      .from('grievances')
      .update(updates)
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
          route_number,
          start_location,
          end_location
        ),
        admin_users!assigned_to (
          id,
          name,
          email,
          role
        ),
        escalated_admin:admin_users!escalated_to (
          id,
          name,
          email,
          role
        )
      `)
      .single();
    
    if (error) {
      console.error('Error updating grievance:', error);
      return NextResponse.json({ error: 'Failed to update grievance' }, { status: 500 });
    }
    
    return NextResponse.json(data);
    
  } catch (error) {
    console.error('Error in PUT /api/admin/grievances:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Delete a grievance (soft delete by setting status to closed)
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const reason = searchParams.get('reason') || 'Deleted by admin';
    
    if (!id) {
      return NextResponse.json({ error: 'Grievance ID is required' }, { status: 400 });
    }
    
    const { data, error } = await supabaseAdmin
      .from('grievances')
      .update({ 
        status: 'closed',
        closure_reason: reason,
        resolved_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.error('Error deleting grievance:', error);
      return NextResponse.json({ error: 'Failed to delete grievance' }, { status: 500 });
    }
    
    return NextResponse.json({ message: 'Grievance deleted successfully' });
    
  } catch (error) {
    console.error('Error in DELETE /api/admin/grievances:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 