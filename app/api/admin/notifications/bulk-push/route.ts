import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

// Configure VAPID keys
webpush.setVapidDetails(
  'mailto:admin@tms.local',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

interface BulkPushRequest {
  title: string;
  message: string;
  targetAudience: 'all' | 'students' | 'drivers' | 'parents' | 'specific_users' | 'routes';
  specificUsers?: string[];
  routes?: string[];
  adminId: string;
  priority?: 'low' | 'normal' | 'high';
  batchSize?: number;
  delayBetweenBatches?: number;
}

// Rate limiting configuration based on FCM best practices
const RATE_LIMITS = {
  MAX_CONCURRENT_REQUESTS: 100,     // FCM allows ~1000/sec, we'll be conservative
  BATCH_SIZE: 100,                  // Process in smaller chunks
  DELAY_BETWEEN_BATCHES: 1000,      // 1 second delay between batches
  MAX_RETRIES: 3,                   // Retry failed notifications
  RETRY_DELAY: 2000,                // 2 seconds between retries
};

export async function POST(request: NextRequest) {
  try {
    const body: BulkPushRequest = await request.json();
    
    console.log('🚀 Starting bulk push notification:', {
      title: body.title,
      targetAudience: body.targetAudience,
      estimatedUsers: body.targetAudience === 'all' ? '3000+' : 'Variable',
      batchSize: body.batchSize || RATE_LIMITS.BATCH_SIZE
    });

    // Validate admin permission
    const { data: adminUser, error: adminError } = await supabaseAdmin
      .from('admin_users')
      .select('id, name, role, email')
      .eq('id', body.adminId)
      .single();

    if (adminError || !adminUser) {
      return NextResponse.json({ 
        error: 'Unauthorized: Invalid admin user' 
      }, { status: 401 });
    }

    if (!['super_admin', 'admin'].includes(adminUser.role)) {
      return NextResponse.json({ 
        error: 'Insufficient permissions for bulk notifications' 
      }, { status: 403 });
    }

    // Create notification record first
    const notificationData = {
      title: body.title,
      message: body.message,
      type: 'info' as const,
      category: 'system' as const,
      target_audience: body.targetAudience as any,
      specific_users: body.specificUsers || [],
      is_active: true,
      enable_push_notification: true,
      actionable: false,
      tags: ['bulk_notification', 'admin_sent'],
      created_by: body.adminId,
      metadata: {
        bulk_notification: true,
        batch_size: body.batchSize || RATE_LIMITS.BATCH_SIZE,
        priority: body.priority || 'normal',
        initiated_at: new Date().toISOString()
      }
    };

    const { data: notification, error: notificationError } = await supabaseAdmin
      .from('notifications')
      .insert(notificationData)
      .select()
      .single();

    if (notificationError) {
      console.error('Error creating notification:', notificationError);
      return NextResponse.json({ 
        error: 'Failed to create notification record' 
      }, { status: 500 });
    }

    console.log(`📝 Notification record created: ${notification.id}`);

    // Start bulk sending process
    const bulkResult = await processBulkNotification(notification, body);

    return NextResponse.json({
      success: true,
      notificationId: notification.id,
      ...bulkResult,
      message: `Bulk notification initiated. Processing ${bulkResult.totalUsers} users in batches.`
    });

  } catch (error) {
    console.error('Error in bulk push notification:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}

async function processBulkNotification(notification: any, requestData: BulkPushRequest) {
  const startTime = Date.now();
  
  try {
    // Get target users
    console.log('👥 Fetching target users...');
    const targetUsers = await getTargetUsers(
      requestData.targetAudience,
      requestData.specificUsers,
      requestData.routes
    );

    console.log(`📊 Found ${targetUsers.length} target users`);

    if (targetUsers.length === 0) {
      return {
        success: true,
        totalUsers: 0,
        totalSubscriptions: 0,
        sent: 0,
        failed: 0,
        message: 'No target users found'
      };
    }

    // Get active push subscriptions for all target users
    console.log('📱 Fetching push subscriptions...');
    const { data: subscriptions, error: subscriptionError } = await supabaseAdmin
      .from('push_subscriptions')
      .select('*')
      .in('user_id', targetUsers.map(u => u.id))
      .eq('is_active', true);

    if (subscriptionError) {
      throw new Error(`Failed to fetch subscriptions: ${subscriptionError.message}`);
    }

    const activeSubscriptions = subscriptions || [];
    console.log(`📱 Found ${activeSubscriptions.length} active subscriptions`);

    if (activeSubscriptions.length === 0) {
      await updateNotificationStatus(notification.id, {
        status: 'completed',
        totalUsers: targetUsers.length,
        totalSubscriptions: 0,
        sent: 0,
        failed: 0,
        error: 'No active push subscriptions found'
      });

      return {
        success: true,
        totalUsers: targetUsers.length,
        totalSubscriptions: 0,
        sent: 0,
        failed: 0,
        message: 'No active push subscriptions found'
      };
    }

    // Update notification status to processing
    await updateNotificationStatus(notification.id, {
      status: 'processing',
      totalUsers: targetUsers.length,
      totalSubscriptions: activeSubscriptions.length
    });

    // Process in batches
    const batchSize = requestData.batchSize || RATE_LIMITS.BATCH_SIZE;
    const delayBetweenBatches = requestData.delayBetweenBatches || RATE_LIMITS.DELAY_BETWEEN_BATCHES;
    
    const results = await sendInBatches(
      activeSubscriptions,
      notification,
      batchSize,
      delayBetweenBatches
    );

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Update final notification status
    await updateNotificationStatus(notification.id, {
      status: 'completed',
      totalUsers: targetUsers.length,
      totalSubscriptions: activeSubscriptions.length,
      sent: results.sent,
      failed: results.failed,
      duration: duration,
      completedAt: new Date().toISOString(),
      batchResults: results.batchResults
    });

    console.log(`✅ Bulk notification completed in ${duration}ms`);
    console.log(`📊 Results: ${results.sent} sent, ${results.failed} failed`);

    return {
      success: true,
      totalUsers: targetUsers.length,
      totalSubscriptions: activeSubscriptions.length,
      sent: results.sent,
      failed: results.failed,
      duration: duration,
      batchCount: results.batchResults.length
    };

  } catch (error) {
    console.error('Error processing bulk notification:', error);
    
    // Update notification with error status
    await updateNotificationStatus(notification.id, {
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    throw error;
  }
}

async function sendInBatches(
  subscriptions: any[],
  notification: any,
  batchSize: number,
  delayBetweenBatches: number
) {
  const totalBatches = Math.ceil(subscriptions.length / batchSize);
  let totalSent = 0;
  let totalFailed = 0;
  const batchResults = [];

  console.log(`🔄 Processing ${subscriptions.length} subscriptions in ${totalBatches} batches of ${batchSize}`);

  // Create push payload
  const pushPayload = {
    title: notification.title,
    body: notification.message,
    icon: '/icons/bus-notification.png',
    badge: '/icons/badge.png',
    tag: `bulk-notification-${notification.id}`,
    requireInteraction: false,
    data: {
      type: 'bulk_notification',
      notificationId: notification.id,
      url: '/dashboard'
    }
  };

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const startIdx = batchIndex * batchSize;
    const endIdx = Math.min(startIdx + batchSize, subscriptions.length);
    const batch = subscriptions.slice(startIdx, endIdx);

    console.log(`📦 Processing batch ${batchIndex + 1}/${totalBatches} (${batch.length} subscriptions)`);

    const batchStartTime = Date.now();
    let batchSent = 0;
    let batchFailed = 0;

    // Process batch with controlled concurrency
    const batchPromises = batch.map(async (subscription) => {
      try {
        // Skip test subscriptions in production
        if (subscription.endpoint.startsWith('test_endpoint')) {
          console.log(`🧪 Simulating push to test subscription for user ${subscription.user_id}`);
          return { success: true, userId: subscription.user_id, simulated: true };
        }

        const pushSubscription = {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh_key,
            auth: subscription.auth_key
          }
        };

        await webpush.sendNotification(pushSubscription, JSON.stringify(pushPayload));
        return { success: true, userId: subscription.user_id };

      } catch (error) {
        console.error(`❌ Failed to send to user ${subscription.user_id}:`, error);
        
        // Mark invalid subscriptions as inactive
        if (error instanceof Error && (error.message.includes('410') || error.message.includes('403'))) {
          try {
            await supabaseAdmin
              .from('push_subscriptions')
              .update({ is_active: false })
              .eq('id', subscription.id);
            console.log(`🗑️ Marked invalid subscription as inactive for user ${subscription.user_id}`);
          } catch (updateError) {
            console.error('Failed to update subscription status:', updateError);
          }
        }

        return { 
          success: false, 
          userId: subscription.user_id, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        };
      }
    });

    // Wait for all notifications in this batch to complete
    const batchResults = await Promise.allSettled(batchPromises);
    
    // Count results
    batchResults.forEach((result) => {
      if (result.status === 'fulfilled') {
        if (result.value.success) {
          batchSent++;
        } else {
          batchFailed++;
        }
      } else {
        batchFailed++;
      }
    });

    totalSent += batchSent;
    totalFailed += batchFailed;

    const batchDuration = Date.now() - batchStartTime;
    
    batchResults.push({
      batchIndex: batchIndex + 1,
      subscriptions: batch.length,
      sent: batchSent,
      failed: batchFailed,
      duration: batchDuration
    });

    console.log(`✅ Batch ${batchIndex + 1} completed: ${batchSent} sent, ${batchFailed} failed (${batchDuration}ms)`);

    // Update progress in notification metadata
    await updateNotificationProgress(notification.id, {
      currentBatch: batchIndex + 1,
      totalBatches,
      sent: totalSent,
      failed: totalFailed,
      progress: Math.round(((batchIndex + 1) / totalBatches) * 100)
    });

    // Delay between batches (except for the last batch)
    if (batchIndex < totalBatches - 1) {
      console.log(`⏳ Waiting ${delayBetweenBatches}ms before next batch...`);
      await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
    }
  }

  return {
    sent: totalSent,
    failed: totalFailed,
    batchResults
  };
}

async function updateNotificationStatus(notificationId: string, updates: any) {
  try {
    await supabaseAdmin
      .from('notifications')
      .update({
        metadata: {
          bulk_notification: true,
          ...updates,
          updated_at: new Date().toISOString()
        }
      })
      .eq('id', notificationId);
  } catch (error) {
    console.error('Failed to update notification status:', error);
  }
}

async function updateNotificationProgress(notificationId: string, progress: any) {
  try {
    await supabaseAdmin
      .from('notifications')
      .update({
        metadata: {
          bulk_notification: true,
          progress,
          updated_at: new Date().toISOString()
        }
      })
      .eq('id', notificationId);
  } catch (error) {
    console.error('Failed to update notification progress:', error);
  }
}

async function getTargetUsers(
  targetAudience: string,
  specificUsers?: string[],
  routes?: string[]
) {
  try {
    if (targetAudience === 'specific_users' && specificUsers) {
      const { data, error } = await supabaseAdmin
        .from('students')
        .select('id, student_name as name, email')
        .in('id', specificUsers);
      
      if (error) throw error;
      return data || [];
    }

    if (targetAudience === 'routes' && routes) {
      const { data, error } = await supabaseAdmin
        .from('students')
        .select('id, student_name as name, email')
        .in('allocated_route_id', routes)
        .eq('transport_enrolled', true);
      
      if (error) throw error;
      return data || [];
    }

    if (targetAudience === 'students' || targetAudience === 'all') {
      // For bulk notifications to all students, we need to handle large datasets efficiently
      console.log('📊 Fetching all enrolled students...');
      
      const { data, error } = await supabaseAdmin
        .from('students')
        .select('id, student_name as name, email')
        .eq('transport_enrolled', true)
        .limit(5000); // Reasonable limit to prevent memory issues

      if (error) throw error;
      return data || [];
    }

    return [];

  } catch (error) {
    console.error('Error fetching target users:', error);
    return [];
  }
}

