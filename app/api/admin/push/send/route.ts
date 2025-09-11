import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Push notification service interface
interface PushSubscription {
  id: string;
  user_id: string;
  user_type: string;
  endpoint: string;
  p256dh_key: string;
  auth_key: string;
  is_active: boolean;
}

// Simulated push notification sender (replace with actual web-push implementation)
async function sendPushNotification(subscription: PushSubscription, payload: any): Promise<boolean> {
  try {
    // This is a placeholder for actual push notification sending
    // In production, you would use web-push library or similar service
    console.log('Sending push notification to:', subscription.user_id, payload);
    
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Return success for now - replace with actual implementation
    return true;
  } catch (error) {
    console.error('Push notification failed:', error);
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const {
      notificationId,
      title,
      message,
      targetAudience = 'all',
      specificUsers = [],
      url,
      adminId
    } = await request.json();

    if (!title || !message || !adminId) {
      return NextResponse.json({ 
        error: 'Title, message, and admin ID are required' 
      }, { status: 400 });
    }

    // Verify admin permissions
    const { data: admin, error: adminError } = await supabase
      .from('admin_users')
      .select('id, role')
      .eq('id', adminId)
      .single();

    if (adminError || !admin) {
      return NextResponse.json({ error: 'Invalid admin user' }, { status: 403 });
    }

    // Check if admin has permission to send push notifications
    const canSendPush = ['super_admin', 'operations_admin'].includes(admin.role);
    if (!canSendPush) {
      return NextResponse.json({ 
        error: 'Insufficient permissions to send push notifications' 
      }, { status: 403 });
    }

    // Get push subscriptions based on target audience
    let subscriptionQuery = supabase
      .from('push_subscriptions')
      .select('*')
      .eq('is_active', true);

    if (targetAudience === 'students') {
      subscriptionQuery = subscriptionQuery.eq('user_type', 'student');
    } else if (targetAudience === 'admins') {
      subscriptionQuery = subscriptionQuery.eq('user_type', 'admin');
    } else if (specificUsers.length > 0) {
      subscriptionQuery = subscriptionQuery.in('user_id', specificUsers);
    }

    const { data: subscriptions, error: subscriptionError } = await subscriptionQuery;

    if (subscriptionError) {
      console.error('Error fetching subscriptions:', subscriptionError);
      return NextResponse.json({ 
        error: 'Failed to fetch push subscriptions' 
      }, { status: 500 });
    }

    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json({ 
        success: true,
        message: 'No active push subscriptions found',
        sent: 0
      });
    }

    // Prepare push notification payload
    const payload = {
      title,
      message,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      url: url || '/dashboard/notifications',
      data: {
        notificationId,
        url: url || '/dashboard/notifications',
        timestamp: Date.now()
      }
    };

    // Send push notifications
    const pushPromises = subscriptions.map(async (subscription: PushSubscription) => {
      try {
        const success = await sendPushNotification(subscription, payload);

        if (success) {
          return { success: true, userId: subscription.user_id };
        } else {
          throw new Error('Push notification failed');
        }
      } catch (error: any) {
        console.error(`Failed to send push to ${subscription.user_id}:`, error);
        
        // If subscription is invalid, mark it as inactive
        if (error?.statusCode === 410 || error?.statusCode === 404) {
          await supabase
            .from('push_subscriptions')
            .update({ is_active: false })
            .eq('id', subscription.id);
        }

        return { success: false, userId: subscription.user_id, error: error?.message || 'Unknown error' };
      }
    });

    const results = await Promise.all(pushPromises);
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    // Log push notification activity
    try {
      await supabase
        .from('push_notification_logs')
        .insert({
          notification_id: notificationId,
          title,
          message,
          target_audience: targetAudience,
          specific_users: specificUsers,
          total_sent: successful,
          total_failed: failed,
          sent_by: adminId,
          sent_at: new Date().toISOString()
        });
    } catch (logError) {
      console.error('Error logging push notification:', logError);
    }

    return NextResponse.json({
      success: true,
      message: `Push notifications sent successfully`,
      results: {
        total: subscriptions.length,
        successful,
        failed
      }
    });

  } catch (error) {
    console.error('Error sending push notifications:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
} 