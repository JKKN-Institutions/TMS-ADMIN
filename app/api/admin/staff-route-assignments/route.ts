import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET: Fetch all staff route assignments or search by staff email
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const staffEmail = searchParams.get('staffEmail');
    const routeId = searchParams.get('routeId');

    let query = supabase
      .from('staff_route_assignments')
      .select(`
        id,
        staff_email,
        route_id,
        assigned_at,
        assigned_by,
        is_active,
        notes,
        created_at,
        updated_at,
        routes (
          id,
          route_number,
          route_name,
          start_location,
          end_location,
          departure_time,
          arrival_time,
          status,
          total_capacity,
          current_passengers
        )
      `)
      .eq('is_active', true)
      .order('assigned_at', { ascending: false });

    // If staff email is provided, filter by it
    if (staffEmail) {
      query = query.eq('staff_email', staffEmail.toLowerCase().trim());
    }

    // If route ID is provided, filter by it
    if (routeId) {
      query = query.eq('route_id', routeId);
    }

    const { data: assignments, error } = await query;

    if (error) {
      console.error('Error fetching staff route assignments:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch staff route assignments' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      assignments: assignments || [],
      count: assignments?.length || 0
    });

  } catch (error) {
    console.error('Error in staff route assignments API:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST: Create a new staff route assignment
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { staffEmail, routeId, assignedBy, notes } = body;

    // Validate required fields
    if (!staffEmail || !routeId) {
      return NextResponse.json(
        { success: false, error: 'Staff email and route ID are required' },
        { status: 400 }
      );
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(staffEmail)) {
      return NextResponse.json(
        { success: false, error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Verify route exists
    const { data: route, error: routeError } = await supabase
      .from('routes')
      .select('id, route_number, route_name, status')
      .eq('id', routeId)
      .single();

    if (routeError || !route) {
      return NextResponse.json(
        { success: false, error: 'Route not found' },
        { status: 404 }
      );
    }

    // Check if assignment already exists for this email and route
    const { data: existingAssignment } = await supabase
      .from('staff_route_assignments')
      .select('id, is_active')
      .eq('staff_email', staffEmail.toLowerCase().trim())
      .eq('route_id', routeId)
      .eq('is_active', true)
      .maybeSingle();

    if (existingAssignment) {
      return NextResponse.json(
        {
          success: false,
          error: 'This email is already assigned to this route',
          assignmentId: existingAssignment.id
        },
        { status: 409 }
      );
    }

    // Create the assignment with email directly (no validation if staff exists)
    const { data: assignment, error: assignmentError } = await supabase
      .from('staff_route_assignments')
      .insert({
        staff_email: staffEmail.toLowerCase().trim(),
        route_id: routeId,
        assigned_by: assignedBy || null,
        notes: notes || null,
        is_active: true
      })
      .select(`
        id,
        staff_email,
        route_id,
        assigned_at,
        assigned_by,
        is_active,
        notes,
        created_at,
        routes (
          id,
          route_number,
          route_name,
          start_location,
          end_location
        )
      `)
      .single();

    if (assignmentError) {
      console.error('Error creating staff route assignment:', assignmentError);
      return NextResponse.json(
        { success: false, error: 'Failed to create staff route assignment' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Staff route assignment created successfully',
      assignment
    }, { status: 201 });

  } catch (error) {
    console.error('Error in staff route assignments POST API:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE: Remove a staff route assignment (set is_active to false)
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const assignmentId = searchParams.get('assignmentId');

    if (!assignmentId) {
      return NextResponse.json(
        { success: false, error: 'Assignment ID is required' },
        { status: 400 }
      );
    }

    // Update the assignment to set is_active to false
    const { data: assignment, error } = await supabase
      .from('staff_route_assignments')
      .update({ is_active: false })
      .eq('id', assignmentId)
      .select()
      .single();

    if (error) {
      console.error('Error removing staff route assignment:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to remove staff route assignment' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Staff route assignment removed successfully',
      assignment
    });

  } catch (error) {
    console.error('Error in staff route assignments DELETE API:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
