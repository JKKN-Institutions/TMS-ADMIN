import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// PUT - Mark notification as read for admin
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    const { adminId } = body;

    if (!adminId) {
      return NextResponse.json({ error: 'Admin ID is required' }, { status: 400 });
    }

    // Verify admin user
    const { data: admin, error: adminError } = await supabase
      .from('admin_users')
      .select('id')
      .eq('id', adminId)
      .single();

    if (adminError || !admin) {
      return NextResponse.json({ error: 'Invalid admin user' }, { status: 403 });
    }

    // Get current notification
    const { data: notification, error: fetchError } = await supabase
      .from('notifications')
      .select('read_by')
      .eq('id', id)
      .single();

    if (fetchError || !notification) {
      console.error('Error fetching notification:', fetchError);
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
    }

    // Check if already read
    const currentReadBy = notification.read_by || [];
    if (currentReadBy.includes(adminId)) {
      return NextResponse.json({ 
        success: true, 
        message: 'Notification already marked as read' 
      });
    }

    // Update read_by array
    const { error } = await supabase
      .from('notifications')
      .update({ 
        read_by: [...currentReadBy, adminId] 
      })
      .eq('id', id);

    if (error) {
      console.error('Error marking notification as read:', error);
      return NextResponse.json({ error: 'Failed to mark notification as read' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Notification marked as read' 
    });

  } catch (error) {
    console.error('Error in admin notification read PUT:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 