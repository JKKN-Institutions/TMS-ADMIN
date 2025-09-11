import { createClient } from '@supabase/supabase-js';

interface NotificationData {
  student_id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  category: 'transport' | 'enrollment' | 'system';
  actionable?: boolean;
  primary_action?: any;
  metadata?: any;
}

interface EmailNotificationData {
  to: string;
  student_name: string;
  subject: string;
  template: 'enrollment_approved' | 'enrollment_rejected' | 'enrollment_pending';
  data: any;
}

export class NotificationService {
  private supabaseAdmin: any;

  constructor() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase configuration missing');
    }

    this.supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }

  // Create in-app notification
  async createNotification(notificationData: NotificationData): Promise<boolean> {
    try {
      const { error } = await this.supabaseAdmin
        .from('notifications')
        .insert({
          title: notificationData.title,
          message: notificationData.message,
          type: notificationData.type,
          category: notificationData.category,
          target_audience: 'students',
          specific_users: [notificationData.student_id],
          is_active: true,
          actionable: notificationData.actionable || false,
          primary_action: notificationData.primary_action || null,
          tags: ['enrollment', 'transport'],
          metadata: notificationData.metadata || {},
          created_at: new Date().toISOString()
        });

      if (error) {
        console.error('Error creating notification:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error in createNotification:', error);
      return false;
    }
  }

  // Send enrollment approved notification
  async notifyEnrollmentApproved(studentId: string, enrollmentData: any): Promise<boolean> {
    try {
      const { data: student } = await this.supabaseAdmin
        .from('students')
        .select('student_name, email')
        .eq('id', studentId)
        .single();

      if (!student) {
        console.error('Student not found for notification');
        return false;
      }

      // Create in-app notification
      const notificationSuccess = await this.createNotification({
        student_id: studentId,
        title: 'Transport Enrollment Approved! 🎉',
        message: `Congratulations! Your transport enrollment for route ${enrollmentData.route_number} has been approved. You can now start booking trips.`,
        type: 'success',
        category: 'enrollment',
        actionable: true,
        primary_action: {
          text: 'View Route Details',
          url: '/dashboard/routes'
        },
        metadata: {
          route_id: enrollmentData.route_id,
          route_number: enrollmentData.route_number,
          stop_name: enrollmentData.stop_name,
          approval_date: new Date().toISOString()
        }
      });

      // In a real implementation, you would also send email notification here
      // await this.sendEmailNotification({
      //   to: student.email,
      //   student_name: student.student_name,
      //   subject: 'Transport Enrollment Approved - TMS',
      //   template: 'enrollment_approved',
      //   data: enrollmentData
      // });

      return notificationSuccess;
    } catch (error) {
      console.error('Error in notifyEnrollmentApproved:', error);
      return false;
    }
  }

  // Send enrollment rejected notification
  async notifyEnrollmentRejected(studentId: string, rejectionData: any): Promise<boolean> {
    try {
      const { data: student } = await this.supabaseAdmin
        .from('students')
        .select('student_name, email')
        .eq('id', studentId)
        .single();

      if (!student) {
        console.error('Student not found for notification');
        return false;
      }

      // Create in-app notification
      const notificationSuccess = await this.createNotification({
        student_id: studentId,
        title: 'Transport Enrollment Update',
        message: `Your transport enrollment request has been reviewed. Please check the details and feel free to submit a new request if needed.`,
        type: 'warning',
        category: 'enrollment',
        actionable: true,
        primary_action: {
          text: 'Submit New Request',
          url: '/dashboard'
        },
        metadata: {
          rejection_reason: rejectionData.rejection_reason,
          admin_notes: rejectionData.admin_notes,
          rejection_date: new Date().toISOString()
        }
      });

      // In a real implementation, you would also send email notification here
      // await this.sendEmailNotification({
      //   to: student.email,
      //   student_name: student.student_name,
      //   subject: 'Transport Enrollment Update - TMS',
      //   template: 'enrollment_rejected',
      //   data: rejectionData
      // });

      return notificationSuccess;
    } catch (error) {
      console.error('Error in notifyEnrollmentRejected:', error);
      return false;
    }
  }

  // Send enrollment pending notification
  async notifyEnrollmentPending(studentId: string, enrollmentData: any): Promise<boolean> {
    try {
      const { data: student } = await this.supabaseAdmin
        .from('students')
        .select('student_name, email')
        .eq('id', studentId)
        .single();

      if (!student) {
        console.error('Student not found for notification');
        return false;
      }

      // Create in-app notification
      const notificationSuccess = await this.createNotification({
        student_id: studentId,
        title: 'Enrollment Request Submitted',
        message: `Your transport enrollment request for route ${enrollmentData.route_number} has been submitted successfully. We'll notify you once it's reviewed.`,
        type: 'info',
        category: 'enrollment',
        actionable: true,
        primary_action: {
          text: 'Check Status',
          url: '/dashboard'
        },
        metadata: {
          route_id: enrollmentData.route_id,
          route_number: enrollmentData.route_number,
          stop_name: enrollmentData.stop_name,
          submission_date: new Date().toISOString()
        }
      });

      return notificationSuccess;
    } catch (error) {
      console.error('Error in notifyEnrollmentPending:', error);
      return false;
    }
  }

  // Send admin notification for new enrollment request
  async notifyAdminNewRequest(enrollmentData: any): Promise<boolean> {
    try {
      // Get all admin users with transport management permissions
      const { data: admins } = await this.supabaseAdmin
        .from('admin_users')
        .select('id, name, email')
        .in('role', ['super_admin', 'transport_manager'])
        .eq('is_active', true);

      if (!admins || admins.length === 0) {
        console.warn('No admin users found for notification');
        return false;
      }

      // Create notifications for all eligible admins
      const adminIds = admins.map(admin => admin.id);
      
      const { error } = await this.supabaseAdmin
        .from('notifications')
        .insert({
          title: 'New Transport Enrollment Request',
          message: `${enrollmentData.student_name} (${enrollmentData.roll_number}) has submitted a transport enrollment request for route ${enrollmentData.route_number}.`,
          type: 'info',
          category: 'transport',
          target_audience: 'admins',
          specific_users: adminIds,
          is_active: true,
          actionable: true,
          primary_action: {
            text: 'Review Request',
            url: '/enrollment-requests'
          },
          tags: ['enrollment', 'admin', 'review-required'],
          metadata: {
            request_id: enrollmentData.request_id,
            student_id: enrollmentData.student_id,
            route_id: enrollmentData.route_id,
            submission_date: new Date().toISOString()
          },
          created_at: new Date().toISOString()
        });

      if (error) {
        console.error('Error creating admin notification:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error in notifyAdminNewRequest:', error);
      return false;
    }
  }

  // Private method for sending email notifications (placeholder for real implementation)
  private async sendEmailNotification(emailData: EmailNotificationData): Promise<boolean> {
    try {
      // In a real implementation, you would integrate with an email service like:
      // - SendGrid
      // - AWS SES
      // - Nodemailer with SMTP
      // - Supabase Edge Functions with email service
      
      console.log('Email notification would be sent:', {
        to: emailData.to,
        subject: emailData.subject,
        template: emailData.template,
        student_name: emailData.student_name
      });

      // For now, just log the email that would be sent
      return true;
    } catch (error) {
      console.error('Error sending email notification:', error);
      return false;
    }
  }
}

// Export a singleton instance
export const notificationService = new NotificationService(); 