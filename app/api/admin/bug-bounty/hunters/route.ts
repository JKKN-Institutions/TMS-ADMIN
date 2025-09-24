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
    const timeframe = searchParams.get('timeframe') || 'all';
    const category = searchParams.get('category') || 'all';
    const minReports = parseInt(searchParams.get('minReports') || '1');

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

    // Build timeframe filter
    let timeFilter = '';
    const now = new Date();
    if (timeframe === 'month') {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      timeFilter = `created_at >= '${monthStart.toISOString()}'`;
    } else if (timeframe === 'week') {
      const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      timeFilter = `created_at >= '${weekStart.toISOString()}'`;
    }

    // Get bug hunter statistics
    let query = supabase
      .from('bug_reports')
      .select(`
        reporter_email,
        reporter_name,
        reported_by,
        category,
        priority,
        status,
        created_at
      `);

    if (timeFilter) {
      const { data: timeFilteredData, error: timeError } = await supabase
        .from('bug_reports')
        .select('reporter_email, reporter_name, reported_by, category, priority, status, created_at')
        .gte('created_at', timeframe === 'month' 
          ? new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
          : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
        );
      
      if (timeError) {
        console.error('Time filter error:', timeError);
        return NextResponse.json(
          { success: false, error: 'Failed to apply time filter' },
          { status: 500 }
        );
      }
      
      query = { data: timeFilteredData, error: null } as any;
    } else {
      query = await supabase
        .from('bug_reports')
        .select('reporter_email, reporter_name, reported_by, category, priority, status, created_at');
    }

    const { data: bugReports, error } = query as any;

    if (error) {
      console.error('Error fetching bug reports:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch bug reports' },
        { status: 500 }
      );
    }

    // Process data to create hunter leaderboard
    const hunterMap = new Map();

    bugReports.forEach((bug: any) => {
      const email = bug.reporter_email;
      if (!email) return;

      if (!hunterMap.has(email)) {
        hunterMap.set(email, {
          id: bug.reported_by || email,
          name: bug.reporter_name || email.split('@')[0],
          email: email,
          total_bugs: 0,
          open_bugs: 0,
          resolved_bugs: 0,
          critical_bugs: 0,
          high_bugs: 0,
          medium_bugs: 0,
          low_bugs: 0,
          categories: {
            ui_ux: 0,
            functionality: 0,
            performance: 0,
            security: 0,
            other: 0
          },
          join_date: bug.created_at,
          last_report_date: bug.created_at,
          streak_days: 0
        });
      }

      const hunter = hunterMap.get(email);
      hunter.total_bugs++;

      // Count by status
      if (bug.status === 'open') hunter.open_bugs++;
      else if (bug.status === 'resolved') hunter.resolved_bugs++;

      // Count by priority
      if (bug.priority === 'critical') hunter.critical_bugs++;
      else if (bug.priority === 'high') hunter.high_bugs++;
      else if (bug.priority === 'medium') hunter.medium_bugs++;
      else hunter.low_bugs++;

      // Count by category
      if (bug.category in hunter.categories) {
        hunter.categories[bug.category]++;
      } else {
        hunter.categories.other++;
      }

      // Update dates
      if (new Date(bug.created_at) < new Date(hunter.join_date)) {
        hunter.join_date = bug.created_at;
      }
      if (new Date(bug.created_at) > new Date(hunter.last_report_date)) {
        hunter.last_report_date = bug.created_at;
      }
    });

    // Filter by category if specified
    if (category !== 'all') {
      Array.from(hunterMap.values()).forEach((hunter: any) => {
        if (hunter.categories[category] === 0) {
          hunterMap.delete(hunter.email);
        }
      });
    }

    // Convert to array and filter by minimum reports
    let hunters = Array.from(hunterMap.values()).filter((hunter: any) => 
      hunter.total_bugs >= minReports
    );

    // Calculate points and rank
    hunters = hunters.map((hunter: any) => ({
      ...hunter,
      points: (hunter.critical_bugs * 50) + 
              (hunter.high_bugs * 30) + 
              (hunter.medium_bugs * 15) + 
              (hunter.low_bugs * 5)
    }));

    // Sort by points and add ranking
    hunters.sort((a: any, b: any) => b.points - a.points);
    hunters = hunters.map((hunter: any, index: number) => ({
      ...hunter,
      rank: index + 1
    }));

    // Calculate streak days (simplified - just days since last report)
    hunters = hunters.map((hunter: any) => {
      const daysSinceLastReport = Math.floor(
        (new Date().getTime() - new Date(hunter.last_report_date).getTime()) / (1000 * 60 * 60 * 24)
      );
      return {
        ...hunter,
        streak_days: Math.max(0, 7 - daysSinceLastReport) // Simple streak calculation
      };
    });

    return NextResponse.json({
      success: true,
      hunters: hunters,
      total: hunters.length,
      filters: {
        timeframe,
        category,
        minReports
      }
    });

  } catch (error) {
    console.error('Error in bug bounty hunters fetch:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
