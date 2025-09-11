import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET - Get notification analytics
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const adminId = searchParams.get('adminId');
    const days = parseInt(searchParams.get('days') || '30');
    
    if (!adminId) {
      return NextResponse.json({ error: 'Admin ID is required' }, { status: 400 });
    }

    // Verify admin user
    const { data: admin, error: adminError } = await supabase
      .from('admin_users')
      .select('id, role')
      .eq('id', adminId)
      .single();

    if (adminError || !admin) {
      return NextResponse.json({ error: 'Invalid admin user' }, { status: 403 });
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get all notifications in the date range
    const { data: notifications, error: notificationsError } = await supabase
      .from('notifications')
      .select('*')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false });

    if (notificationsError) {
      console.error('Error fetching notifications:', notificationsError);
      return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
    }

    const notificationsList = notifications || [];

    // Calculate analytics
    const analytics = {
      summary: {
        totalNotifications: notificationsList.length,
        activeNotifications: notificationsList.filter((n: any) => n.is_active).length,
        scheduledNotifications: notificationsList.filter((n: any) => n.scheduled_at && new Date(n.scheduled_at) > new Date()).length,
        expiredNotifications: notificationsList.filter((n: any) => n.expires_at && new Date(n.expires_at) < new Date()).length,
      },
      
      byType: {
        info: notificationsList.filter((n: any) => n.type === 'info').length,
        warning: notificationsList.filter((n: any) => n.type === 'warning').length,
        error: notificationsList.filter((n: any) => n.type === 'error').length,
        success: notificationsList.filter((n: any) => n.type === 'success').length,
      },
      
      byCategory: {
        transport: notificationsList.filter((n: any) => n.category === 'transport').length,
        payment: notificationsList.filter((n: any) => n.category === 'payment').length,
        system: notificationsList.filter((n: any) => n.category === 'system').length,
        emergency: notificationsList.filter((n: any) => n.category === 'emergency').length,
      },
      
      byAudience: {
        all: notificationsList.filter((n: any) => n.target_audience === 'all').length,
        students: notificationsList.filter((n: any) => n.target_audience === 'students').length,
        admins: notificationsList.filter((n: any) => n.target_audience === 'admins').length,
        drivers: notificationsList.filter((n: any) => n.target_audience === 'drivers').length,
        specific: notificationsList.filter((n: any) => n.specific_users && n.specific_users.length > 0).length,
      },
      
      engagement: {
        actionable: notificationsList.filter((n: any) => n.actionable).length,
        withPushEnabled: notificationsList.filter((n: any) => n.enable_push_notification).length,
        withEmailEnabled: notificationsList.filter((n: any) => n.enable_email_notification).length,
        withSmsEnabled: notificationsList.filter((n: any) => n.enable_sms_notification).length,
      },
      
      readingStats: {
        totalReads: notificationsList.reduce((sum: number, n: any) => sum + (n.read_by ? n.read_by.length : 0), 0),
        averageReadsPerNotification: notificationsList.length > 0 
          ? (notificationsList.reduce((sum: number, n: any) => sum + (n.read_by ? n.read_by.length : 0), 0) / notificationsList.length).toFixed(2)
          : 0,
        unreadNotifications: notificationsList.filter((n: any) => !n.read_by || n.read_by.length === 0).length,
      },
      
      timeline: await getNotificationTimeline(notificationsList, days),
      
      topCreators: await getTopCreators(notificationsList),
      
      recentActivity: notificationsList.slice(0, 10).map((n: any) => ({
        id: n.id,
        title: n.title,
        type: n.type,
        category: n.category,
        target_audience: n.target_audience,
        created_at: n.created_at,
        read_count: n.read_by ? n.read_by.length : 0,
        is_active: n.is_active
      }))
    };

    return NextResponse.json({
      success: true,
      data: analytics,
      period: {
        days,
        startDate: startDate.toISOString(),
        endDate: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error in notification analytics:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function getNotificationTimeline(notifications: any[], days: number) {
  const timeline = [];
  const now = new Date();
  
  for (let i = 0; i < days; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    
    const dayNotifications = notifications.filter(n => 
      n.created_at.startsWith(dateStr)
    );
    
    timeline.unshift({
      date: dateStr,
      total: dayNotifications.length,
      byType: {
        info: dayNotifications.filter(n => n.type === 'info').length,
        warning: dayNotifications.filter(n => n.type === 'warning').length,
        error: dayNotifications.filter(n => n.type === 'error').length,
        success: dayNotifications.filter(n => n.type === 'success').length,
      }
    });
  }
  
  return timeline;
}

async function getTopCreators(notifications: any[]) {
  const creators = new Map();
  
  for (const notification of notifications) {
    if (notification.created_by) {
      const count = creators.get(notification.created_by) || 0;
      creators.set(notification.created_by, count + 1);
    }
  }
  
  // Get creator names
  const creatorIds = Array.from(creators.keys());
  if (creatorIds.length === 0) {
    return [];
  }
  
  const { data: adminUsers } = await supabase
    .from('admin_users')
    .select('id, name')
    .in('id', creatorIds);
  
  const adminMap = new Map(adminUsers?.map((admin: any) => [admin.id, admin.name]) || []);
  
  return Array.from(creators.entries())
    .map(([id, count]) => ({
      id,
      name: adminMap.get(id) || 'Unknown',
      count
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
} 