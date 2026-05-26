import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// GET - Get all communications for a grievance
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const grievanceId = id;
    
    console.log('🔍 Fetching communications for grievance:', grievanceId);
    
    if (!grievanceId) {
      console.error('❌ Missing grievance ID');
      return NextResponse.json({ error: 'Grievance ID is required' }, { status: 400 });
    }

    // First, check if the grievance exists
    const { data: grievance, error: grievanceError } = await supabaseAdmin
      .from('grievances')
      .select('id, student_id')
      .eq('id', grievanceId)
      .single();

    if (grievanceError) {
      console.error('❌ Error checking grievance existence:', grievanceError);
      return NextResponse.json({ error: 'Grievance not found' }, { status: 404 });
    }

    console.log('✅ Grievance found:', grievance);

    // Check if grievance_communications table exists
    const { data: tableCheck, error: tableError } = await supabaseAdmin
      .from('grievance_communications')
      .select('id')
      .limit(1);

    if (tableError) {
      console.error('❌ Error accessing grievance_communications table:', tableError);
      return NextResponse.json({ 
        error: 'Database table error', 
        details: tableError.message 
      }, { status: 500 });
    }

    console.log('✅ grievance_communications table accessible');

    const { data, error } = await supabaseAdmin
      .from('grievance_communications')
      .select('*')
      .eq('grievance_id', grievanceId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('❌ Error fetching grievance communications:', error);
      return NextResponse.json({ 
        error: 'Failed to fetch communications',
        details: error.message 
      }, { status: 500 });
    }

    console.log('✅ Successfully fetched communications:', data?.length || 0, 'records');
    return NextResponse.json(data);
  } catch (error) {
    console.error('❌ Unexpected error in GET /api/admin/grievances/[id]/communications:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// POST - Add new communication to a grievance
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const grievanceId = id;
    const body = await request.json();
    
    if (!grievanceId) {
      return NextResponse.json({ error: 'Grievance ID is required' }, { status: 400 });
    }

    const {
      sender_id,
      sender_type = 'admin',
      recipient_id,
      recipient_type = 'student',
      message,
      communication_type = 'comment',
      is_internal = false,
      attachments = []
    } = body;

    if (!sender_id || !recipient_id || !message) {
      return NextResponse.json({ 
        error: 'Missing required fields: sender_id, recipient_id, message' 
      }, { status: 400 });
    }

    // Verify the grievance exists
    const { data: grievance, error: grievanceError } = await supabaseAdmin
      .from('grievances')
      .select('id, student_id, assigned_to')
      .eq('id', grievanceId)
      .single();

    if (grievanceError || !grievance) {
      return NextResponse.json({ error: 'Grievance not found' }, { status: 404 });
    }

    // Create the communication
    const { data, error } = await supabaseAdmin
      .from('grievance_communications')
      .insert({
        grievance_id: grievanceId,
        sender_id,
        sender_type,
        recipient_id,
        recipient_type,
        message: message.trim(),
        communication_type,
        is_internal,
        attachments
      })
      .select('*')
      .single();

    if (error) {
      console.error('Error creating communication:', error);
      return NextResponse.json({ error: 'Failed to create communication' }, { status: 500 });
    }

    // Update grievance's updated_at timestamp
    await supabaseAdmin
      .from('grievances')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', grievanceId);

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/admin/grievances/[id]/communications:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT - Mark communication as read
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const grievanceId = id;
    const body = await request.json();
    
    const { communication_id, read_by } = body;

    if (!communication_id || !read_by) {
      return NextResponse.json({ 
        error: 'Missing required fields: communication_id, read_by' 
      }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('grievance_communications')
      .update({ 
        read_at: new Date().toISOString(),
        read_by 
      })
      .eq('id', communication_id)
      .eq('grievance_id', grievanceId)
      .select()
      .single();

    if (error) {
      console.error('Error marking communication as read:', error);
      return NextResponse.json({ error: 'Failed to mark as read' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in PUT /api/admin/grievances/[id]/communications:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 