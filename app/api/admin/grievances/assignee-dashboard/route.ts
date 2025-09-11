import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// GET endpoint for assignee dashboard data
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
        error: 'Database connection not configured',
        message: 'Please set up environment variables first'
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

    // Get assigned grievances with detailed info
    const { data: grievances, error: grievancesError } = await supabaseAdmin
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
        expected_resolution_date,
        resolved_at,
        student_id,
        route_id,
        driver_name,
        resolution
      `)
      .eq('assigned_to', adminId)
      .order('created_at', { ascending: false });

    if (grievancesError) {
      console.error('Grievances query error:', grievancesError);
      throw grievancesError;
    }

    // Get enriched grievance data
    const enrichedGrievances = await Promise.all(
      grievances.map(async (grievance) => {
        let studentInfo = null;
        let routeInfo = null;
        let recentActivity = [];

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

        // Get recent activity
        try {
          const { data: activities } = await supabaseAdmin
            .from('grievance_activity_log')
            .select('*')
            .eq('grievance_id', grievance.id)
            .order('created_at', { ascending: false })
            .limit(5);
          recentActivity = activities || [];
        } catch (err) {
          console.log('Error fetching activities:', err);
        }

        return {
          ...grievance,
          student: studentInfo,
          route: routeInfo,
          recent_activity: recentActivity,
          // Calculate metrics
          age_hours: Math.floor((now.getTime() - new Date(grievance.created_at).getTime()) / (1000 * 60 * 60)),
          is_overdue: grievance.expected_resolution_date && new Date(grievance.expected_resolution_date) < now && grievance.status !== 'resolved',
          response_time: grievance.resolved_at ? 
            Math.floor((new Date(grievance.resolved_at).getTime() - new Date(grievance.created_at).getTime()) / (1000 * 60 * 60)) : null
        };
      })
    );

    // Calculate performance metrics
    const totalGrievances = enrichedGrievances.length;
    const openGrievances = enrichedGrievances.filter(g => g.status === 'open');
    const inProgressGrievances = enrichedGrievances.filter(g => g.status === 'in_progress');
    const resolvedGrievances = enrichedGrievances.filter(g => g.status === 'resolved');
    const overdueGrievances = enrichedGrievances.filter(g => g.is_overdue);
    const urgentGrievances = enrichedGrievances.filter(g => g.priority === 'urgent');
    const highPriorityGrievances = enrichedGrievances.filter(g => g.priority === 'high');

    // Calculate average response time
    const resolvedWithTime = resolvedGrievances.filter(g => g.response_time !== null);
    const avgResponseTime = resolvedWithTime.length > 0 ? 
      resolvedWithTime.reduce((sum, g) => sum + g.response_time, 0) / resolvedWithTime.length : 0;

    // Get recent activity in time range
    const recentGrievances = enrichedGrievances.filter(g => 
      new Date(g.created_at) >= startDate
    );

    // Calculate trend data
    const trendData = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split('T')[0];
      const dayGrievances = enrichedGrievances.filter(g => 
        g.created_at.split('T')[0] === dateStr
      );
      const dayResolved = dayGrievances.filter(g => 
        g.resolved_at && g.resolved_at.split('T')[0] === dateStr
      );
      
      trendData.push({
        date: dateStr,
        created: dayGrievances.length,
        resolved: dayResolved.length,
        pending: dayGrievances.filter(g => g.status !== 'resolved').length
      });
    }

    // Get workload comparison with other admins
    const { data: allAdminWorkload, error: workloadError } = await supabaseAdmin
      .from('grievances')
      .select('assigned_to, status')
      .not('assigned_to', 'is', null);

    let workloadComparison = {};
    if (!workloadError && allAdminWorkload) {
      const workloadMap = {};
      allAdminWorkload.forEach(g => {
        if (!workloadMap[g.assigned_to]) {
          workloadMap[g.assigned_to] = { total: 0, open: 0, in_progress: 0 };
        }
        workloadMap[g.assigned_to].total++;
        if (g.status === 'open') workloadMap[g.assigned_to].open++;
        if (g.status === 'in_progress') workloadMap[g.assigned_to].in_progress++;
      });

      const myWorkload = workloadMap[adminId] || { total: 0, open: 0, in_progress: 0 };
      const otherWorkloads = Object.values(workloadMap).filter(w => w !== myWorkload);
      const avgWorkload = otherWorkloads.length > 0 ? 
        otherWorkloads.reduce((sum, w) => sum + w.total, 0) / otherWorkloads.length : 0;

      workloadComparison = {
        my_total: myWorkload.total,
        my_active: myWorkload.open + myWorkload.in_progress,
        team_avg: Math.round(avgWorkload),
        percentile: avgWorkload > 0 ? Math.round((myWorkload.total / avgWorkload) * 100) : 100
      };
    }

    // Get upcoming deadlines
    const upcomingDeadlines = enrichedGrievances
      .filter(g => g.expected_resolution_date && g.status !== 'resolved')
      .sort((a, b) => new Date(a.expected_resolution_date).getTime() - new Date(b.expected_resolution_date).getTime())
      .slice(0, 10);

    // Get priority distribution
    const priorityDistribution = {
      urgent: urgentGrievances.length,
      high: highPriorityGrievances.length,
      medium: enrichedGrievances.filter(g => g.priority === 'medium').length,
      low: enrichedGrievances.filter(g => g.priority === 'low').length
    };

    // Get category distribution
    const categoryDistribution = {};
    enrichedGrievances.forEach(g => {
      categoryDistribution[g.category] = (categoryDistribution[g.category] || 0) + 1;
    });

    return NextResponse.json({
      success: true,
      data: {
        admin_info: adminInfo,
        summary: {
          total_grievances: totalGrievances,
          open_grievances: openGrievances.length,
          in_progress_grievances: inProgressGrievances.length,
          resolved_grievances: resolvedGrievances.length,
          overdue_grievances: overdueGrievances.length,
          urgent_grievances: urgentGrievances.length,
          avg_response_time_hours: Math.round(avgResponseTime),
          resolution_rate: totalGrievances > 0 ? Math.round((resolvedGrievances.length / totalGrievances) * 100) : 0
        },
        grievances: enrichedGrievances,
        recent_grievances: recentGrievances,
        performance: {
          trend_data: trendData,
          workload_comparison: workloadComparison,
          priority_distribution: priorityDistribution,
          category_distribution: categoryDistribution,
          upcoming_deadlines: upcomingDeadlines
        },
        time_range: timeRange,
        last_updated: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Assignee dashboard error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch assignee dashboard data',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// PUT endpoint for quick status updates
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { adminId, grievanceId, action, data } = body;

    if (!adminId || !grievanceId || !action) {
      return NextResponse.json(
        { success: false, error: 'Admin ID, Grievance ID, and action are required' },
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

    // Verify admin has access to this grievance
    const { data: grievance, error: checkError } = await supabaseAdmin
      .from('grievances')
      .select('assigned_to, status, priority')
      .eq('id', grievanceId)
      .single();

    if (checkError || !grievance) {
      return NextResponse.json(
        { success: false, error: 'Grievance not found' },
        { status: 404 }
      );
    }

    if (grievance.assigned_to !== adminId) {
      return NextResponse.json(
        { success: false, error: 'Not authorized to update this grievance' },
        { status: 403 }
      );
    }

    let updateData = {
      updated_at: new Date().toISOString()
    };

    let activityType = 'grievance_updated';
    let activityDescription = 'Grievance updated';

    // Handle different actions
    switch (action) {
      case 'start_progress':
        updateData.status = 'in_progress';
        activityType = 'grievance_status_changed';
        activityDescription = 'Started working on grievance';
        break;
        
      case 'resolve':
        updateData.status = 'resolved';
        updateData.resolved_at = new Date().toISOString();
        if (data.resolution) {
          updateData.resolution = data.resolution;
        }
        activityType = 'grievance_resolved';
        activityDescription = 'Grievance resolved';
        break;
        
      case 'update_priority':
        updateData.priority = data.priority;
        activityType = 'grievance_priority_changed';
        activityDescription = `Priority changed from ${grievance.priority} to ${data.priority}`;
        break;
        
      case 'set_deadline':
        updateData.expected_resolution_date = data.deadline;
        activityType = 'deadline_updated';
        activityDescription = `Deadline set to ${data.deadline}`;
        break;
        
      case 'add_note':
        // Don't update the grievance, just add activity
        activityType = 'system_note_added';
        activityDescription = `Added note: ${data.note}`;
        break;
        
      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action' },
          { status: 400 }
        );
    }

    // Update grievance if needed
    if (action !== 'add_note') {
      const { error: updateError } = await supabaseAdmin
        .from('grievances')
        .update(updateData)
        .eq('id', grievanceId);

      if (updateError) {
        throw updateError;
      }
    }

    // Log activity
    try {
      await supabaseAdmin.rpc('log_grievance_activity', {
        p_grievance_id: grievanceId,
        p_activity_type: activityType,
        p_visibility: 'public',
        p_actor_type: 'admin',
        p_actor_id: adminId,
        p_actor_name: 'Admin',
        p_action_description: activityDescription,
        p_action_details: data || {}
      });
    } catch (logError) {
      console.log('Activity logging failed:', logError);
    }

    return NextResponse.json({
      success: true,
      message: 'Grievance updated successfully',
      data: { action, grievanceId, updates: updateData }
    });

  } catch (error) {
    console.error('Assignee update error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to update grievance',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 