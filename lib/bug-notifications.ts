import { createClient } from '@/lib/supabase';

interface BugNotificationData {
  bugId: string;
  title: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  reporterName: string;
  reporterType: 'student' | 'admin';
}

export class BugNotificationService {
  private supabase = createClient();

  /**
   * Send notification to admins when a new bug is reported
   */
  async notifyNewBugReport(bugData: BugNotificationData): Promise<void> {
    try {
      // Create notification for admins
      const notificationTitle = `New ${bugData.priority.toUpperCase()} Bug Report`;
      const notificationMessage = `${bugData.reporterName} reported: "${bugData.title}"`;

      // Insert notification into notifications table
      const { error: notificationError } = await this.supabase
        .from('notifications')
        .insert({
          title: notificationTitle,
          message: notificationMessage,
          type: 'bug_report',
          target_audience: 'admins',
          priority: this.mapPriorityToNotificationLevel(bugData.priority),
          metadata: {
            bugId: bugData.bugId,
            category: bugData.category,
            reporterType: bugData.reporterType
          },
          is_active: true,
          created_by: 'system'
        });

      if (notificationError) {
        console.error('Error creating bug notification:', notificationError);
      }

      // Send push notification to admin users (if push notifications are enabled)
      await this.sendPushNotificationToAdmins(bugData);

    } catch (error) {
      console.error('Error in notifyNewBugReport:', error);
    }
  }

  /**
   * Send notification when bug status changes
   */
  async notifyBugStatusChange(
    bugId: string,
    oldStatus: string,
    newStatus: string,
    reporterId: string,
    reporterType: 'student' | 'admin',
    title: string
  ): Promise<void> {
    try {
      const notificationTitle = `Bug Status Updated`;
      const notificationMessage = `Your bug report "${title}" status changed from ${oldStatus} to ${newStatus}`;

      // Create notification for the bug reporter
      const { error } = await this.supabase
        .from('notifications')
        .insert({
          title: notificationTitle,
          message: notificationMessage,
          type: 'bug_status_update',
          target_audience: reporterType === 'student' ? 'students' : 'admins',
          target_user_id: reporterId,
          metadata: {
            bugId,
            oldStatus,
            newStatus
          },
          is_active: true,
          created_by: 'system'
        });

      if (error) {
        console.error('Error creating bug status notification:', error);
      }

    } catch (error) {
      console.error('Error in notifyBugStatusChange:', error);
    }
  }

  /**
   * Send notification when a comment is added to a bug report
   */
  async notifyBugComment(
    bugId: string,
    bugTitle: string,
    commentAuthor: string,
    commentPreview: string,
    reporterId: string,
    reporterType: 'student' | 'admin'
  ): Promise<void> {
    try {
      const notificationTitle = `New Comment on Bug Report`;
      const notificationMessage = `${commentAuthor} commented on "${bugTitle}": ${commentPreview.substring(0, 100)}...`;

      // Create notification for the bug reporter
      const { error } = await this.supabase
        .from('notifications')
        .insert({
          title: notificationTitle,
          message: notificationMessage,
          type: 'bug_comment',
          target_audience: reporterType === 'student' ? 'students' : 'admins',
          target_user_id: reporterId,
          metadata: {
            bugId,
            commentAuthor
          },
          is_active: true,
          created_by: 'system'
        });

      if (error) {
        console.error('Error creating bug comment notification:', error);
      }

    } catch (error) {
      console.error('Error in notifyBugComment:', error);
    }
  }

  /**
   * Send push notification to admin users
   */
  private async sendPushNotificationToAdmins(bugData: BugNotificationData): Promise<void> {
    try {
      // Get admin push subscriptions
      const { data: adminSubscriptions, error } = await this.supabase
        .from('push_subscriptions')
        .select('*')
        .eq('user_type', 'admin')
        .eq('is_active', true);

      if (error || !adminSubscriptions || adminSubscriptions.length === 0) {
        console.log('No admin push subscriptions found');
        return;
      }

      // Prepare push notification payload
      const pushPayload = {
        title: `🐛 New ${bugData.priority.toUpperCase()} Bug Report`,
        body: `${bugData.reporterName}: ${bugData.title}`,
        icon: '/icons/bug-icon.png',
        badge: '/icons/badge-icon.png',
        data: {
          type: 'bug_report',
          bugId: bugData.bugId,
          url: `/bug-reports?id=${bugData.bugId}`
        },
        actions: [
          {
            action: 'view',
            title: 'View Bug'
          },
          {
            action: 'dismiss',
            title: 'Dismiss'
          }
        ]
      };

      // Send push notifications (this would integrate with your push notification service)
      // For now, we'll log the intent
      console.log('Would send push notification to', adminSubscriptions.length, 'admin(s):', pushPayload);

    } catch (error) {
      console.error('Error sending push notification to admins:', error);
    }
  }

  /**
   * Map bug priority to notification priority level
   */
  private mapPriorityToNotificationLevel(priority: string): string {
    const mapping = {
      'low': 'info',
      'medium': 'warning',
      'high': 'error',
      'critical': 'critical'
    };
    return mapping[priority as keyof typeof mapping] || 'info';
  }

  /**
   * Get bug report statistics for dashboard
   */
  async getBugStatistics(): Promise<{
    total: number;
    open: number;
    critical: number;
    recentCount: number;
  }> {
    try {
      // Get total bugs
      const { count: totalBugs } = await this.supabase
        .from('bug_reports')
        .select('*', { count: 'exact', head: true });

      // Get open bugs
      const { count: openBugs } = await this.supabase
        .from('bug_reports')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'open');

      // Get critical bugs
      const { count: criticalBugs } = await this.supabase
        .from('bug_reports')
        .select('*', { count: 'exact', head: true })
        .eq('priority', 'critical')
        .in('status', ['open', 'in_progress']);

      // Get recent bugs (last 24 hours)
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      const { count: recentBugs } = await this.supabase
        .from('bug_reports')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', yesterday.toISOString());

      return {
        total: totalBugs || 0,
        open: openBugs || 0,
        critical: criticalBugs || 0,
        recentCount: recentBugs || 0
      };

    } catch (error) {
      console.error('Error getting bug statistics:', error);
      return {
        total: 0,
        open: 0,
        critical: 0,
        recentCount: 0
      };
    }
  }
}

// Export singleton instance
export const bugNotificationService = new BugNotificationService();
