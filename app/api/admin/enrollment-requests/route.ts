import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  try {
    // Create Supabase admin client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Fetch all enrollment requests with related data
    const { data: requests, error: requestsError } = await supabaseAdmin
      .from('transport_enrollment_requests')
      .select(`
        id,
        student_id,
        preferred_route_id,
        preferred_stop_id,
        request_status,
        request_type,
        semester_id,
        academic_year,
        requested_at,
        approved_at,
        approved_by,
        rejection_reason,
        admin_notes,
        special_requirements,
        students!transport_enrollment_requests_student_id_fkey (
          id,
          student_name,
          email,
          mobile,
          roll_number,
          father_name,
          mother_name,
          parent_mobile,
          departments!students_department_id_fkey (
            department_name
          ),
          programs!students_program_id_fkey (
            program_name,
            degree_name
          )
        ),
        routes!transport_enrollment_requests_preferred_route_id_fkey (
          id,
          route_number,
          route_name,
          start_location,
          end_location,
          fare,
          total_capacity,
          current_passengers,
          status
        ),
        route_stops!transport_enrollment_requests_preferred_stop_id_fkey (
          id,
          stop_name,
          stop_time,
          sequence_order,
          is_major_stop
        )
      `)
      .order('requested_at', { ascending: false });

    if (requestsError) {
      console.error('Error fetching enrollment requests:', requestsError);
      return NextResponse.json(
        { error: 'Failed to fetch enrollment requests' },
        { status: 500 }
      );
    }

    // Format the data for easier consumption
    const formattedRequests = requests.map(request => ({
      id: request.id,
      student_id: request.student_id,
      preferred_route_id: request.preferred_route_id,
      preferred_stop_id: request.preferred_stop_id,
      request_status: request.request_status,
      request_type: request.request_type,
      semester_id: request.semester_id,
      academic_year: request.academic_year,
      requested_at: request.requested_at,
      approved_at: request.approved_at,
      approved_by: request.approved_by,
      rejection_reason: request.rejection_reason,
      admin_notes: request.admin_notes,
      special_requirements: request.special_requirements,
      student: {
        id: request.students?.id,
        student_name: request.students?.student_name || 'N/A',
        email: request.students?.email || 'N/A',
        mobile: request.students?.mobile || 'N/A',
        roll_number: request.students?.roll_number || 'N/A',
        father_name: request.students?.father_name || 'N/A',
        mother_name: request.students?.mother_name || 'N/A',
        parent_mobile: request.students?.parent_mobile || 'N/A',
        department: {
          department_name: request.students?.departments?.department_name || 'N/A'
        },
        program: {
          program_name: request.students?.programs?.program_name || 'N/A',
          degree_name: request.students?.programs?.degree_name || 'N/A'
        }
      },
      route: request.routes ? {
        id: request.routes.id,
        route_number: request.routes.route_number,
        route_name: request.routes.route_name,
        start_location: request.routes.start_location,
        end_location: request.routes.end_location,
        fare: request.routes.fare,
        total_capacity: request.routes.total_capacity,
        current_passengers: request.routes.current_passengers || 0,
        status: request.routes.status
      } : null,
      stop: request.route_stops ? {
        id: request.route_stops.id,
        stop_name: request.route_stops.stop_name,
        stop_time: request.route_stops.stop_time,
        sequence_order: request.route_stops.sequence_order,
        is_major_stop: request.route_stops.is_major_stop
      } : null
    }));

    // Calculate summary statistics
    const stats = {
      total: formattedRequests.length,
      pending: formattedRequests.filter(r => r.request_status === 'pending').length,
      approved: formattedRequests.filter(r => r.request_status === 'approved').length,
      rejected: formattedRequests.filter(r => r.request_status === 'rejected').length,
      thisMonth: formattedRequests.filter(r => {
        const requestDate = new Date(r.requested_at);
        const now = new Date();
        return requestDate.getMonth() === now.getMonth() && 
               requestDate.getFullYear() === now.getFullYear();
      }).length
    };

    return NextResponse.json({
      success: true,
      requests: formattedRequests,
      stats: stats,
      count: formattedRequests.length
    });

  } catch (error: any) {
    console.error('Error in enrollment requests API:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
} 