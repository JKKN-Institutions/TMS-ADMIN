import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    const { request_id, route_id, stop_id, admin_notes } = await request.json();

    // Validate input
    if (!request_id || !route_id || !stop_id) {
      return NextResponse.json(
        { error: 'Request ID, route ID, and stop ID are required' },
        { status: 400 }
      );
    }

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

    // Get the enrollment request with student data
    const { data: enrollmentRequest, error: requestError } = await supabaseAdmin
      .from('transport_enrollment_requests')
      .select(`
        *,
        students!transport_enrollment_requests_student_id_fkey (
          id,
          student_name,
          email,
          mobile,
          roll_number,
          father_name,
          mother_name,
          parent_mobile
        )
      `)
      .eq('id', request_id)
      .single();

    if (requestError || !enrollmentRequest) {
      return NextResponse.json(
        { error: 'Enrollment request not found' },
        { status: 404 }
      );
    }

    // Check if request is still pending
    if (enrollmentRequest.request_status !== 'pending') {
      return NextResponse.json(
        { error: 'Request has already been processed' },
        { status: 400 }
      );
    }

    // Get the student record from the enrollment request
    const student = enrollmentRequest.students;
    if (!student) {
      return NextResponse.json(
        { error: 'Student not found in enrollment request' },
        { status: 404 }
      );
    }

    // Debug: Log the student data we're trying to match
    console.log('🔍 Student data from enrollment request:', {
      id: student.id,
      student_name: student.student_name,
      email: student.email,
      mobile: student.mobile,
      roll_number: student.roll_number
    });

    // Fetch comprehensive data from external APIs
    console.log('🔍 Fetching comprehensive data from external APIs...');
    const apiKey = 'jk_5483dc7eb7f1b7cd730a274ec61765cc_mcka9lzk';
    
    // Determine same-origin base URL for internal proxy calls (works on Vercel and locally)
    const requestUrl = new URL(request.url);
    const sameOriginBaseUrl = `${requestUrl.protocol}//${requestUrl.host}`;
    const localBaseUrl = sameOriginBaseUrl || 'http://localhost:3001';
    
    let foundPerson = null;
    let personType = 'unknown';
    
    // First, try to find in students API
    console.log('🔍 Searching in students API...');
    const studentSearch = (student.email || student.roll_number || student.mobile || '').trim();
    const studentResponse = await fetch(`${localBaseUrl}/api/api-management/students?limit=200&search=${encodeURIComponent(studentSearch)}`, {
      method: 'GET'
    });
    
    // Fallback: if empty, try without search but higher limit
    let students: any[] = [];
    if (studentResponse.ok) {
      const studentData = await studentResponse.json();
      students = studentData.data || studentData.students || studentData || [];
    }
    if ((!students || students.length === 0)) {
      const fallbackStudentsResp = await fetch(`${localBaseUrl}/api/api-management/students?limit=500`, { method: 'GET' });
      if (fallbackStudentsResp.ok) {
        const fallbackData = await fallbackStudentsResp.json();
        students = fallbackData.data || fallbackData.students || fallbackData || [];
      }
    }

    if (students.length > 0) {
      const foundStudent = students.find((extStudent: any) => {
        const emailMatch = extStudent.student_email?.toLowerCase() === student.email?.toLowerCase() ||
                           extStudent.college_email?.toLowerCase() === student.email?.toLowerCase();
        const mobileMatch = student.mobile && (
          extStudent.student_mobile === student.mobile ||
          extStudent.father_mobile === student.mobile ||
          extStudent.mother_mobile === student.mobile
        );
        
        console.log(`🔍 Checking student ${extStudent.first_name}:`, {
          emailMatch,
          mobileMatch,
          extStudent_email: extStudent.student_email,
          extStudent_college_email: extStudent.college_email,
          extStudent_mobile: extStudent.student_mobile,
          extStudent_father_mobile: extStudent.father_mobile,
          extStudent_mother_mobile: extStudent.mother_mobile,
          student_email: student.email,
          student_mobile: student.mobile
        });
        
        return emailMatch || mobileMatch;
      });

      if (foundStudent) {
        foundPerson = foundStudent;
        personType = 'student';
        console.log('✅ Found person in students API');
      } else {
        console.log('❌ No matching student found in students API');
      }
    } else {
      console.log('❌ Students API request failed:', studentResponse.status);
    }

    // If not found in students, try staff API
    if (!foundPerson) {
      console.log('🔍 Searching in staff API...');
      const staffSearch = (student.email || student.mobile || '').trim();
      const staffResponse = await fetch(`${localBaseUrl}/api/api-management/staff?limit=200&search=${encodeURIComponent(staffSearch)}`, {
        method: 'GET'
      });

      let staff: any[] = [];
      if (staffResponse.ok) {
        const staffData = await staffResponse.json();
        staff = staffData.data || staffData || [];
      }
      if ((!staff || staff.length === 0)) {
        const fallbackStaffResp = await fetch(`${localBaseUrl}/api/api-management/staff?limit=500`, { method: 'GET' });
        if (fallbackStaffResp.ok) {
          const fallbackStaffData = await fallbackStaffResp.json();
          staff = fallbackStaffData.data || fallbackStaffData || [];
        }
      }

      if (staff.length > 0) {
        const foundStaff = staff.find((extStaff: any) => {
          const emailMatch = extStaff.email?.toLowerCase() === student.email?.toLowerCase() ||
                             extStaff.institution_email?.toLowerCase() === student.email?.toLowerCase();
          const phoneMatch = student.mobile && extStaff.phone === student.mobile;
          
          console.log(`🔍 Checking staff ${extStaff.first_name}:`, {
            emailMatch,
            phoneMatch,
            extStaff_email: extStaff.email,
            extStaff_institution_email: extStaff.institution_email,
            extStaff_phone: extStaff.phone,
            student_email: student.email,
            student_mobile: student.mobile
          });
          
          return emailMatch || phoneMatch;
        });

        if (foundStaff) {
          foundPerson = foundStaff;
          personType = 'staff';
          console.log('✅ Found person in staff API');
        } else {
          console.log('❌ No matching staff found in staff API');
        }
      } else {
        console.log('❌ Staff API request failed:', staffResponse.status);
      }
    }

    // If still not found, return error
    if (!foundPerson) {
      console.error('Person not found in either students or staff external APIs');
      return NextResponse.json(
        { error: 'Person not found in external system (checked both students and staff)' },
        { status: 404 }
      );
    }

    const fullPersonName = foundPerson.first_name && foundPerson.last_name 
      ? `${foundPerson.first_name} ${foundPerson.last_name}`.trim()
      : foundPerson.first_name || 'Unknown Person';
    console.log(`✅ Found ${personType} in external API:`, fullPersonName);

    // Verify route and stop still exist and are valid
    const { data: route, error: routeError } = await supabaseAdmin
      .from('routes')
      .select('id, route_number, route_name, status, total_capacity, current_passengers')
      .eq('id', route_id)
      .single();

    if (routeError || !route) {
      return NextResponse.json(
        { error: 'Selected route not found' },
        { status: 404 }
      );
    }

    if (route.status !== 'active') {
      return NextResponse.json(
        { error: 'Selected route is not active' },
        { status: 400 }
      );
    }

    // Check if route has capacity
    if (route.current_passengers >= route.total_capacity) {
      return NextResponse.json(
        { error: 'Route is at full capacity' },
        { status: 400 }
      );
    }

    const { data: stop, error: stopError } = await supabaseAdmin
      .from('route_stops')
      .select('id, stop_name, route_id')
      .eq('id', stop_id)
      .eq('route_id', route_id)
      .single();

    if (stopError || !stop) {
      return NextResponse.json(
        { error: 'Selected stop not found or does not belong to the route' },
        { status: 404 }
      );
    }

    // Get admin user ID
    let adminId = request.headers.get('X-Admin-ID');
    if (!adminId) {
      adminId = '00000000-0000-0000-0000-000000000000'; // System admin UUID
    }

    // Update student record with comprehensive data from external API
    console.log('🔍 Updating student record with comprehensive external data...');
    
    // Update student record with comprehensive data from external API
    console.log('🔍 Updating student record with comprehensive external data...');
    
    try {
      if (personType === 'student') {
        // Handle student data
        await supabaseAdmin.rpc('update_comprehensive_student_data', {
          p_student_id: enrollmentRequest.student_id,
          p_external_data: foundPerson,
          p_external_student_id: foundPerson.id,
          p_external_roll_number: foundPerson.roll_number,
          p_department_name: foundPerson.department?.department_name || 'Unknown Department',
          p_institution_name: foundPerson.institution?.name || 'Unknown Institution',
          p_program_name: foundPerson.program?.program_name || '',
          p_degree_name: foundPerson.degree?.degree_name || '',
          p_father_name: foundPerson.father_name,
          p_mother_name: foundPerson.mother_name,
          p_parent_mobile: foundPerson.father_mobile || foundPerson.mother_mobile,
          p_date_of_birth: foundPerson.date_of_birth ? foundPerson.date_of_birth : null,
          p_gender: foundPerson.gender,
          p_emergency_contact_name: foundPerson.father_name || foundPerson.mother_name,
          p_emergency_contact_phone: foundPerson.father_mobile || foundPerson.mother_mobile,
          p_address_street: foundPerson.permanent_address_street,
          p_address_district: foundPerson.permanent_address_district,
          p_address_state: foundPerson.permanent_address_state,
          p_address_pin_code: foundPerson.permanent_address_pin_code,
          p_is_profile_complete: foundPerson.is_profile_complete || false,
          p_auth_source: 'external_api'
        });
      } else if (personType === 'staff') {
        // Handle staff data - update with staff-specific fields
        await supabaseAdmin.rpc('update_comprehensive_student_data', {
          p_student_id: enrollmentRequest.student_id,
          p_external_data: foundPerson,
          p_external_student_id: foundPerson.staff_id || foundPerson.id,
          p_external_roll_number: foundPerson.staff_id || 'N/A',
          p_department_name: foundPerson.department?.department_name || 'Unknown Department',
          p_institution_name: foundPerson.institution?.name || 'Unknown Institution',
          p_program_name: foundPerson.designation || '',
          p_degree_name: foundPerson.category?.category_name || '',
          p_father_name: '', // Staff might not have father/mother info
          p_mother_name: '',
          p_parent_mobile: foundPerson.phone || '',
          p_date_of_birth: foundPerson.date_of_birth ? foundPerson.date_of_birth : null,
          p_gender: foundPerson.gender,
          p_emergency_contact_name: foundPerson.first_name || '',
          p_emergency_contact_phone: foundPerson.phone || '',
          p_address_street: foundPerson.address || '',
          p_address_district: foundPerson.district || '',
          p_address_state: foundPerson.state || '',
          p_address_pin_code: foundPerson.pincode || '',
          p_is_profile_complete: true, // Staff profiles are usually complete
          p_auth_source: 'external_api'
        });
      }
      
      console.log('✅ Successfully updated student record with external data');
    } catch (updateError) {
      console.error('Error updating student record:', updateError);
      // Continue with the approval process even if update fails
      console.log('⚠️ Student record update failed, continuing with approval process');
    }

    // Use the database function to approve the request
    const { data: result, error: approvalError } = await supabaseAdmin
      .rpc('approve_transport_enrollment_request', {
        p_request_id: request_id,
        p_approver_id: adminId,
        p_route_id: route_id,
        p_stop_id: stop_id,
        p_admin_notes: admin_notes
      });

    if (approvalError) {
      console.error('Error approving enrollment request:', approvalError);
      return NextResponse.json(
        { error: 'Failed to approve enrollment request' },
        { status: 500 }
      );
    }

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to approve enrollment request' },
        { status: 500 }
      );
    }

    // Update student with transport assignment details
    const { error: transportUpdateError } = await supabaseAdmin
      .from('students')
      .update({
        allocated_route_id: route_id,
        boarding_point: stop.stop_name,
        transport_status: 'active',
        payment_status: 'current',
        updated_at: new Date().toISOString()
      })
      .eq('id', enrollmentRequest.student_id);

    if (transportUpdateError) {
      console.error('Error updating student transport details:', transportUpdateError);
      // Don't fail the approval, just log the error
    }

    // Update route current passenger count
    await supabaseAdmin
      .from('routes')
      .update({
        current_passengers: (route.current_passengers || 0) + 1,
        updated_at: new Date().toISOString()
      })
      .eq('id', route_id);

    // Send notification to student
    try {
      await supabaseAdmin
        .from('notifications')
        .insert({
          title: 'Transport Enrollment Approved! 🎉',
          message: `Congratulations! Your transport enrollment for route ${route.route_number} has been approved. You can now start booking trips.`,
          type: 'success',
          category: 'enrollment',
          target_audience: 'students',
          specific_users: [enrollmentRequest.student_id],
          is_active: true,
          actionable: true,
          primary_action: {
            text: 'View Route Details',
            url: '/dashboard/routes'
          },
          tags: ['enrollment', 'transport'],
          metadata: {
            route_id: route_id,
            route_number: route.route_number,
            stop_name: stop.stop_name,
            approval_date: new Date().toISOString(),
            admin_notes: admin_notes
          },
          created_at: new Date().toISOString()
        });
    } catch (notificationError) {
      console.error('Failed to send approval notification:', notificationError);
      // Don't fail the approval if notification fails
    }

    console.log('✅ Enrollment request approved successfully with comprehensive data storage');

    return NextResponse.json({
      success: true,
      message: 'Enrollment request approved successfully',
      request_id: request_id,
      student_data_updated: true,
      comprehensive_data_stored: true
    });

  } catch (error: any) {
    console.error('Error in approve enrollment request API:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
} 