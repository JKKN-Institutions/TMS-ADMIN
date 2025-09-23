import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    const { searchParams } = new URL(request.url);
    
    const format = searchParams.get('format') || 'csv';
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    const category = searchParams.get('category');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');

    // Build query with filters
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
      .order('created_at', { ascending: false });

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
    if (dateFrom) {
      query = query.gte('created_at', dateFrom);
    }
    if (dateTo) {
      query = query.lte('created_at', dateTo);
    }

    const { data: bugReports, error } = await query;

    if (error) {
      console.error('Error fetching bug reports for export:', error);
      return NextResponse.json(
        { error: 'Failed to fetch bug reports' },
        { status: 500 }
      );
    }

    if (format === 'csv') {
      return exportToCSV(bugReports || []);
    } else if (format === 'json') {
      return exportToJSON(bugReports || []);
    } else {
      return NextResponse.json(
        { error: 'Unsupported format. Use csv or json.' },
        { status: 400 }
      );
    }

  } catch (error) {
    console.error('Error in bug reports export API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function exportToCSV(bugReports: any[]) {
  const headers = [
    'ID',
    'Title',
    'Description',
    'Category',
    'Priority',
    'Status',
    'Reporter Name',
    'Reporter Email',
    'Reporter Type',
    'Browser Info',
    'Device Info',
    'Screen Resolution',
    'Page URL',
    'Created At',
    'Updated At',
    'Resolved At',
    'Resolution Notes'
  ];

  const csvRows = [
    headers.join(','),
    ...bugReports.map(bug => [
      bug.id,
      `"${(bug.title || '').replace(/"/g, '""')}"`,
      `"${(bug.description || '').replace(/"/g, '""')}"`,
      bug.category || '',
      bug.priority || '',
      bug.status || '',
      `"${(bug.reporter_name || '').replace(/"/g, '""')}"`,
      bug.reporter_email || '',
      bug.reporter_type || '',
      `"${(bug.browser_info || '').replace(/"/g, '""')}"`,
      `"${(bug.device_info || '').replace(/"/g, '""')}"`,
      bug.screen_resolution || '',
      `"${(bug.page_url || '').replace(/"/g, '""')}"`,
      bug.created_at || '',
      bug.updated_at || '',
      bug.resolved_at || '',
      `"${(bug.resolution_notes || '').replace(/"/g, '""')}"`
    ].join(','))
  ];

  const csvContent = csvRows.join('\n');
  const timestamp = new Date().toISOString().split('T')[0];
  
  return new NextResponse(csvContent, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="bug-reports-${timestamp}.csv"`
    }
  });
}

function exportToJSON(bugReports: any[]) {
  const exportData = {
    exportedAt: new Date().toISOString(),
    totalRecords: bugReports.length,
    bugReports: bugReports.map(bug => ({
      id: bug.id,
      title: bug.title,
      description: bug.description,
      category: bug.category,
      priority: bug.priority,
      status: bug.status,
      reporter: {
        id: bug.reported_by,
        name: bug.reporter_name,
        email: bug.reporter_email,
        type: bug.reporter_type
      },
      technicalInfo: {
        browserInfo: bug.browser_info,
        deviceInfo: bug.device_info,
        screenResolution: bug.screen_resolution,
        pageUrl: bug.page_url,
        userAgent: bug.user_agent
      },
      timestamps: {
        createdAt: bug.created_at,
        updatedAt: bug.updated_at,
        resolvedAt: bug.resolved_at
      },
      resolution: {
        assignedTo: bug.assigned_to,
        resolvedBy: bug.resolved_by,
        resolutionNotes: bug.resolution_notes
      },
      metadata: {
        tags: bug.tags,
        isDuplicate: bug.is_duplicate,
        duplicateOf: bug.duplicate_of,
        screenshotUrl: bug.screenshot_url
      }
    }))
  };

  const timestamp = new Date().toISOString().split('T')[0];
  
  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="bug-reports-${timestamp}.json"`
    }
  });
}
