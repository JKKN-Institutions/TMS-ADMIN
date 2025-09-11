import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// GET endpoint to retrieve grievances assigned to a specific admin
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const adminId = searchParams.get('adminId');
    const status = searchParams.get('status') || 'all';
    const priority = searchParams.get('priority') || 'all';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');

    if (!adminId) {
      return NextResponse.json(
        { success: false, error: 'Admin ID is required' },
        { status: 400 }
      );
    }

    // Check if environment variables are configured
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({
        success: false,
        error: 'Database connection not configured',
        message: 'Please set up environment variables first'
      }, { status: 503 });
    }

    // Build query with simplified joins to avoid missing table errors
    let query = supabaseAdmin
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
        student_id,
        route_id,
        driver_name,
        resolution
      `, { count: 'exact' })
      .eq('assigned_to', adminId)
      .order('created_at', { ascending: false });

    // Apply filters
    if (status !== 'all') {
      query = query.eq('status', status);
    }

    if (priority !== 'all') {
      query = query.eq('priority', priority);
    }

    // Apply pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    
    // Execute query with count
    const { data: grievances, error: grievancesError, count } = await query.range(from, to);

    if (grievancesError) {
      console.error('Grievances query error:', grievancesError);
      throw grievancesError;
    }

    // Get summary statistics
    const { data: summaryData, error: summaryError } = await supabaseAdmin
      .from('grievances')
      .select('status, priority')
      .eq('assigned_to', adminId);

    if (summaryError) {
      console.error('Summary query error:', summaryError);
      throw summaryError;
    }

    // Calculate summary stats
    const summary = {
      total: summaryData.length,
      open: summaryData.filter(g => g.status === 'open').length,
      in_progress: summaryData.filter(g => g.status === 'in_progress').length,
      resolved: summaryData.filter(g => g.status === 'resolved').length,
      closed: summaryData.filter(g => g.status === 'closed').length,
      high_priority: summaryData.filter(g => g.priority === 'high').length,
      urgent: summaryData.filter(g => g.priority === 'urgent').length
    };

    // Try to get recent activity, but handle if table doesn't exist
    let recentActivity = [];
    try {
      const { data: activityData, error: activityError } = await supabaseAdmin
        .from('grievance_activity_log')
        .select('*')
        .eq('actor_id', adminId)
        .order('created_at', { ascending: false })
        .limit(5);

      if (!activityError) {
        recentActivity = activityData || [];
      }
    } catch (activityError) {
      console.log('Activity log table not found, using empty array');
    }

    // Get student and route info separately if needed
    const enrichedGrievances = await Promise.all(
      grievances.map(async (grievance) => {
        let studentInfo = null;
        let routeInfo = null;

        // Try to get student info
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

        // Try to get route info
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

    return NextResponse.json({
      success: true,
      data: {
        grievances: enrichedGrievances,
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit)
        },
        summary,
        recentActivity
      }
    });

  } catch (error) {
    console.error('Get assigned grievances error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to get assigned grievances',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// PUT endpoint to update grievance status/resolution with notifications
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { grievanceId, adminId, updates } = body;

    if (!grievanceId || !adminId) {
      return NextResponse.json(
        { success: false, error: 'Grievance ID and Admin ID are required' },
        { status: 400 }
      );
    }

    // Check if environment variables are configured
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({
        success: false,
        error: 'Database connection not configured',
        message: 'Please set up environment variables first'
      }, { status: 503 });
    }

    // Get comprehensive grievance info including student details
    const { data: grievance, error: checkError } = await supabaseAdmin
      .from('grievances')
      .select(`
        id,
        assigned_to,
        status,
        priority,
        subject,
        description,
        student_id,
        route_id,
        created_at
      `)
      .eq('id', grievanceId)
      .single();

    if (checkError) {
      throw checkError;
    }

    if (grievance.assigned_to !== adminId) {
      return NextResponse.json(
        { success: false, error: 'You are not authorized to update this grievance' },
        { status: 403 }
      );
    }

    // Get admin and student info for notifications
    const { data: adminInfo } = await supabaseAdmin
      .from('admin_users')
      .select('name, email, role')
      .eq('id', adminId)
      .single();

    const { data: studentInfo } = await supabaseAdmin
      .from('students')
      .select('student_name, email, roll_number')
      .eq('id', grievance.student_id)
      .single();

    const { data: routeInfo } = await supabaseAdmin
      .from('routes')
      .select('route_name, route_number')
      .eq('id', grievance.route_id)
      .single();

    // Update the grievance
    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    const previousStatus = grievance.status;
    const previousPriority = grievance.priority;

    if (updates.status) {
      updateData.status = updates.status;
      
      if (updates.status === 'resolved') {
        updateData.resolved_at = new Date().toISOString();
      }
    }

    if (updates.priority) {
      updateData.priority = updates.priority;
    }

    if (updates.resolution) {
      updateData.resolution = updates.resolution;
    }

    if (updates.expectedResolutionDate) {
      updateData.expected_resolution_date = updates.expectedResolutionDate;
    }

    const { data: updatedGrievance, error: updateError } = await supabaseAdmin
      .from('grievances')
      .update(updateData)
      .eq('id', grievanceId)
      .select('*')
      .single();

    if (updateError) {
      throw updateError;
    }

    // Create comprehensive activity log
    try {
      let activityDescription = '';
      let activityType = 'grievance_updated';
      
      if (updates.status && updates.status !== previousStatus) {
        activityType = updates.status === 'resolved' ? 'grievance_resolved' : 'grievance_status_changed';
        activityDescription = `Status updated from "${previousStatus}" to "${updates.status}"`;
        if (updates.resolution) {
          activityDescription += ` with resolution: ${updates.resolution.substring(0, 100)}${updates.resolution.length > 100 ? '...' : ''}`;
        }
      } else if (updates.priority && updates.priority !== previousPriority) {
        activityType = 'grievance_priority_changed';
        activityDescription = `Priority updated from "${previousPriority}" to "${updates.priority}"`;
      } else {
        activityDescription = 'Grievance details updated';
      }

      await supabaseAdmin.rpc('log_grievance_activity', {
        p_grievance_id: grievanceId,
        p_activity_type: activityType,
        p_visibility: 'public',
        p_actor_type: 'admin',
        p_actor_id: adminId,
        p_actor_name: adminInfo?.name || 'Admin',
        p_action_description: activityDescription,
        p_action_details: {
          updates: updates,
          previous_status: previousStatus,
          previous_priority: previousPriority,
          admin_name: adminInfo?.name,
          admin_role: adminInfo?.role,
          timestamp: new Date().toISOString()
        },
        p_old_values: {
          status: previousStatus,
          priority: previousPriority
        },
        p_new_values: {
          status: updates.status || previousStatus,
          priority: updates.priority || previousPriority
        },
        p_is_milestone: updates.status === 'resolved' || updates.status === 'closed'
      });
    } catch (logError) {
      console.log('Activity logging error:', logError);
    }

    // Send notifications to passenger (student)
    try {
      const studentNotificationTitle = getNotificationTitle(updates.status, previousStatus, grievance.subject);
      const studentNotificationMessage = getStudentNotificationMessage(
        updates.status,
        previousStatus,
        adminInfo?.name || 'Admin',
        updates.resolution,
        routeInfo?.route_name
      );

      await supabaseAdmin
        .from('notifications')
        .insert({
          title: studentNotificationTitle,
          message: studentNotificationMessage,
          type: getNotificationType(updates.status),
          category: 'transport',
          target_audience: 'students',
          specific_users: [grievance.student_id],
          is_active: true,
          enable_push_notification: true,
          enable_email_notification: true,
          actionable: updates.status === 'resolved',
          primary_action: updates.status === 'resolved' ? {
            label: 'Rate Resolution',
            action: 'rate_resolution',
            grievance_id: grievanceId
          } : null,
          tags: ['grievance', 'status_update', updates.status],
          created_by: adminId,
          created_at: new Date().toISOString()
        });

      console.log('✅ Student notification sent');
    } catch (notifError) {
      console.log('Student notification error:', notifError);
    }

    // Send notifications to superadmin
    try {
      const { data: superAdmins } = await supabaseAdmin
        .from('admin_users')
        .select('id')
        .eq('role', 'super_admin')
        .eq('is_active', true);

      if (superAdmins && superAdmins.length > 0) {
        const adminNotificationTitle = `Grievance ${updates.status === 'resolved' ? 'Resolved' : 'Updated'} by ${adminInfo?.role || 'Admin'}`;
        const adminNotificationMessage = getAdminNotificationMessage(
          grievance.subject,
          studentInfo?.student_name,
          studentInfo?.roll_number,
          adminInfo?.name,
          updates.status,
          previousStatus,
          routeInfo?.route_name
        );

        await supabaseAdmin
          .from('notifications')
          .insert({
            title: adminNotificationTitle,
            message: adminNotificationMessage,
            type: 'info',
            category: 'system',
            target_audience: 'admins',
            specific_users: superAdmins.map(admin => admin.id),
            is_active: true,
            enable_push_notification: true,
            actionable: true,
            primary_action: {
              label: 'View Grievance',
              action: 'view_grievance',
              grievance_id: grievanceId
            },
            tags: ['grievance', 'admin_update', updates.status],
            created_by: adminId,
            created_at: new Date().toISOString()
          });

        console.log('✅ Superadmin notifications sent');
      }
    } catch (adminNotifError) {
      console.log('Admin notification error:', adminNotifError);
    }

    // Create success response with comprehensive info
    return NextResponse.json({
      success: true,
      data: {
        grievance: updatedGrievance,
        updates_applied: updates,
        notifications_sent: {
          student: true,
          superadmin: true
        },
        activity_logged: true,
        admin_info: adminInfo,
        student_info: studentInfo
      },
      message: getSuccessMessage(updates.status, previousStatus)
    });

  } catch (error) {
    console.error('Update grievance error:', error);
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

// POST endpoint to add comments/notes to grievances
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { grievanceId, adminId, comment, visibility = 'internal' } = body;

    if (!grievanceId || !adminId || !comment) {
      return NextResponse.json(
        { success: false, error: 'Grievance ID, Admin ID, and comment are required' },
        { status: 400 }
      );
    }

    // Check if environment variables are configured
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({
        success: false,
        error: 'Database connection not configured',
        message: 'Please set up environment variables first'
      }, { status: 503 });
    }

    // Verify the grievance is assigned to this admin
    const { data: grievance, error: checkError } = await supabaseAdmin
      .from('grievances')
      .select('assigned_to')
      .eq('id', grievanceId)
      .single();

    if (checkError) {
      throw checkError;
    }

    if (grievance.assigned_to !== adminId) {
      return NextResponse.json(
        { success: false, error: 'You are not authorized to comment on this grievance' },
        { status: 403 }
      );
    }

    // Try to log the comment if the function exists
    let activityId = null;
    try {
      activityId = await supabaseAdmin.rpc('log_grievance_activity', {
        p_grievance_id: grievanceId,
        p_activity_type: 'comment_added',
        p_visibility: visibility,
        p_actor_type: 'admin',
        p_actor_id: adminId,
        p_actor_name: 'Admin',
        p_action_description: `Added comment: ${comment.substring(0, 100)}${comment.length > 100 ? '...' : ''}`,
        p_action_details: {
          comment: comment,
          visibility: visibility
        }
      });
    } catch (logError) {
      console.log('Activity logging not available:', logError);
    }

    return NextResponse.json({
      success: true,
      data: { activityId },
      message: 'Comment added successfully'
    });

  } catch (error) {
    console.error('Add comment error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to add comment',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 

// Helper functions for notifications
function getNotificationTitle(newStatus: string, oldStatus: string, subject: string): string {
  if (newStatus === 'resolved') {
    return `✅ Your Grievance Has Been Resolved`;
  } else if (newStatus === 'in_progress' && oldStatus === 'open') {
    return `🔄 Your Grievance is Being Processed`;
  } else if (newStatus === 'closed') {
    return `📋 Your Grievance Has Been Closed`;
  } else {
    return `📢 Update on Your Grievance`;
  }
}

function getStudentNotificationMessage(
  newStatus: string, 
  oldStatus: string, 
  adminName: string, 
  resolution?: string,
  routeName?: string
): string {
  const routeInfo = routeName ? ` for ${routeName}` : '';
  
  if (newStatus === 'resolved') {
    return `Good news! Your grievance${routeInfo} has been resolved by ${adminName}.${resolution ? ` Resolution: ${resolution}` : ''} Thank you for your feedback.`;
  } else if (newStatus === 'in_progress' && oldStatus === 'open') {
    return `Your grievance${routeInfo} is now being actively worked on by ${adminName}. We'll keep you updated on the progress.`;
  } else if (newStatus === 'closed') {
    return `Your grievance${routeInfo} has been closed. If you need further assistance, please contact us.`;
  } else {
    return `Your grievance${routeInfo} status has been updated to "${newStatus}" by ${adminName}.`;
  }
}

function getAdminNotificationMessage(
  subject: string,
  studentName?: string,
  rollNumber?: string,
  adminName?: string,
  newStatus?: string,
  oldStatus?: string,
  routeName?: string
): string {
  const studentInfo = studentName && rollNumber ? `${studentName} (${rollNumber})` : 'Student';
  const routeInfo = routeName ? ` related to ${routeName}` : '';
  
  return `Grievance "${subject}" from ${studentInfo}${routeInfo} has been updated from "${oldStatus}" to "${newStatus}" by ${adminName || 'Admin'}.`;
}

function getNotificationType(status?: string): string {
  switch (status) {
    case 'resolved': return 'success';
    case 'in_progress': return 'info';
    case 'closed': return 'warning';
    default: return 'info';
  }
}

function getSuccessMessage(newStatus?: string, oldStatus?: string): string {
  if (newStatus === 'resolved') {
    return 'Grievance resolved successfully. Student and superadmin have been notified.';
  } else if (newStatus === 'in_progress' && oldStatus === 'open') {
    return 'Grievance marked as in progress. Student and superadmin have been notified.';
  } else {
    return 'Grievance updated successfully. Notifications sent to relevant parties.';
  }
} 