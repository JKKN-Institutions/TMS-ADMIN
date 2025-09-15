import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// GET - Get comprehensive notification statistics
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const adminId = searchParams.get('adminId');
    const period = searchParams.get('period') || '30'; // days
    const type = searchParams.get('type') || 'all'; // all, push, email, sms

    if (!adminId) {
      return NextResponse.json({ 
        error: 'Admin ID is required' 
      }, { status: 400 });
    }

    // Validate admin permission
    const { data: adminUser, error: adminError } = await supabaseAdmin
      .from('admin_users')
      .select('id, role')
      .eq('id', adminId)
      .single();

    if (adminError || !adminUser || !['super_admin', 'admin'].includes(adminUser.role)) {
      return NextResponse.json({ 
        error: 'Unauthorized' 
      }, { status: 401 });
    }

    const periodDays = parseInt(period);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - periodDays);

    // Get push subscription statistics
    const pushStats = await getPushSubscriptionStats();
    
    // Get notification delivery statistics
    const deliveryStats = await getDeliveryStats(startDate, type);
    
    // Get response and interaction statistics
    const responseStats = await getResponseStats(startDate);
    
    // Get daily trends
    const dailyTrends = await getDailyTrends(startDate);
    
    // Get top performing notifications
    const topNotifications = await getTopNotifications(startDate);

    return NextResponse.json({
      success: true,
      period: periodDays,
      stats: {
        push: pushStats,
        delivery: deliveryStats,
        responses: responseStats,
        trends: dailyTrends,
        topNotifications
      },
      generated_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching notification stats:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// Get push subscription statistics
async function getPushSubscriptionStats() {
  try {
    const { data: totalSubs, error: totalError } = await supabaseAdmin
      .from('push_subscriptions')
      .select('id', { count: 'exact' });

    const { data: activeSubs, error: activeError } = await supabaseAdmin
      .from('push_subscriptions')
      .select('id', { count: 'exact' })
      .eq('is_active', true);

    const { data: recentSubs, error: recentError } = await supabaseAdmin
      .from('push_subscriptions')
      .select('id', { count: 'exact' })
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    // Get subscription by user type
    const { data: userTypeSubs, error: userTypeError } = await supabaseAdmin
      .from('push_subscriptions')
      .select('user_type, is_active')
      .eq('is_active', true);

    const userTypeBreakdown = (userTypeSubs || []).reduce((acc: any, sub: any) => {
      acc[sub.user_type] = (acc[sub.user_type] || 0) + 1;
      return acc;
    }, {});

    return {
      total: totalSubs?.length || 0,
      active: activeSubs?.length || 0,
      inactive: (totalSubs?.length || 0) - (activeSubs?.length || 0),
      recentlyAdded: recentSubs?.length || 0,
      userTypeBreakdown,
      activationRate: totalSubs?.length ? ((activeSubs?.length || 0) / totalSubs.length * 100).toFixed(1) : 0
    };
  } catch (error) {
    console.error('Error getting push subscription stats:', error);
    return {
      total: 0,
      active: 0,
      inactive: 0,
      recentlyAdded: 0,
      userTypeBreakdown: {},
      activationRate: 0
    };
  }
}

// Get delivery statistics
async function getDeliveryStats(startDate: Date, type: string) {
  try {
    let query = supabaseAdmin
      .from('notifications')
      .select('*')
      .gte('created_at', startDate.toISOString());

    if (type === 'push') {
      query = query.eq('enable_push_notification', true);
    }

    const { data: notifications, error } = await query;

    if (error || !notifications) {
      return {
        totalSent: 0,
        delivered: 0,
        failed: 0,
        deliveryRate: 0,
        categories: {},
        types: {}
      };
    }

    let totalSent = 0;
    let delivered = 0;
    let failed = 0;
    const categories: any = {};
    const types: any = {};

    notifications.forEach((notification: any) => {
      const deliveryResults = notification.metadata?.deliveryResults;
      
      if (deliveryResults) {
        totalSent += deliveryResults.totalSubscriptions || 0;
        delivered += deliveryResults.sent || 0;
        failed += deliveryResults.failed || 0;
      }

      // Count by category
      categories[notification.category] = (categories[notification.category] || 0) + 1;
      
      // Count by type
      types[notification.type] = (types[notification.type] || 0) + 1;
    });

    return {
      totalSent,
      delivered,
      failed,
      deliveryRate: totalSent > 0 ? ((delivered / totalSent) * 100).toFixed(1) : 0,
      categories,
      types,
      totalNotifications: notifications.length
    };
  } catch (error) {
    console.error('Error getting delivery stats:', error);
    return {
      totalSent: 0,
      delivered: 0,
      failed: 0,
      deliveryRate: 0,
      categories: {},
      types: {},
      totalNotifications: 0
    };
  }
}

// Get response and interaction statistics
async function getResponseStats(startDate: Date) {
  try {
    // Get notification read statistics
    const { data: notifications, error: notifError } = await supabaseAdmin
      .from('notifications')
      .select('id, read_by, metadata, target_audience')
      .gte('created_at', startDate.toISOString())
      .eq('enable_push_notification', true);

    // Get booking action responses
    const { data: bookingActions, error: actionsError } = await supabaseAdmin
      .from('booking_actions_log')
      .select('action, created_at')
      .gte('created_at', startDate.toISOString())
      .in('source', ['push_notification']);

    let totalNotifications = notifications?.length || 0;
    let totalReads = 0;
    let totalInteractions = 0;

    // Calculate read rates
    notifications?.forEach((notification: any) => {
      const readBy = notification.read_by || [];
      totalReads += readBy.length;
      
      const deliveryResults = notification.metadata?.deliveryResults;
      if (deliveryResults) {
        totalInteractions += deliveryResults.sent || 0;
      }
    });

    // Calculate action responses
    const actionBreakdown = (bookingActions || []).reduce((acc: any, action: any) => {
      acc[action.action] = (acc[action.action] || 0) + 1;
      return acc;
    }, {});

    return {
      totalNotifications,
      totalReads,
      totalActions: bookingActions?.length || 0,
      readRate: totalInteractions > 0 ? ((totalReads / totalInteractions) * 100).toFixed(1) : 0,
      actionRate: totalNotifications > 0 ? ((bookingActions?.length || 0) / totalNotifications * 100).toFixed(1) : 0,
      actionBreakdown
    };
  } catch (error) {
    console.error('Error getting response stats:', error);
    return {
      totalNotifications: 0,
      totalReads: 0,
      totalActions: 0,
      readRate: 0,
      actionRate: 0,
      actionBreakdown: {}
    };
  }
}

// Get daily trends
async function getDailyTrends(startDate: Date) {
  try {
    const { data: notifications, error } = await supabaseAdmin
      .from('notifications')
      .select('created_at, metadata, enable_push_notification')
      .gte('created_at', startDate.toISOString())
      .eq('enable_push_notification', true)
      .order('created_at', { ascending: true });

    if (error || !notifications) {
      return [];
    }

    // Group by date
    const dailyData: any = {};
    
    notifications.forEach((notification: any) => {
      const date = new Date(notification.created_at).toISOString().split('T')[0];
      
      if (!dailyData[date]) {
        dailyData[date] = {
          date,
          sent: 0,
          delivered: 0,
          failed: 0,
          count: 0
        };
      }
      
      dailyData[date].count += 1;
      
      const deliveryResults = notification.metadata?.deliveryResults;
      if (deliveryResults) {
        dailyData[date].sent += deliveryResults.totalSubscriptions || 0;
        dailyData[date].delivered += deliveryResults.sent || 0;
        dailyData[date].failed += deliveryResults.failed || 0;
      }
    });

    return Object.values(dailyData).sort((a: any, b: any) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  } catch (error) {
    console.error('Error getting daily trends:', error);
    return [];
  }
}

// Get top performing notifications
async function getTopNotifications(startDate: Date) {
  try {
    const { data: notifications, error } = await supabaseAdmin
      .from('notifications')
      .select('id, title, message, type, category, created_at, metadata, read_by')
      .gte('created_at', startDate.toISOString())
      .eq('enable_push_notification', true)
      .order('created_at', { ascending: false });

    if (error || !notifications) {
      return [];
    }

    // Calculate performance score for each notification
    const performanceData = notifications.map((notification: any) => {
      const deliveryResults = notification.metadata?.deliveryResults || {};
      const readBy = notification.read_by || [];
      
      const sent = deliveryResults.sent || 0;
      const delivered = deliveryResults.delivered || sent;
      const reads = readBy.length;
      
      // Performance score based on delivery rate and read rate
      const deliveryRate = sent > 0 ? (delivered / sent) : 0;
      const readRate = delivered > 0 ? (reads / delivered) : 0;
      const performanceScore = (deliveryRate * 0.6) + (readRate * 0.4);
      
      return {
        id: notification.id,
        title: notification.title,
        message: notification.message.substring(0, 100) + (notification.message.length > 100 ? '...' : ''),
        type: notification.type,
        category: notification.category,
        createdAt: notification.created_at,
        stats: {
          sent,
          delivered,
          reads,
          deliveryRate: (deliveryRate * 100).toFixed(1),
          readRate: (readRate * 100).toFixed(1),
          performanceScore: (performanceScore * 100).toFixed(1)
        }
      };
    });

    // Sort by performance score and return top 10
    return performanceData
      .sort((a, b) => parseFloat(b.stats.performanceScore) - parseFloat(a.stats.performanceScore))
      .slice(0, 10);
  } catch (error) {
    console.error('Error getting top notifications:', error);
    return [];
  }
}

// POST - Generate custom report
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      adminId, 
      startDate, 
      endDate, 
      categories = [], 
      types = [],
      includeUserData = false
    } = body;

    // Validate admin permission
    const { data: adminUser, error: adminError } = await supabaseAdmin
      .from('admin_users')
      .select('id, role')
      .eq('id', adminId)
      .single();

    if (adminError || !adminUser || !['super_admin', 'admin'].includes(adminUser.role)) {
      return NextResponse.json({ 
        error: 'Unauthorized' 
      }, { status: 401 });
    }

    // Build query with filters
    let query = supabaseAdmin
      .from('notifications')
      .select('*')
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .eq('enable_push_notification', true);

    if (categories.length > 0) {
      query = query.in('category', categories);
    }

    if (types.length > 0) {
      query = query.in('type', types);
    }

    const { data: notifications, error } = await query;

    if (error) {
      return NextResponse.json({ 
        error: 'Failed to generate report' 
      }, { status: 500 });
    }

    // Process data for custom report
    const reportData = {
      period: {
        startDate,
        endDate,
        totalDays: Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24))
      },
      filters: {
        categories,
        types
      },
      summary: {
        totalNotifications: notifications?.length || 0,
        totalSent: 0,
        totalDelivered: 0,
        totalFailed: 0,
        totalReads: 0
      },
      breakdown: {
        byCategory: {},
        byType: {},
        byDate: {}
      },
      notifications: []
    };

    // Process each notification
    notifications?.forEach((notification: any) => {
      const deliveryResults = notification.metadata?.deliveryResults || {};
      const readBy = notification.read_by || [];
      
      const sent = deliveryResults.sent || 0;
      const delivered = deliveryResults.delivered || sent;
      const failed = deliveryResults.failed || 0;
      const reads = readBy.length;
      
      // Update summary
      reportData.summary.totalSent += sent;
      reportData.summary.totalDelivered += delivered;
      reportData.summary.totalFailed += failed;
      reportData.summary.totalReads += reads;
      
      // Update breakdowns
      const category = notification.category;
      const type = notification.type;
      const date = new Date(notification.created_at).toISOString().split('T')[0];
      
      if (!reportData.breakdown.byCategory[category]) {
        reportData.breakdown.byCategory[category] = { count: 0, sent: 0, delivered: 0, reads: 0 };
      }
      reportData.breakdown.byCategory[category].count += 1;
      reportData.breakdown.byCategory[category].sent += sent;
      reportData.breakdown.byCategory[category].delivered += delivered;
      reportData.breakdown.byCategory[category].reads += reads;
      
      if (!reportData.breakdown.byType[type]) {
        reportData.breakdown.byType[type] = { count: 0, sent: 0, delivered: 0, reads: 0 };
      }
      reportData.breakdown.byType[type].count += 1;
      reportData.breakdown.byType[type].sent += sent;
      reportData.breakdown.byType[type].delivered += delivered;
      reportData.breakdown.byType[type].reads += reads;
      
      if (!reportData.breakdown.byDate[date]) {
        reportData.breakdown.byDate[date] = { count: 0, sent: 0, delivered: 0, reads: 0 };
      }
      reportData.breakdown.byDate[date].count += 1;
      reportData.breakdown.byDate[date].sent += sent;
      reportData.breakdown.byDate[date].delivered += delivered;
      reportData.breakdown.byDate[date].reads += reads;
      
      // Add notification details if requested
      if (includeUserData) {
        reportData.notifications.push({
          id: notification.id,
          title: notification.title,
          message: notification.message,
          type: notification.type,
          category: notification.category,
          createdAt: notification.created_at,
          stats: {
            sent,
            delivered,
            failed,
            reads,
            deliveryRate: sent > 0 ? ((delivered / sent) * 100).toFixed(1) : 0,
            readRate: delivered > 0 ? ((reads / delivered) * 100).toFixed(1) : 0
          }
        });
      }
    });

    // Calculate rates
    reportData.summary.deliveryRate = reportData.summary.totalSent > 0 
      ? ((reportData.summary.totalDelivered / reportData.summary.totalSent) * 100).toFixed(1)
      : 0;
    
    reportData.summary.readRate = reportData.summary.totalDelivered > 0 
      ? ((reportData.summary.totalReads / reportData.summary.totalDelivered) * 100).toFixed(1)
      : 0;

    return NextResponse.json({
      success: true,
      report: reportData,
      generatedAt: new Date().toISOString(),
      generatedBy: adminUser.id
    });

  } catch (error) {
    console.error('Error generating custom report:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}
