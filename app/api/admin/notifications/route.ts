import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET - Fetch admin notifications
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const adminId = searchParams.get('adminId');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');
    const unreadOnly = searchParams.get('unreadOnly') === 'true';
    const category = searchParams.get('category');
    const type = searchParams.get('type');
    const since = searchParams.get('since');

    if (!adminId) {
      return NextResponse.json({ error: 'Admin ID is required' }, { status: 400 });
    }

    // Build query
    let query = supabase
      .from('notifications')
      .select(`
        id,
        title,
        message,
        type,
        category,
        target_audience,
        specific_users,
        is_active,
        scheduled_at,
        expires_at,
        enable_push_notification,
        enable_email_notification,
        enable_sms_notification,
        actionable,
        primary_action,
        secondary_action,
        tags,
        read_by,
        created_by,
        created_at,
        updated_at
      `)
      .eq('is_active', true)
      .or(`target_audience.in.(all,admins),specific_users.cs.{${adminId}}`)
      .order('created_at', { ascending: false });

    // Apply filters
    if (category) {
      query = query.eq('category', category);
    }

    if (type) {
      query = query.eq('type', type);
    }

    if (since) {
      query = query.gt('created_at', since);
    }

    // Filter out expired notifications
    query = query.or('expires_at.is.null,expires_at.gt.now()');

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching notifications:', error);
      return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
    }

    // Format notifications and check read status
    const formattedNotifications = data?.map((notification: any) => ({
      ...notification,
      read: notification.read_by?.includes(adminId) || false
    })) || [];

    // Filter unread if requested
    const filteredNotifications = unreadOnly 
      ? formattedNotifications.filter((n: any) => !n.read)
      : formattedNotifications;

    return NextResponse.json({
      success: true,
      data: {
        notifications: filteredNotifications,
        pagination: {
          limit,
          offset,
          total: filteredNotifications.length,
          hasMore: filteredNotifications.length === limit
        }
      }
    });

  } catch (error) {
    console.error('Error in admin notifications GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Create new notification (admin only)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      title,
      message,
      type = 'info',
      category = 'system',
      target_audience = 'all',
      specific_users = [],
      scheduled_at,
      expires_at,
      enable_push_notification = true,
      enable_email_notification = false,
      enable_sms_notification = false,
      actionable = false,
      primary_action,
      secondary_action,
      tags = [],
      created_by
    } = body;

    if (!title || !message || !created_by) {
      return NextResponse.json({ 
        error: 'Title, message, and created_by are required' 
      }, { status: 400 });
    }

    // Verify admin permissions
    const { data: admin, error: adminError } = await supabase
      .from('admin_users')
      .select('id, role')
      .eq('id', created_by)
      .single();

    if (adminError || !admin) {
      return NextResponse.json({ error: 'Invalid admin user' }, { status: 403 });
    }

    // Check if admin has permission to create notifications
    const canCreateNotifications = ['super_admin', 'operations_admin'].includes(admin.role);
    if (!canCreateNotifications) {
      return NextResponse.json({ 
        error: 'Insufficient permissions to create notifications' 
      }, { status: 403 });
    }

    const { data, error } = await supabase
      .from('notifications')
      .insert({
        title,
        message,
        type,
        category,
        target_audience,
        specific_users,
        scheduled_at,
        expires_at,
        enable_push_notification,
        enable_email_notification,
        enable_sms_notification,
        actionable,
        primary_action,
        secondary_action,
        tags,
        created_by
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating notification:', error);
      return NextResponse.json({ error: 'Failed to create notification' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: data,
      message: 'Notification created successfully'
    });

  } catch (error) {
    console.error('Error in admin notifications POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT - Update notification (admin only)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      id,
      title,
      message,
      type,
      category,
      target_audience,
      specific_users,
      scheduled_at,
      expires_at,
      enable_push_notification,
      enable_email_notification,
      enable_sms_notification,
      actionable,
      primary_action,
      secondary_action,
      tags,
      is_active,
      updated_by
    } = body;

    if (!id || !updated_by) {
      return NextResponse.json({ 
        error: 'Notification ID and updated_by are required' 
      }, { status: 400 });
    }

    // Verify admin permissions
    const { data: admin, error: adminError } = await supabase
      .from('admin_users')
      .select('id, role')
      .eq('id', updated_by)
      .single();

    if (adminError || !admin) {
      return NextResponse.json({ error: 'Invalid admin user' }, { status: 403 });
    }

    // Check if admin has permission to update notifications
    const canUpdateNotifications = ['super_admin', 'operations_admin'].includes(admin.role);
    if (!canUpdateNotifications) {
      return NextResponse.json({ 
        error: 'Insufficient permissions to update notifications' 
      }, { status: 403 });
    }

    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (message !== undefined) updateData.message = message;
    if (type !== undefined) updateData.type = type;
    if (category !== undefined) updateData.category = category;
    if (target_audience !== undefined) updateData.target_audience = target_audience;
    if (specific_users !== undefined) updateData.specific_users = specific_users;
    if (scheduled_at !== undefined) updateData.scheduled_at = scheduled_at;
    if (expires_at !== undefined) updateData.expires_at = expires_at;
    if (enable_push_notification !== undefined) updateData.enable_push_notification = enable_push_notification;
    if (enable_email_notification !== undefined) updateData.enable_email_notification = enable_email_notification;
    if (enable_sms_notification !== undefined) updateData.enable_sms_notification = enable_sms_notification;
    if (actionable !== undefined) updateData.actionable = actionable;
    if (primary_action !== undefined) updateData.primary_action = primary_action;
    if (secondary_action !== undefined) updateData.secondary_action = secondary_action;
    if (tags !== undefined) updateData.tags = tags;
    if (is_active !== undefined) updateData.is_active = is_active;

    const { data, error } = await supabase
      .from('notifications')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating notification:', error);
      return NextResponse.json({ error: 'Failed to update notification' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: data,
      message: 'Notification updated successfully'
    });

  } catch (error) {
    console.error('Error in admin notifications PUT:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Delete notification (admin only)
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const deleted_by = searchParams.get('deleted_by');

    if (!id || !deleted_by) {
      return NextResponse.json({ 
        error: 'Notification ID and deleted_by are required' 
      }, { status: 400 });
    }

    // Verify admin permissions
    const { data: admin, error: adminError } = await supabase
      .from('admin_users')
      .select('id, role')
      .eq('id', deleted_by)
      .single();

    if (adminError || !admin) {
      return NextResponse.json({ error: 'Invalid admin user' }, { status: 403 });
    }

    // Check if admin has permission to delete notifications
    const canDeleteNotifications = ['super_admin'].includes(admin.role);
    if (!canDeleteNotifications) {
      return NextResponse.json({ 
        error: 'Insufficient permissions to delete notifications' 
      }, { status: 403 });
    }

    // Soft delete by setting is_active to false
    const { error } = await supabase
      .from('notifications')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      console.error('Error deleting notification:', error);
      return NextResponse.json({ error: 'Failed to delete notification' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Notification deleted successfully'
    });

  } catch (error) {
    console.error('Error in admin notifications DELETE:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 