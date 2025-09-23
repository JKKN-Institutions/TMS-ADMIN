import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { id } = params;

    const { data: comments, error } = await supabase
      .from('bug_comments')
      .select(`
        *,
        author:author_id(
          id,
          name,
          email
        )
      `)
      .eq('bug_report_id', id)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching bug comments:', error);
      return NextResponse.json(
        { error: 'Failed to fetch comments' },
        { status: 500 }
      );
    }

    return NextResponse.json({ comments: comments || [] });

  } catch (error) {
    console.error('Error in bug comments GET API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { id } = params;
    const body = await request.json();

    const {
      comment,
      is_internal = false,
      author_id,
      author_type,
      author_name
    } = body;

    // Validate required fields
    if (!comment || !author_id || !author_type) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Verify bug report exists
    const { data: bugReport, error: bugError } = await supabase
      .from('bug_reports')
      .select('id')
      .eq('id', id)
      .single();

    if (bugError || !bugReport) {
      return NextResponse.json(
        { error: 'Bug report not found' },
        { status: 404 }
      );
    }

    const { data: newComment, error } = await supabase
      .from('bug_comments')
      .insert({
        bug_report_id: id,
        comment,
        is_internal,
        author_id,
        author_type,
        author_name
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating bug comment:', error);
      return NextResponse.json(
        { error: 'Failed to create comment' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'Comment created successfully',
      comment: newComment
    }, { status: 201 });

  } catch (error) {
    console.error('Error in bug comments POST API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
