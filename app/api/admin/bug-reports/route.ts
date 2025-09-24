import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const adminId = searchParams.get('adminId');
    const status = searchParams.get('status');
    const severity = searchParams.get('severity');
    const category = searchParams.get('category');
    const assignedTo = searchParams.get('assignedTo');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');
    const search = searchParams.get('search');

    // Verify admin permissions
    if (!adminId) {
      return NextResponse.json(
        { success: false, error: 'Admin ID is required' },
        { status: 400 }
      );
    }

    const { data: admin, error: adminError } = await supabase
      .from('admin_users')
      .select('id, role, is_active')
      .eq('id', adminId)
      .single();

    if (adminError || !admin || !admin.is_active) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Build query
    let query = supabase
      .from('bug_reports')
      .select(`
        *,
        bug_comments(
          id,
          comment,
          is_internal,
          author_type,
          author_name,
          created_at
        )
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (status) {
      query = query.eq('status', status);
    }
    if (severity) {
      query = query.eq('severity', severity);
    }
    if (category) {
      query = query.eq('category', category);
    }
    if (assignedTo) {
      query = query.eq('assigned_to', assignedTo);
    }
    if (search) {
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
    }

    const { data: bugReports, error } = await query;

    if (error) {
      console.error('Error fetching bug reports:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch bug reports' },
        { status: 500 }
      );
    }

    // Get summary statistics (calculated manually since view doesn't exist)
    const { data: statsData, error: statsError } = await supabase
      .from('bug_reports')
      .select('status, priority, created_at, resolved_at');
    
    let stats = {
      total_bugs: 0,
      open_bugs: 0,
      in_progress_bugs: 0,
      resolved_bugs: 0,
      closed_bugs: 0,
      critical_bugs: 0,
      high_severity_bugs: 0,
      urgent_bugs: 0,
      avg_resolution_time_hours: 0
    };
    
    if (statsData && !statsError) {
      stats.total_bugs = statsData.length;
      stats.open_bugs = statsData.filter(b => b.status === 'open').length;
      stats.in_progress_bugs = statsData.filter(b => b.status === 'in_progress').length;
      stats.resolved_bugs = statsData.filter(b => b.status === 'resolved').length;
      stats.closed_bugs = statsData.filter(b => b.status === 'closed').length;
      stats.critical_bugs = statsData.filter(b => b.priority === 'critical').length;
      stats.high_severity_bugs = statsData.filter(b => b.priority === 'high').length;
      stats.urgent_bugs = statsData.filter(b => b.priority === 'critical' || b.priority === 'high').length;
      
      // Calculate average resolution time
      const resolvedBugs = statsData.filter(b => b.resolved_at && b.created_at);
      if (resolvedBugs.length > 0) {
        const totalHours = resolvedBugs.reduce((sum, bug) => {
          const createdAt = new Date(bug.created_at);
          const resolvedAt = new Date(bug.resolved_at);
          return sum + (resolvedAt - createdAt) / (1000 * 60 * 60);
        }, 0);
        stats.avg_resolution_time_hours = totalHours / resolvedBugs.length;
      }
    }

    return NextResponse.json({
      success: true,
      bugReports: bugReports || [],
      stats: stats || {
        total_bugs: 0,
        open_bugs: 0,
        in_progress_bugs: 0,
        resolved_bugs: 0,
        closed_bugs: 0,
        critical_bugs: 0,
        high_severity_bugs: 0,
        urgent_bugs: 0,
        avg_resolution_time_hours: 0
      },
      pagination: {
        limit,
        offset,
        hasMore: (bugReports?.length || 0) === limit
      }
    });

  } catch (error) {
    console.error('Error in admin bug reports fetch:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { adminId, action, bugReportId, ...actionData } = body;

    // Verify admin permissions
    if (!adminId) {
      return NextResponse.json(
        { success: false, error: 'Admin ID is required' },
        { status: 400 }
      );
    }

    const { data: admin, error: adminError } = await supabase
      .from('admin_users')
      .select('id, name, role, is_active')
      .eq('id', adminId)
      .single();

    if (adminError || !admin || !admin.is_active) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    switch (action) {
      case 'update_status':
        return await updateBugStatus(bugReportId, actionData.status, actionData.resolution_notes, admin);
      
      case 'assign_bug':
        return await assignBug(bugReportId, actionData.assigned_to, admin);
      
      case 'add_comment':
        return await addComment(bugReportId, actionData.comment, actionData.is_internal, admin);
      
      case 'update_priority':
        return await updatePriority(bugReportId, actionData.priority, admin);
      
      case 'add_labels':
        return await addLabels(bugReportId, actionData.labels, admin);
      
      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action' },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error('Error in admin bug report action:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Helper functions
async function updateBugStatus(bugReportId: string, status: string, resolution_notes: string, admin: any) {
  const updateData: any = {
    status,
    updated_at: new Date().toISOString()
  };

  if (resolution_notes) {
    updateData.resolution_notes = resolution_notes;
  }

  if (status === 'resolved') {
    updateData.resolved_at = new Date().toISOString();
  } else if (status === 'closed') {
    updateData.closed_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('bug_reports')
    .update(updateData)
    .eq('id', bugReportId)
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to update bug status' },
      { status: 500 }
    );
  }

  // Note: Status history tracking would go here when bug_status_history table is created
  console.log(`Bug ${bugReportId} status changed to ${status} by ${admin.name}`);

  return NextResponse.json({
    success: true,
    message: 'Bug status updated successfully',
    bugReport: data
  });
}

async function assignBug(bugReportId: string, assigned_to: string, admin: any) {
  const { data, error } = await supabase
    .from('bug_reports')
    .update({
      assigned_to,
      assigned_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', bugReportId)
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to assign bug' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    message: 'Bug assigned successfully',
    bugReport: data
  });
}

async function addComment(bugReportId: string, comment: string, is_internal: boolean, admin: any) {
  const { data, error } = await supabase
    .from('bug_comments')
    .insert({
      bug_report_id: bugReportId,
      comment: comment,
      is_internal,
      author_type: 'admin',
      author_id: admin.id,
      author_name: admin.name
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to add comment' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    message: 'Comment added successfully',
    comment: data
  });
}

async function updatePriority(bugReportId: string, priority: string, admin: any) {
  const { data, error } = await supabase
    .from('bug_reports')
    .update({
      priority,
      updated_at: new Date().toISOString()
    })
    .eq('id', bugReportId)
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to update priority' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    message: 'Priority updated successfully',
    bugReport: data
  });
}

async function addLabels(bugReportId: string, labels: string[], admin: any) {
  // Note: Label management would go here when bug_labels and bug_report_labels tables are created
  console.log(`Bug ${bugReportId} labels would be updated to:`, labels, `by ${admin.name}`);

  return NextResponse.json({
    success: true,
    message: 'Labels feature not yet implemented - database tables needed'
  });
}

