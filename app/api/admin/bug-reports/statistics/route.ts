import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    const { searchParams } = new URL(request.url);
    const timeRange = searchParams.get('timeRange') || 'month';

    // Calculate date range based on timeRange
    const now = new Date();
    let startDate: Date;
    
    switch (timeRange) {
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'quarter':
        const quarterStart = Math.floor(now.getMonth() / 3) * 3;
        startDate = new Date(now.getFullYear(), quarterStart, 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    // Get all bug reports
    const { data: allBugs, error: allBugsError } = await supabase
      .from('bug_reports')
      .select('*')
      .order('created_at', { ascending: false });

    if (allBugsError) {
      console.error('Error fetching all bugs:', allBugsError);
      return NextResponse.json(
        { error: 'Failed to fetch bug statistics' },
        { status: 500 }
      );
    }

    // Get bugs within time range
    const { data: timeRangeBugs, error: timeRangeError } = await supabase
      .from('bug_reports')
      .select('*')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false });

    if (timeRangeError) {
      console.error('Error fetching time range bugs:', timeRangeError);
      return NextResponse.json(
        { error: 'Failed to fetch bug statistics' },
        { status: 500 }
      );
    }

    const bugs = allBugs || [];
    const recentBugs = timeRangeBugs || [];

    // Calculate basic statistics
    const totalBugs = bugs.length;
    const openBugs = bugs.filter(bug => bug.status === 'open').length;
    const inProgressBugs = bugs.filter(bug => bug.status === 'in_progress').length;
    const resolvedBugs = bugs.filter(bug => bug.status === 'resolved').length;
    const closedBugs = bugs.filter(bug => bug.status === 'closed').length;
    const criticalBugs = bugs.filter(bug => bug.priority === 'critical').length;
    const highPriorityBugs = bugs.filter(bug => bug.priority === 'high').length;

    // Calculate average resolution time
    const resolvedBugsWithTime = bugs.filter(bug => 
      bug.status === 'resolved' && bug.resolved_at && bug.created_at
    );
    
    let averageResolutionTime = 0;
    if (resolvedBugsWithTime.length > 0) {
      const totalResolutionTime = resolvedBugsWithTime.reduce((sum, bug) => {
        const created = new Date(bug.created_at);
        const resolved = new Date(bug.resolved_at);
        return sum + (resolved.getTime() - created.getTime());
      }, 0);
      
      averageResolutionTime = Math.round(
        totalResolutionTime / resolvedBugsWithTime.length / (1000 * 60 * 60)
      ); // Convert to hours
    }

    // Calculate time-based statistics
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const bugsThisWeek = bugs.filter(bug => 
      new Date(bug.created_at) >= weekStart
    ).length;
    
    const bugsThisMonth = bugs.filter(bug => 
      new Date(bug.created_at) >= monthStart
    ).length;

    // Category breakdown
    const categories = ['ui_ux', 'functionality', 'performance', 'security', 'data', 'other'];
    const categoryBreakdown = categories.map(category => {
      const count = bugs.filter(bug => bug.category === category).length;
      return {
        category,
        count,
        percentage: totalBugs > 0 ? (count / totalBugs) * 100 : 0
      };
    }).filter(item => item.count > 0);

    // Priority breakdown
    const priorities = ['low', 'medium', 'high', 'critical'];
    const priorityBreakdown = priorities.map(priority => {
      const count = bugs.filter(bug => bug.priority === priority).length;
      return {
        priority,
        count,
        percentage: totalBugs > 0 ? (count / totalBugs) * 100 : 0
      };
    });

    // Monthly trend (last 6 months)
    const monthlyTrend = [];
    for (let i = 5; i >= 0; i--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const nextMonth = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      
      const monthBugs = bugs.filter(bug => {
        const bugDate = new Date(bug.created_at);
        return bugDate >= monthDate && bugDate < nextMonth;
      });
      
      const monthResolved = monthBugs.filter(bug => 
        bug.status === 'resolved' || bug.status === 'closed'
      );
      
      monthlyTrend.push({
        month: monthDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        bugs: monthBugs.length,
        resolved: monthResolved.length
      });
    }

    const statistics = {
      totalBugs,
      openBugs,
      inProgressBugs,
      resolvedBugs,
      closedBugs,
      criticalBugs,
      highPriorityBugs,
      averageResolutionTime,
      bugsThisWeek,
      bugsThisMonth,
      categoryBreakdown,
      priorityBreakdown,
      monthlyTrend
    };

    return NextResponse.json({
      statistics,
      timeRange,
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in bug statistics API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
