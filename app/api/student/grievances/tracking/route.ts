import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// GET endpoint for student grievance tracking
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('studentId');
    const grievanceId = searchParams.get('grievanceId');
    const includeHistory = searchParams.get('includeHistory') === 'true';

    if (!studentId) {
      return NextResponse.json(
        { success: false, error: 'Student ID is required' },
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

    // Get student info
    const { data: studentInfo, error: studentError } = await supabaseAdmin
      .from('students')
      .select('id, student_name, email, roll_number')
      .eq('id', studentId)
      .single();

    if (studentError || !studentInfo) {
      return NextResponse.json(
        { success: false, error: 'Student not found' },
        { status: 404 }
      );
    }

    // Build query based on whether specific grievance is requested
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
        resolved_at,
        assigned_to,
        route_id,
        driver_name,
        resolution
      `)
      .eq('student_id', studentId);

    if (grievanceId) {
      query = query.eq('id', grievanceId);
    }

    query = query.order('created_at', { ascending: false });

    const { data: grievances, error: grievancesError } = await query;

    if (grievancesError) {
      console.error('Grievances query error:', grievancesError);
      throw grievancesError;
    }

    // Enrich grievances with additional data
    const enrichedGrievances = await Promise.all(
      grievances.map(async (grievance) => {
        let assigneeInfo = null;
        let routeInfo = null;
        let activityTimeline = [];
        let communications = [];

        // Get assignee info
        if (grievance.assigned_to) {
          try {
            const { data: assignee } = await supabaseAdmin
              .from('admin_users')
              .select('id, name, email, role')
              .eq('id', grievance.assigned_to)
              .single();
            assigneeInfo = assignee;
          } catch (err) {
            console.log('Error fetching assignee info:', err);
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

        // Get activity timeline (student-visible activities)
        if (includeHistory) {
          try {
            const { data: activities } = await supabaseAdmin
              .from('grievance_activity_log')
              .select('*')
              .eq('grievance_id', grievance.id)
              .in('visibility', ['public', 'system'])
              .order('created_at', { ascending: false });
            
            activityTimeline = activities?.map(activity => ({
              id: activity.id,
              type: activity.activity_type,
              actor: activity.actor_name,
              description: activity.action_description,
              timestamp: activity.created_at,
              is_milestone: activity.is_milestone,
              details: activity.action_details
            })) || [];
          } catch (err) {
            console.log('Error fetching activity timeline:', err);
          }
        }

        // Calculate status metrics
        const now = new Date();
        const createdAt = new Date(grievance.created_at);
        const ageHours = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60));
        const ageDays = Math.floor(ageHours / 24);

        let statusInfo = {
          current_status: grievance.status,
          age_hours: ageHours,
          age_days: ageDays,
          is_overdue: false,
          expected_resolution: grievance.expected_resolution_date,
          resolved_at: grievance.resolved_at,
          response_time_hours: null,
          next_update_expected: null
        };

        if (grievance.resolved_at) {
          const resolvedAt = new Date(grievance.resolved_at);
          statusInfo.response_time_hours = Math.floor((resolvedAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60));
        }

        if (grievance.expected_resolution_date) {
          const expectedDate = new Date(grievance.expected_resolution_date);
          statusInfo.is_overdue = expectedDate < now && grievance.status !== 'resolved';
          
          if (grievance.status !== 'resolved') {
            statusInfo.next_update_expected = expectedDate.toISOString();
          }
        }

        // Get estimated resolution time if not resolved
        let estimatedResolution = null;
        if (grievance.status !== 'resolved') {
          // Simple estimation based on priority and current workload
          const priorityMultiplier = {
            'urgent': 0.5,
            'high': 1,
            'medium': 2,
            'low': 3
          };
          
          const baseHours = 24;
          const estimatedHours = baseHours * (priorityMultiplier[grievance.priority] || 2);
          const estimatedDate = new Date(createdAt.getTime() + estimatedHours * 60 * 60 * 1000);
          
          estimatedResolution = {
            estimated_hours: estimatedHours,
            estimated_date: estimatedDate.toISOString(),
            confidence: grievance.assigned_to ? 'high' : 'medium'
          };
        }

        return {
          ...grievance,
          assignee: assigneeInfo,
          route: routeInfo,
          status_info: statusInfo,
          estimated_resolution: estimatedResolution,
          activity_timeline: activityTimeline,
          communications: communications,
          // Student-friendly status descriptions
          status_display: {
            'open': 'Submitted - Awaiting Assignment',
            'in_progress': 'In Progress - Being Worked On',
            'resolved': 'Resolved - Completed',
            'closed': 'Closed - No Further Action'
          }[grievance.status] || grievance.status
        };
      })
    );

    // Calculate student grievance statistics
    const allStudentGrievances = enrichedGrievances;
    const stats = {
      total_grievances: allStudentGrievances.length,
      open_grievances: allStudentGrievances.filter(g => g.status === 'open').length,
      in_progress_grievances: allStudentGrievances.filter(g => g.status === 'in_progress').length,
      resolved_grievances: allStudentGrievances.filter(g => g.status === 'resolved').length,
      overdue_grievances: allStudentGrievances.filter(g => g.status_info.is_overdue).length,
      avg_resolution_time: 0,
      satisfaction_rating: null // Could be implemented later
    };

    // Calculate average resolution time
    const resolvedWithTime = allStudentGrievances.filter(g => g.status_info.response_time_hours !== null);
    if (resolvedWithTime.length > 0) {
      stats.avg_resolution_time = Math.round(
        resolvedWithTime.reduce((sum, g) => sum + g.status_info.response_time_hours, 0) / resolvedWithTime.length
      );
    }

    // Get recent updates across all grievances
    const recentUpdates = [];
    for (const grievance of allStudentGrievances.slice(0, 5)) {
      if (grievance.activity_timeline.length > 0) {
        recentUpdates.push({
          grievance_id: grievance.id,
          subject: grievance.subject,
          update: grievance.activity_timeline[0], // Most recent update
          timestamp: grievance.activity_timeline[0].timestamp
        });
      }
    }

    // Sort recent updates by timestamp
    recentUpdates.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Get priority distribution
    const priorityDistribution = {
      urgent: allStudentGrievances.filter(g => g.priority === 'urgent').length,
      high: allStudentGrievances.filter(g => g.priority === 'high').length,
      medium: allStudentGrievances.filter(g => g.priority === 'medium').length,
      low: allStudentGrievances.filter(g => g.priority === 'low').length
    };

    // Get category distribution
    const categoryDistribution = {};
    allStudentGrievances.forEach(g => {
      categoryDistribution[g.category] = (categoryDistribution[g.category] || 0) + 1;
    });

    return NextResponse.json({
      success: true,
      data: {
        student_info: studentInfo,
        grievances: enrichedGrievances,
        statistics: stats,
        recent_updates: recentUpdates,
        analytics: {
          priority_distribution: priorityDistribution,
          category_distribution: categoryDistribution
        },
        last_updated: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Student grievance tracking error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch grievance tracking data',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// POST endpoint for student communications/feedback
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { studentId, grievanceId, type, message, rating } = body;

    if (!studentId || !grievanceId || !type || !message) {
      return NextResponse.json(
        { success: false, error: 'Student ID, Grievance ID, type, and message are required' },
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

    // Verify student owns this grievance
    const { data: grievance, error: checkError } = await supabaseAdmin
      .from('grievances')
      .select('student_id, assigned_to, status')
      .eq('id', grievanceId)
      .single();

    if (checkError || !grievance) {
      return NextResponse.json(
        { success: false, error: 'Grievance not found' },
        { status: 404 }
      );
    }

    if (grievance.student_id !== studentId) {
      return NextResponse.json(
        { success: false, error: 'Not authorized to update this grievance' },
        { status: 403 }
      );
    }

    // Get student info
    const { data: student } = await supabaseAdmin
      .from('students')
      .select('student_name')
      .eq('id', studentId)
      .single();

    let activityType = 'comment_added';
    let activityDescription = `Student added ${type}: ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`;
    let actionDetails = { message, type };

    // Handle different types of student communications
    switch (type) {
      case 'feedback':
        activityType = 'comment_added';
        activityDescription = `Student provided feedback: ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`;
        if (rating) {
          actionDetails.rating = rating;
          activityDescription += ` (Rating: ${rating}/5)`;
        }
        break;
        
      case 'update_request':
        activityType = 'comment_added';
        activityDescription = `Student requested update: ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`;
        break;
        
      case 'additional_info':
        activityType = 'comment_added';
        activityDescription = `Student provided additional information: ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`;
        break;
        
      case 'satisfaction_rating':
        activityType = 'comment_added';
        activityDescription = `Student rated resolution: ${rating}/5`;
        if (message) {
          activityDescription += ` - ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`;
        }
        actionDetails.rating = rating;
        break;
        
      default:
        activityType = 'comment_added';
        activityDescription = `Student comment: ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`;
    }

    // Log the activity
    try {
      await supabaseAdmin.rpc('log_grievance_activity', {
        p_grievance_id: grievanceId,
        p_activity_type: activityType,
        p_visibility: 'public',
        p_actor_type: 'student',
        p_actor_id: studentId,
        p_actor_name: student?.student_name || 'Student',
        p_action_description: activityDescription,
        p_action_details: actionDetails
      });
    } catch (logError) {
      console.log('Activity logging failed:', logError);
    }

    // If this is a satisfaction rating and the grievance is resolved, update the grievance
    if (type === 'satisfaction_rating' && grievance.status === 'resolved' && rating) {
      try {
        await supabaseAdmin
          .from('grievances')
          .update({
            satisfaction_rating: rating,
            satisfaction_feedback: message,
            updated_at: new Date().toISOString()
          })
          .eq('id', grievanceId);
      } catch (updateError) {
        console.log('Failed to update satisfaction rating:', updateError);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Communication recorded successfully',
      data: {
        grievance_id: grievanceId,
        type: type,
        message: message,
        rating: rating,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Student communication error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to record communication',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 