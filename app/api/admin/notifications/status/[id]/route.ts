import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const notificationId = params.id;

    if (!notificationId) {
      return NextResponse.json({ 
        error: 'Notification ID is required' 
      }, { status: 400 });
    }

    // Get notification with metadata
    const { data: notification, error } = await supabaseAdmin
      .from('notifications')
      .select('id, title, message, metadata, created_at')
      .eq('id', notificationId)
      .single();

    if (error) {
      console.error('Error fetching notification:', error);
      return NextResponse.json({ 
        error: 'Notification not found' 
      }, { status: 404 });
    }

    if (!notification) {
      return NextResponse.json({ 
        error: 'Notification not found' 
      }, { status: 404 });
    }

    // Extract status from metadata
    const metadata = notification.metadata || {};
    
    const status = {
      id: notification.id,
      title: notification.title,
      message: notification.message,
      status: metadata.status || 'unknown',
      totalUsers: metadata.totalUsers || 0,
      totalSubscriptions: metadata.totalSubscriptions || 0,
      sent: metadata.sent || 0,
      failed: metadata.failed || 0,
      progress: metadata.progress || null,
      duration: metadata.duration || null,
      error: metadata.error || null,
      createdAt: notification.created_at,
      completedAt: metadata.completedAt || null,
      batchResults: metadata.batchResults || []
    };

    return NextResponse.json({
      success: true,
      status
    });

  } catch (error) {
    console.error('Error getting notification status:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}

