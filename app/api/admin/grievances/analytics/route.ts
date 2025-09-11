import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// GET - Get grievance analytics data
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get('date_from') || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const dateTo = searchParams.get('date_to') || new Date().toISOString().split('T')[0];
    const includeClosed = searchParams.get('include_closed') === 'true';
    const assignedTo = searchParams.get('assigned_to');
    const unassigned = searchParams.get('unassigned') === 'true';

    // Build query for overall statistics
    let query = supabaseAdmin
      .from('grievances')
      .select('status, priority, category, urgency, created_at, resolved_at, assigned_to')
      .gte('created_at', dateFrom)
      .lte('created_at', dateTo + 'T23:59:59');

    // Apply role-based filtering
    if (assignedTo) {
      query = query.eq('assigned_to', assignedTo);
    }
    if (unassigned) {
      query = query.is('assigned_to', null);
    }

    const { data: overall, error: overallError } = await query;

    if (overallError) {
      console.error('Error fetching overall stats:', overallError);
      return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 });
    }

    // Calculate overall metrics
    const total = overall.length;
    const open = overall.filter((g: any) => g.status === 'open').length;
    const inProgress = overall.filter((g: any) => g.status === 'in_progress').length;
    const resolved = overall.filter((g: any) => g.status === 'resolved').length;
    const closed = overall.filter((g: any) => g.status === 'closed').length;
    const unassignedCount = overall.filter((g: any) => !g.assigned_to).length;
    const urgent = overall.filter((g: any) => g.priority === 'urgent').length;
    const high = overall.filter((g: any) => g.priority === 'high').length;
    const resolutionRate = total > 0 ? (resolved / total) * 100 : 0;

    // Calculate overdue (assuming 72 hours SLA for now)
    const now = new Date();
    const overdue = overall.filter((g: any) => {
      if (g.status === 'resolved' || g.status === 'closed') return false;
      const createdAt = new Date(g.created_at);
      const hoursDiff = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
      return hoursDiff > 72;
    }).length;

    // Category breakdown
    const categoryBreakdown = overall.reduce((acc: any, g: any) => {
      acc[g.category] = (acc[g.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Priority breakdown
    const priorityBreakdown = overall.reduce((acc: any, g: any) => {
      acc[g.priority] = (acc[g.priority] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Status breakdown
    const statusBreakdown = overall.reduce((acc: any, g: any) => {
      acc[g.status] = (acc[g.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Resolution time analytics
    const resolvedGrievances = overall.filter((g: any) => g.resolved_at);
    const resolutionTimes = resolvedGrievances.map((g: any) => {
      const created = new Date(g.created_at);
      const resolved = new Date(g.resolved_at);
      return (resolved.getTime() - created.getTime()) / (1000 * 60 * 60); // hours
    });

    const averageResolutionTime = resolutionTimes.length > 0 
      ? resolutionTimes.reduce((sum: any, time: any) => sum + time, 0) / resolutionTimes.length
      : 0;

    // Daily trend data
    const { data: dailyData, error: dailyError } = await supabaseAdmin
      .from('grievance_analytics')
      .select('*')
      .gte('date', dateFrom)
      .lte('date', dateTo)
      .order('date', { ascending: true });

    if (dailyError) {
      console.log('Daily analytics not available, using calculated data');
    }

    // Recent activity
    const { data: recentActivity, error: recentError } = await supabaseAdmin
      .from('grievance_status_history')
      .select(`
        *,
        grievances (
          id,
          subject,
          students (
            student_name,
            roll_number
          )
        ),
        admin_users (
          name,
          role
        )
      `)
      .order('created_at', { ascending: false })
      .limit(10);

    if (recentError) {
      console.log('Recent activity not available');
    }

    // Top assignees
    const { data: assigneeStats, error: assigneeError } = await supabaseAdmin
      .from('grievances')
      .select(`
        assigned_to,
        status,
        admin_users (
          name,
          role
        )
      `)
      .not('assigned_to', 'is', null)
      .gte('created_at', dateFrom)
      .lte('created_at', dateTo + 'T23:59:59');

    const assigneeBreakdown = assigneeStats?.reduce((acc, g) => {
      const assignee = g.admin_users;
      if (assignee) {
        if (!acc[assignee.name]) {
          acc[assignee.name] = {
            name: assignee.name,
            role: assignee.role,
            total: 0,
            resolved: 0,
            pending: 0
          };
        }
        acc[assignee.name].total++;
        if (g.status === 'resolved') {
          acc[assignee.name].resolved++;
        } else if (g.status === 'open' || g.status === 'in_progress') {
          acc[assignee.name].pending++;
        }
      }
      return acc;
    }, {} as Record<string, any>) || {};

    // Monthly trend for the last 12 months
    const monthlyTrend = [];
    for (let i = 11; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const monthStart = new Date(date.getFullYear(), date.getMonth(), 1).toISOString().split('T')[0];
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString().split('T')[0];
      
      const monthlyGrievances = overall.filter(g => {
        const createdDate = g.created_at.split('T')[0];
        return createdDate >= monthStart && createdDate <= monthEnd;
      });

      monthlyTrend.push({
        month: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        total: monthlyGrievances.length,
        resolved: monthlyGrievances.filter(g => g.status === 'resolved').length,
        pending: monthlyGrievances.filter(g => g.status === 'open' || g.status === 'in_progress').length
      });
    }

    const analytics = {
      overall: {
        total,
        open,
        inProgress,
        resolved,
        closed,
        unassigned: unassignedCount,
        urgent,
        high,
        overdue,
        resolutionRate
      },
      breakdown: {
        category: categoryBreakdown,
        priority: priorityBreakdown,
        status: statusBreakdown,
        assignee: Object.values(assigneeBreakdown)
      },
      resolutionTime: {
        average: averageResolutionTime,
        samples: resolutionTimes.length
      },
      trends: {
        daily: dailyData || [],
        monthly: monthlyTrend
      },
      recentActivity: recentActivity || [],
      dateRange: {
        from: dateFrom,
        to: dateTo
      }
    };

    return NextResponse.json(analytics);
  } catch (error) {
    console.error('Error in GET /api/admin/grievances/analytics:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Update analytics data manually
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action = 'refresh', date } = body;

    if (action === 'refresh') {
      const targetDate = date || new Date().toISOString().split('T')[0];
      
      // Calculate analytics for the target date
      const { data: grievances, error: grievanceError } = await supabaseAdmin
        .from('grievances')
        .select('*')
        .eq('created_at::date', targetDate);

      if (grievanceError) {
        console.error('Error fetching grievances for analytics:', grievanceError);
        return NextResponse.json({ error: 'Failed to refresh analytics' }, { status: 500 });
      }

      const totalGrievances = grievances?.length || 0;
      const newGrievances = totalGrievances;
      
      const { data: resolvedToday, error: resolvedError } = await supabaseAdmin
        .from('grievances')
        .select('*')
        .eq('resolved_at::date', targetDate);

      const resolvedGrievances = resolvedToday?.length || 0;

      const { data: pending, error: pendingError } = await supabaseAdmin
        .from('grievances')
        .select('*')
        .in('status', ['open', 'in_progress']);

      const pendingGrievances = pending?.length || 0;

      // Calculate category breakdown
      const categoryBreakdown = grievances?.reduce((acc, g) => {
        acc[g.category] = (acc[g.category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>) || {};

      // Calculate priority breakdown
      const priorityBreakdown = grievances?.reduce((acc, g) => {
        acc[g.priority] = (acc[g.priority] || 0) + 1;
        return acc;
      }, {} as Record<string, number>) || {};

      // Calculate average resolution time
      const resolvedWithTimes = resolvedToday?.filter(g => g.resolved_at && g.created_at);
      const avgResolutionTime = resolvedWithTimes?.length > 0 
        ? resolvedWithTimes.reduce((sum, g) => {
            const created = new Date(g.created_at);
            const resolved = new Date(g.resolved_at);
            return sum + (resolved.getTime() - created.getTime()) / (1000 * 60 * 60);
          }, 0) / resolvedWithTimes.length
        : 0;

      // Insert or update analytics
      const { data, error } = await supabaseAdmin
        .from('grievance_analytics')
        .upsert({
          date: targetDate,
          total_grievances: totalGrievances,
          new_grievances: newGrievances,
          resolved_grievances: resolvedGrievances,
          pending_grievances: pendingGrievances,
          avg_resolution_time: avgResolutionTime > 0 ? `${avgResolutionTime} hours` : null,
          category_breakdown: categoryBreakdown,
          priority_breakdown: priorityBreakdown
        })
        .select();

      if (error) {
        console.error('Error updating analytics:', error);
        return NextResponse.json({ error: 'Failed to update analytics' }, { status: 500 });
      }

      return NextResponse.json({ 
        message: 'Analytics refreshed successfully',
        data: data[0]
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error in POST /api/admin/grievances/analytics:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 