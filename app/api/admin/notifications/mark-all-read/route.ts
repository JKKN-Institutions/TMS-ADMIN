import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// PUT - Mark all notifications as read for admin
export async function PUT(request: NextRequest) {
  try {
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

    // Get all unread notifications for the admin
    const { data: notifications, error: fetchError } = await supabase
      .from('notifications')
      .select('id, read_by')
      .eq('is_active', true)
      .or(`target_audience.in.(all,admins),specific_users.cs.{${adminId}}`)
      .or('expires_at.is.null,expires_at.gt.now()');

    if (fetchError) {
      console.error('Error fetching notifications:', fetchError);
      return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
    }

    // Filter unread notifications
    const unreadNotifications = notifications?.filter((notification: any) => 
      !notification.read_by?.includes(adminId)
    ) || [];

    if (unreadNotifications.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'No unread notifications to mark as read',
        updatedCount: 0
      });
    }

    // Update all unread notifications
    const updatePromises = unreadNotifications.map((notification: any) => {
      const currentReadBy = notification.read_by || [];
      return supabase
        .from('notifications')
        .update({ 
          read_by: [...currentReadBy, adminId] 
        })
        .eq('id', notification.id);
    });

    const results = await Promise.all(updatePromises);
    
    // Check for any errors
    const errors = results.filter(result => result.error);
    if (errors.length > 0) {
      console.error('Error marking notifications as read:', errors);
      return NextResponse.json({ 
        error: 'Failed to mark some notifications as read',
        details: errors
      }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      message: `${unreadNotifications.length} notifications marked as read`,
      updatedCount: unreadNotifications.length
    });

  } catch (error) {
    console.error('Error in admin mark-all-read PUT:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 