import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    
    // Get query parameters for filtering
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    const category = searchParams.get('category');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Build query
    let query = supabase
      .from('bug_reports')
      .select(`
        *,
        reporter:reported_by(
          id,
          full_name,
          email
        )
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (status && status !== 'all') {
      query = query.eq('status', status);
    }
    if (priority && priority !== 'all') {
      query = query.eq('priority', priority);
    }
    if (category && category !== 'all') {
      query = query.eq('category', category);
    }

    const { data: bugReports, error, count } = await query;

    if (error) {
      console.error('Error fetching bug reports:', error);
      return NextResponse.json(
        { error: 'Failed to fetch bug reports' },
        { status: 500 }
      );
    }

    // Get statistics
    const { data: stats } = await supabase
      .from('bug_reports')
      .select('status, priority, category')
      .then(({ data }) => {
        if (!data) return { data: null };
        
        const statusCounts = data.reduce((acc, bug) => {
          acc[bug.status] = (acc[bug.status] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        const priorityCounts = data.reduce((acc, bug) => {
          acc[bug.priority] = (acc[bug.priority] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        const categoryCounts = data.reduce((acc, bug) => {
          acc[bug.category] = (acc[bug.category] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        return {
          data: {
            statusCounts,
            priorityCounts,
            categoryCounts,
            total: data.length
          }
        };
      });

    return NextResponse.json({
      bugReports,
      stats: stats || {
        statusCounts: {},
        priorityCounts: {},
        categoryCounts: {},
        total: 0
      },
      pagination: {
        total: count || 0,
        limit,
        offset,
        hasMore: (count || 0) > offset + limit
      }
    });

  } catch (error) {
    console.error('Error in bug reports API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const body = await request.json();

    const {
      title,
      description,
      category,
      priority,
      reported_by,
      reporter_type,
      reporter_email,
      reporter_name,
      browser_info,
      device_info,
      screen_resolution,
      page_url,
      user_agent,
      screenshot_url
    } = body;

    // Validate required fields
    if (!title || !description || !reported_by) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const { data: bugReport, error } = await supabase
      .from('bug_reports')
      .insert({
        title,
        description,
        category: category || 'other',
        priority: priority || 'medium',
        status: 'open',
        reported_by,
        reporter_type: reporter_type || 'student',
        reporter_email,
        reporter_name,
        browser_info,
        device_info,
        screen_resolution,
        page_url,
        user_agent,
        screenshot_url
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating bug report:', error);
      return NextResponse.json(
        { error: 'Failed to create bug report' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'Bug report created successfully',
      bugReport
    }, { status: 201 });

  } catch (error) {
    console.error('Error in bug reports POST API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
