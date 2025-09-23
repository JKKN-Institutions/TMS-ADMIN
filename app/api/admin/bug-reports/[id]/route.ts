import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { id } = params;

    const { data: bugReport, error } = await supabase
      .from('bug_reports')
      .select(`
        *,
        reporter:reported_by(
          id,
          full_name,
          email
        ),
        assigned_admin:assigned_to(
          id,
          name,
          email
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching bug report:', error);
      return NextResponse.json(
        { error: 'Bug report not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ bugReport });

  } catch (error) {
    console.error('Error in bug report GET API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { id } = params;
    const body = await request.json();

    const {
      status,
      priority,
      assigned_to,
      resolution_notes,
      resolved_at
    } = body;

    // Build update object
    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    if (status !== undefined) updateData.status = status;
    if (priority !== undefined) updateData.priority = priority;
    if (assigned_to !== undefined) updateData.assigned_to = assigned_to;
    if (resolution_notes !== undefined) updateData.resolution_notes = resolution_notes;
    if (resolved_at !== undefined) updateData.resolved_at = resolved_at;

    const { data: bugReport, error } = await supabase
      .from('bug_reports')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating bug report:', error);
      return NextResponse.json(
        { error: 'Failed to update bug report' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'Bug report updated successfully',
      bugReport
    });

  } catch (error) {
    console.error('Error in bug report PATCH API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { id } = params;

    // First, delete associated screenshots if any
    const { data: bugReport } = await supabase
      .from('bug_reports')
      .select('screenshot_url')
      .eq('id', id)
      .single();

    if (bugReport?.screenshot_url) {
      // Extract filename from URL and delete from storage
      const filename = bugReport.screenshot_url.split('/').pop();
      if (filename) {
        await supabase.storage
          .from('bug-screenshots')
          .remove([filename]);
      }
    }

    // Delete the bug report
    const { error } = await supabase
      .from('bug_reports')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting bug report:', error);
      return NextResponse.json(
        { error: 'Failed to delete bug report' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'Bug report deleted successfully'
    });

  } catch (error) {
    console.error('Error in bug report DELETE API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
