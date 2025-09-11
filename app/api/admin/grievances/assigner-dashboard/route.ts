import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// GET endpoint for assigner dashboard data
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const adminId = searchParams.get('adminId');
    const timeRange = searchParams.get('timeRange') || '7d';

    if (!adminId) {
      return NextResponse.json(
        { success: false, error: 'Admin ID is required' },
        { status: 400 }
      );
    }

    // Check environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({
        success: false,
        error: 'Database connection not configured'
      }, { status: 503 });
    }

    // Get admin info
    const { data: adminInfo, error: adminError } = await supabaseAdmin
      .from('admin_users')
      .select('id, name, email, role')
      .eq('id', adminId)
      .single();

    if (adminError || !adminInfo) {
      return NextResponse.json(
        { success: false, error: 'Admin not found' },
        { status: 404 }
      );
    }

    // Calculate time range
    const now = new Date();
    const days = timeRange === '30d' ? 30 : timeRange === '7d' ? 7 : 1;
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    // Get all grievances for overview
    const { data: allGrievances, error: grievancesError } = await supabaseAdmin
      .from('grievances')
      .select(`
        id,
        category,
        priority,
        subject,
        description,
        status,
        created_at,
        updated_at,
        assigned_to,
        resolved_at,
        expected_resolution_date,
        student_id,
        route_id
      `)
      .order('created_at', { ascending: false });

    if (grievancesError) {
      console.error('Grievances query error:', grievancesError);
      throw grievancesError;
    }

    // Get unassigned grievances with enriched data
    const unassignedGrievances = await Promise.all(
      allGrievances
        .filter(g => !g.assigned_to)
        .map(async (grievance) => {
          let studentInfo = null;
          let routeInfo = null;

          // Get student info
          if (grievance.student_id) {
            try {
              const { data: student } = await supabaseAdmin
                .from('students')
                .select('id, student_name, email, roll_number')
                .eq('id', grievance.student_id)
                .single();
              studentInfo = student;
            } catch (err) {
              console.log('Error fetching student info:', err);
            }
          }

          // Get route info
          if (grievance.route_id) {
            try {
              const { data: route } = await supabaseAdmin
                .from('routes')
                .select('id, route_name, route_number')
                .eq('id', grievance.route_id)
                .single();
              routeInfo = route;
            } catch (err) {
              console.log('Error fetching route info:', err);
            }
          }

          return {
            ...grievance,
            student: studentInfo,
            route: routeInfo
          };
        })
    );
    
    // Get available admin staff with real data
    let availableStaff = [];
    try {
      const { data: staffData, error: staffError } = await supabaseAdmin
        .rpc('get_available_admin_staff');
      
      if (staffError) {
        console.log('Staff function not available, using basic query');
        // Fallback to basic admin query
        const { data: basicStaff } = await supabaseAdmin
          .from('admin_users')
          .select('id, name, email, role, is_active')
          .eq('is_active', true);
        
        if (basicStaff) {
          availableStaff = basicStaff.map(staff => ({
            id: staff.id,
            name: staff.name,
            email: staff.email,
            role: staff.role,
            current_workload: 0,
            max_capacity: 25,
            workload_percentage: 0,
            specializations: [],
            skill_level: 3,
            avg_response_time: '2 hours',
            recent_activity: new Date().toISOString(),
            performance_rating: 3.5
          }));
        }
      } else if (staffData) {
        availableStaff = staffData;
      }
    } catch (err) {
      console.log('Staff data not available:', err);
      // Use basic admin data as fallback
      const { data: basicStaff } = await supabaseAdmin
        .from('admin_users')
        .select('id, name, email, role, is_active')
        .eq('is_active', true);
      
      if (basicStaff) {
        availableStaff = basicStaff.map(staff => ({
          id: staff.id,
          name: staff.name,
          email: staff.email,
          role: staff.role,
          current_workload: 0,
          max_capacity: 25,
          workload_percentage: 0,
          specializations: [],
          skill_level: 3,
          avg_response_time: '2 hours',
          recent_activity: new Date().toISOString(),
          performance_rating: 3.5
        }));
      }
    }

    // Get assignment history
    let assignmentHistory = [];
    try {
      const { data: historyData, error: historyError } = await supabaseAdmin
        .from('grievance_assignment_history')
        .select(`
          *,
          grievance:grievances(id, subject, priority, status),
          assigned_to_admin:admin_users!grievance_assignment_history_assigned_to_fkey(name, email),
          assigned_by_admin:admin_users!grievance_assignment_history_assigned_by_fkey(name, email)
        `)
        .gte('assigned_at', startDate.toISOString())
        .order('assigned_at', { ascending: false });

      if (!historyError && historyData) {
        assignmentHistory = historyData;
      }
    } catch (err) {
      console.log('Assignment history not available:', err);
    }

    // Calculate team performance metrics from real data
    const teamPerformance = {};
    allGrievances.forEach(grievance => {
      if (grievance.assigned_to) {
        if (!teamPerformance[grievance.assigned_to]) {
          teamPerformance[grievance.assigned_to] = {
            total: 0,
            open: 0,
            in_progress: 0,
            resolved: 0,
            overdue: 0,
            avg_response_time: 0,
            total_response_time: 0,
            resolved_count: 0
          };
        }
        
        const perf = teamPerformance[grievance.assigned_to];
        perf.total++;
        
        if (grievance.status === 'open') perf.open++;
        else if (grievance.status === 'in_progress') perf.in_progress++;
        else if (grievance.status === 'resolved') {
          perf.resolved++;
          perf.resolved_count++;
          
          if (grievance.resolved_at) {
            const responseTime = new Date(grievance.resolved_at).getTime() - new Date(grievance.created_at).getTime();
            perf.total_response_time += responseTime;
          }
        }
        
        if (grievance.expected_resolution_date && 
            new Date(grievance.expected_resolution_date) < now && 
            grievance.status !== 'resolved') {
          perf.overdue++;
        }
      }
    });

    // Calculate average response times
    Object.values(teamPerformance).forEach((perf: any) => {
      if (perf.resolved_count > 0) {
        perf.avg_response_time = Math.round(perf.total_response_time / perf.resolved_count / (1000 * 60 * 60)); // hours
      }
    });

    // Get staff info and merge with performance
    const teamOverview = availableStaff.map(staff => ({
      ...staff,
      performance: teamPerformance[staff.id] || {
        total: 0, open: 0, in_progress: 0, resolved: 0, overdue: 0, avg_response_time: 0
      }
    }));

    // Calculate system-wide metrics
    const systemMetrics = {
      total_grievances: allGrievances.length,
      unassigned_grievances: unassignedGrievances.length,
      assigned_grievances: allGrievances.filter(g => g.assigned_to).length,
      resolved_grievances: allGrievances.filter(g => g.status === 'resolved').length,
      overdue_grievances: allGrievances.filter(g => 
        g.expected_resolution_date && 
        new Date(g.expected_resolution_date) < now && 
        g.status !== 'resolved'
      ).length,
      urgent_grievances: allGrievances.filter(g => g.priority === 'urgent').length,
      high_priority_grievances: allGrievances.filter(g => g.priority === 'high').length,
      resolution_rate: allGrievances.length > 0 ? 
        Math.round((allGrievances.filter(g => g.status === 'resolved').length / allGrievances.length) * 100) : 0
    };

    // Get workload distribution
    const workloadDistribution = availableStaff.map(staff => ({
      id: staff.id,
      name: staff.name,
      role: staff.role,
      current_workload: staff.current_workload || 0,
      max_capacity: staff.max_capacity || 25,
      workload_percentage: staff.workload_percentage || 0,
      specializations: staff.specializations || [],
      can_take_more: (staff.workload_percentage || 0) < 80
    }));

    // Get recent assignments made by this admin
    const recentAssignments = assignmentHistory.filter(ah => ah.assigned_by === adminId);

    // Calculate trend data
    const trendData = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split('T')[0];
      
      const dayGrievances = allGrievances.filter(g => 
        g.created_at.split('T')[0] === dateStr
      );
      const dayAssigned = allGrievances.filter(g => {
        const assignmentRecord = assignmentHistory.find(ah => ah.grievance_id === g.id);
        return assignmentRecord && assignmentRecord.assigned_at.split('T')[0] === dateStr;
      });
      const dayResolved = allGrievances.filter(g => 
        g.resolved_at && g.resolved_at.split('T')[0] === dateStr
      );
      
      trendData.push({
        date: dateStr,
        created: dayGrievances.length,
        assigned: dayAssigned.length,
        resolved: dayResolved.length,
        unassigned: dayGrievances.filter(g => !g.assigned_to).length
      });
    }

    // Get priority distribution of unassigned grievances
    const unassignedPriorities = {
      urgent: unassignedGrievances.filter(g => g.priority === 'urgent').length,
      high: unassignedGrievances.filter(g => g.priority === 'high').length,
      medium: unassignedGrievances.filter(g => g.priority === 'medium').length,
      low: unassignedGrievances.filter(g => g.priority === 'low').length
    };

    // Get category distribution
    const categoryDistribution = {};
    allGrievances.forEach(g => {
      categoryDistribution[g.category] = (categoryDistribution[g.category] || 0) + 1;
    });

    // Create assignment recommendations from real unassigned grievances
    const assignmentRecommendations = unassignedGrievances.slice(0, 10).map(grievance => {
      // Simple recommendation logic based on workload and specialization
      const recommendations = availableStaff
        .filter(staff => staff.workload_percentage < 80)
        .map(staff => {
          let matchScore = 50; // Base score
          
          // Adjust based on workload
          if (staff.workload_percentage < 50) matchScore += 20;
          else if (staff.workload_percentage < 70) matchScore += 10;
          
          // Adjust based on role
          if (staff.role === 'super_admin') matchScore += 15;
          else if (staff.role === 'operations_admin') matchScore += 10;
          else if (staff.role === 'transport_manager') matchScore += 8;
          
          // Adjust based on specialization
          if (staff.specializations && staff.specializations.includes(grievance.category)) {
            matchScore += 25;
          }
          
          return {
            admin_id: staff.id,
            admin_name: staff.name,
            match_score: Math.min(matchScore, 100),
            recommendation_reason: `${staff.role} with ${staff.workload_percentage}% workload`
          };
        })
        .sort((a, b) => b.match_score - a.match_score)
        .slice(0, 3);

      return {
        grievance_id: grievance.id,
        subject: grievance.subject,
        priority: grievance.priority,
        category: grievance.category,
        created_at: grievance.created_at,
        student: grievance.student,
        route: grievance.route,
        recommendations
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        admin_info: adminInfo,
        system_metrics: systemMetrics,
        unassigned_grievances: unassignedGrievances.length,
        unassigned_grievances_data: unassignedGrievances,
        team_overview: teamOverview,
        workload_distribution: workloadDistribution,
        recent_assignments: recentAssignments,
        assignment_recommendations: assignmentRecommendations,
        analytics: {
          trend_data: trendData,
          priority_distribution: unassignedPriorities,
          category_distribution: categoryDistribution,
          assignment_history: assignmentHistory
        },
        time_range: timeRange,
        last_updated: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Assigner dashboard error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch assigner dashboard data',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// POST endpoint for bulk assignments
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { adminId, assignments, assignmentType = 'bulk' } = body;

    if (!adminId || !assignments || !Array.isArray(assignments)) {
      return NextResponse.json(
        { success: false, error: 'Admin ID and assignments array are required' },
        { status: 400 }
      );
    }

    // Check environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({
        success: false,
        error: 'Database connection not configured'
      }, { status: 503 });
    }

    const results = [];
    const errors = [];

    // Process each assignment
    for (const assignment of assignments) {
      const { grievanceId, assignedTo, reason, priority, deadline } = assignment;

      try {
        // Verify grievance exists and is unassigned
        const { data: existingGrievance, error: checkError } = await supabaseAdmin
          .from('grievances')
          .select('id, assigned_to, subject, student_id')
          .eq('id', grievanceId)
          .single();

        if (checkError || !existingGrievance) {
          throw new Error(`Grievance ${grievanceId} not found`);
        }

        if (existingGrievance.assigned_to) {
          throw new Error(`Grievance ${grievanceId} is already assigned`);
        }

        // Verify assignee exists
        const { data: assigneeCheck, error: assigneeError } = await supabaseAdmin
          .from('admin_users')
          .select('id, name')
          .eq('id', assignedTo)
          .eq('is_active', true)
          .single();

        if (assigneeError || !assigneeCheck) {
          throw new Error(`Assignee ${assignedTo} not found or inactive`);
        }

        // Update grievance
        const updateData = {
          assigned_to: assignedTo,
          updated_at: new Date().toISOString()
        };

        if (priority) updateData.priority = priority;
        if (deadline) updateData.expected_resolution_date = deadline;

        const { error: updateError } = await supabaseAdmin
          .from('grievances')
          .update(updateData)
          .eq('id', grievanceId);

        if (updateError) {
          throw updateError;
        }

        // Create assignment history record
        try {
          await supabaseAdmin
            .from('grievance_assignment_history')
            .insert({
              grievance_id: grievanceId,
              assigned_by: adminId,
              assigned_to: assignedTo,
              assignment_reason: reason || 'Manual assignment',
              assignment_type: assignmentType,
              priority_level: priority,
              expected_resolution_date: deadline,
              assigned_at: new Date().toISOString()
            });
        } catch (historyError) {
          console.log('Failed to create assignment history:', historyError);
        }

        // Log activity
        try {
          await supabaseAdmin.rpc('log_grievance_activity', {
            p_grievance_id: grievanceId,
            p_activity_type: 'grievance_assigned',
            p_visibility: 'public',
            p_actor_type: 'admin',
            p_actor_id: adminId,
            p_actor_name: 'Assignment Manager',
            p_action_description: `Grievance assigned to ${assigneeCheck.name} via ${assignmentType} assignment`,
            p_action_details: { 
              assigned_to: assignedTo,
              assigned_to_name: assigneeCheck.name,
              reason: reason,
              assignment_type: assignmentType
            }
          });
        } catch (logError) {
          console.log('Activity logging failed:', logError);
        }

        results.push({
          grievanceId,
          grievanceSubject: existingGrievance.subject,
          assignedTo,
          assignedToName: assigneeCheck.name,
          status: 'success',
          message: 'Assignment completed successfully'
        });

      } catch (error) {
        console.error(`Assignment failed for grievance ${grievanceId}:`, error);
        errors.push({
          grievanceId,
          assignedTo,
          status: 'error',
          message: error instanceof Error ? error.message : 'Assignment failed'
        });
      }
    }

    return NextResponse.json({
      success: errors.length === 0,
      data: {
        total_assignments: assignments.length,
        successful: results.length,
        failed: errors.length,
        results: results,
        errors: errors
      },
      message: errors.length === 0 ? 
        'All assignments completed successfully' : 
        `${results.length} assignments completed, ${errors.length} failed`
    });

  } catch (error) {
    console.error('Bulk assignment error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to process bulk assignments',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 