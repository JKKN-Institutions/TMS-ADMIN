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

    // Get all bug reports for analysis
    const { data: bugReports, error: reportsError } = await supabase
      .from('bug_reports')
      .select('reporter_email, category, priority, status, created_at');

    if (reportsError) {
      console.error('Error fetching bug reports for stats:', reportsError);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch bug reports' },
        { status: 500 }
      );
    }

    // Calculate statistics
    const uniqueHunters = new Set(bugReports.map(bug => bug.reporter_email)).size;
    const totalReports = bugReports.length;

    // Calculate points awarded
    const totalPoints = bugReports.reduce((sum, bug) => {
      switch (bug.priority) {
        case 'critical': return sum + 50;
        case 'high': return sum + 30;
        case 'medium': return sum + 15;
        default: return sum + 5;
      }
    }, 0);

    // Active hunters this month
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const activeThisMonth = new Set(
      bugReports
        .filter(bug => new Date(bug.created_at) >= monthStart)
        .map(bug => bug.reporter_email)
    ).size;

    // Top categories
    const categoryCount = bugReports.reduce((acc, bug) => {
      acc[bug.category] = (acc[bug.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const topCategories = Object.entries(categoryCount)
      .map(([category, count]) => ({
        category,
        count,
        percentage: Math.round((count / totalReports) * 100)
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Monthly trend (last 6 months)
    const monthlyTrend = [];
    for (let i = 5; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      
      const monthReports = bugReports.filter(bug => {
        const reportDate = new Date(bug.created_at);
        return reportDate >= monthStart && reportDate <= monthEnd;
      });

      const monthHunters = new Set(monthReports.map(bug => bug.reporter_email)).size;

      monthlyTrend.push({
        month: date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' }),
        reports: monthReports.length,
        hunters: monthHunters
      });
    }

    const stats = {
      total_hunters: uniqueHunters,
      total_reports: totalReports,
      total_points_awarded: totalPoints,
      active_hunters_month: activeThisMonth,
      top_categories: topCategories,
      monthly_trend: monthlyTrend
    };

    return NextResponse.json({
      success: true,
      stats: stats
    });

  } catch (error) {
    console.error('Error in bug bounty stats fetch:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

