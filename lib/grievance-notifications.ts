import { supabase } from './supabase';

export interface NotificationTemplate {
  id: string;
  name: string;
  subject: string;
  emailTemplate: string;
  smsTemplate?: string;
  pushTemplate?: string;
  variables: string[];
}

export interface NotificationRecipient {
  id: string;
  type: 'student' | 'admin';
  email: string;
  mobile?: string;
  name: string;
  preferences?: {
    email: boolean;
    sms: boolean;
    push: boolean;
  };
}

export interface GrievanceNotificationData {
  grievanceId: string;
  grievanceSubject: string;
  studentName: string;
  studentEmail: string;
  studentRollNumber: string;
  assignedAdminName?: string;
  assignedAdminEmail?: string;
  status: string;
  priority: string;
  urgency?: string;
  category: string;
  resolution?: string;
  resolutionCategory?: string;
  createdAt: string;
  updatedAt: string;
  escalationReason?: string;
  slaHours?: number;
  actualResolutionTime?: string;
}

// Notification Templates
const NOTIFICATION_TEMPLATES: Record<string, NotificationTemplate> = {
  GRIEVANCE_SUBMITTED: {
    id: 'grievance_submitted',
    name: 'Grievance Submitted',
    subject: 'Grievance Submitted - #{grievanceId}',
    emailTemplate: `
      <h2>Grievance Submitted Successfully</h2>
      <p>Dear {{studentName}},</p>
      <p>Your grievance has been submitted successfully and assigned tracking ID: <strong>{{grievanceId}}</strong></p>
      
      <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <h3>{{grievanceSubject}}</h3>
        <p><strong>Category:</strong> {{category}}</p>
        <p><strong>Priority:</strong> {{priority}}</p>
        <p><strong>Status:</strong> {{status}}</p>
        <p><strong>Submitted:</strong> {{createdAt}}</p>
      </div>
      
      <p>We will review your grievance and respond within {{slaHours}} hours. You can track the status of your grievance in your student portal.</p>
      
      <p>Thank you for bringing this to our attention.</p>
      <p>Best regards,<br>Transport Management Team</p>
    `,
    smsTemplate: 'Grievance submitted successfully. ID: {{grievanceId}}. We will respond within {{slaHours}} hours. Track status in your portal.',
    pushTemplate: 'Grievance submitted - ID: {{grievanceId}}',
    variables: ['studentName', 'grievanceId', 'grievanceSubject', 'category', 'priority', 'status', 'createdAt', 'slaHours']
  },

  GRIEVANCE_ASSIGNED: {
    id: 'grievance_assigned',
    name: 'Grievance Assigned',
    subject: 'Grievance #{grievanceId} Assigned for Review',
    emailTemplate: `
      <h2>Grievance Assigned for Review</h2>
      <p>Dear {{studentName}},</p>
      <p>Your grievance (ID: {{grievanceId}}) has been assigned to our team member for review and resolution.</p>
      
      <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <h3>{{grievanceSubject}}</h3>
        <p><strong>Assigned to:</strong> {{assignedAdminName}}</p>
        <p><strong>Status:</strong> In Progress</p>
        <p><strong>Priority:</strong> {{priority}}</p>
      </div>
      
      <p>Our team will work on resolving your concern. You will receive updates as we progress.</p>
      
      <p>Best regards,<br>Transport Management Team</p>
    `,
    smsTemplate: 'Grievance {{grievanceId}} assigned to {{assignedAdminName}} for review. Status: In Progress.',
    pushTemplate: 'Grievance {{grievanceId}} assigned for review',
    variables: ['studentName', 'grievanceId', 'grievanceSubject', 'assignedAdminName', 'priority']
  },

  GRIEVANCE_RESOLVED: {
    id: 'grievance_resolved',
    name: 'Grievance Resolved',
    subject: 'Grievance #{grievanceId} Resolved',
    emailTemplate: `
      <h2>Grievance Resolved</h2>
      <p>Dear {{studentName}},</p>
      <p>We are pleased to inform you that your grievance (ID: {{grievanceId}}) has been resolved.</p>
      
      <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <h3>{{grievanceSubject}}</h3>
        <p><strong>Resolution:</strong> {{resolution}}</p>
        <p><strong>Category:</strong> {{resolutionCategory}}</p>
        <p><strong>Resolved by:</strong> {{assignedAdminName}}</p>
        <p><strong>Resolution Time:</strong> {{actualResolutionTime}}</p>
      </div>
      
      <p>We hope this resolution addresses your concern satisfactorily. Please rate your experience and provide feedback to help us improve our services.</p>
      
      <p>If you have any further questions or concerns, please don't hesitate to contact us.</p>
      
      <p>Best regards,<br>Transport Management Team</p>
    `,
    smsTemplate: 'Grievance {{grievanceId}} resolved. Please check your portal for details and rate your experience.',
    pushTemplate: 'Grievance {{grievanceId}} resolved - Please rate your experience',
    variables: ['studentName', 'grievanceId', 'grievanceSubject', 'resolution', 'resolutionCategory', 'assignedAdminName', 'actualResolutionTime']
  },

  GRIEVANCE_ESCALATED: {
    id: 'grievance_escalated',
    name: 'Grievance Escalated',
    subject: 'URGENT: Grievance #{grievanceId} Escalated',
    emailTemplate: `
      <h2>Grievance Escalated - Immediate Attention Required</h2>
      <p>Dear {{assignedAdminName}},</p>
      <p>The following grievance has been escalated and requires immediate attention:</p>
      
      <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <h3>{{grievanceSubject}}</h3>
        <p><strong>Grievance ID:</strong> {{grievanceId}}</p>
        <p><strong>Student:</strong> {{studentName}} ({{studentRollNumber}})</p>
        <p><strong>Priority:</strong> {{priority}}</p>
        <p><strong>Urgency:</strong> {{urgency}}</p>
        <p><strong>Escalation Reason:</strong> {{escalationReason}}</p>
        <p><strong>Time Open:</strong> {{actualResolutionTime}}</p>
      </div>
      
      <p>Please review and take immediate action on this grievance.</p>
      
      <p>Best regards,<br>Automated Escalation System</p>
    `,
    smsTemplate: 'URGENT: Grievance {{grievanceId}} escalated. Reason: {{escalationReason}}. Immediate action required.',
    pushTemplate: 'URGENT: Grievance {{grievanceId}} escalated - {{escalationReason}}',
    variables: ['assignedAdminName', 'grievanceId', 'grievanceSubject', 'studentName', 'studentRollNumber', 'priority', 'urgency', 'escalationReason', 'actualResolutionTime']
  },

  NEW_COMMENT: {
    id: 'new_comment',
    name: 'New Comment Added',
    subject: 'New Comment on Grievance #{grievanceId}',
    emailTemplate: `
      <h2>New Comment Added</h2>
      <p>Dear {{recipientName}},</p>
      <p>A new comment has been added to grievance {{grievanceId}}:</p>
      
      <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <h3>{{grievanceSubject}}</h3>
        <p><strong>Comment by:</strong> {{senderName}}</p>
        <p><strong>Message:</strong> {{commentMessage}}</p>
      </div>
      
      <p>Please check your portal for full details and to respond.</p>
      
      <p>Best regards,<br>Transport Management Team</p>
    `,
    smsTemplate: 'New comment on grievance {{grievanceId}} by {{senderName}}. Check your portal for details.',
    pushTemplate: 'New comment on grievance {{grievanceId}}',
    variables: ['recipientName', 'grievanceId', 'grievanceSubject', 'senderName', 'commentMessage']
  },

  SLA_WARNING: {
    id: 'sla_warning',
    name: 'SLA Warning',
    subject: 'SLA WARNING: Grievance #{grievanceId} Approaching Deadline',
    emailTemplate: `
      <h2>SLA Warning - Action Required</h2>
      <p>Dear {{assignedAdminName}},</p>
      <p>The following grievance is approaching its SLA deadline and requires attention:</p>
      
      <div style="background: #fef3cd; border: 1px solid #fde68a; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <h3>{{grievanceSubject}}</h3>
        <p><strong>Grievance ID:</strong> {{grievanceId}}</p>
        <p><strong>Student:</strong> {{studentName}} ({{studentRollNumber}})</p>
        <p><strong>Priority:</strong> {{priority}}</p>
        <p><strong>SLA Hours:</strong> {{slaHours}}</p>
        <p><strong>Time Remaining:</strong> Less than 4 hours</p>
      </div>
      
      <p>Please take action to resolve this grievance before the SLA deadline.</p>
      
      <p>Best regards,<br>SLA Monitoring System</p>
    `,
    smsTemplate: 'SLA WARNING: Grievance {{grievanceId}} approaching deadline. {{slaHours}}h SLA. Action required.',
    pushTemplate: 'SLA WARNING: Grievance {{grievanceId}} - Action required',
    variables: ['assignedAdminName', 'grievanceId', 'grievanceSubject', 'studentName', 'studentRollNumber', 'priority', 'slaHours']
  }
};

export class GrievanceNotificationService {
  
  /**
   * Send notification for grievance submission
   */
  static async sendGrievanceSubmittedNotification(data: GrievanceNotificationData) {
    const template = NOTIFICATION_TEMPLATES.GRIEVANCE_SUBMITTED;
    
    // Send to student
    await this.sendNotification({
      template,
      recipient: {
        id: data.studentEmail,
        type: 'student',
        email: data.studentEmail,
        name: data.studentName,
        preferences: { email: true, sms: true, push: true }
      },
      data
    });

    // Create in-app notification
    await this.createInAppNotification({
      grievanceId: data.grievanceId,
      recipientType: 'student',
      recipientEmail: data.studentEmail,
      title: 'Grievance Submitted',
      message: `Your grievance "${data.grievanceSubject}" has been submitted successfully.`,
      type: 'info',
      category: 'grievance_update'
    });
  }

  /**
   * Send notification for grievance assignment
   */
  static async sendGrievanceAssignedNotification(data: GrievanceNotificationData) {
    const template = NOTIFICATION_TEMPLATES.GRIEVANCE_ASSIGNED;
    
    // Send to student
    await this.sendNotification({
      template,
      recipient: {
        id: data.studentEmail,
        type: 'student',
        email: data.studentEmail,
        name: data.studentName,
        preferences: { email: true, sms: false, push: true }
      },
      data
    });

    // Send to assigned admin
    if (data.assignedAdminEmail) {
      await this.sendNotification({
        template: {
          ...template,
          subject: 'New Grievance Assignment - #{grievanceId}',
          emailTemplate: template.emailTemplate.replace('Dear {{studentName}}', 'Dear {{assignedAdminName}}')
        },
        recipient: {
          id: data.assignedAdminEmail,
          type: 'admin',
          email: data.assignedAdminEmail,
          name: data.assignedAdminName || 'Admin',
          preferences: { email: true, sms: false, push: true }
        },
        data
      });
    }

    // Create in-app notifications
    await Promise.all([
      this.createInAppNotification({
        grievanceId: data.grievanceId,
        recipientType: 'student',
        recipientEmail: data.studentEmail,
        title: 'Grievance Assigned',
        message: `Your grievance has been assigned to ${data.assignedAdminName} for review.`,
        type: 'info',
        category: 'grievance_update'
      }),
      data.assignedAdminEmail ? this.createInAppNotification({
        grievanceId: data.grievanceId,
        recipientType: 'admin',
        recipientEmail: data.assignedAdminEmail,
        title: 'New Assignment',
        message: `Grievance "${data.grievanceSubject}" has been assigned to you.`,
        type: 'info',
        category: 'assignment'
      }) : Promise.resolve()
    ]);
  }

  /**
   * Send notification for grievance resolution
   */
  static async sendGrievanceResolvedNotification(data: GrievanceNotificationData) {
    const template = NOTIFICATION_TEMPLATES.GRIEVANCE_RESOLVED;
    
    // Send to student
    await this.sendNotification({
      template,
      recipient: {
        id: data.studentEmail,
        type: 'student',
        email: data.studentEmail,
        name: data.studentName,
        preferences: { email: true, sms: true, push: true }
      },
      data
    });

    // Create in-app notification
    await this.createInAppNotification({
      grievanceId: data.grievanceId,
      recipientType: 'student',
      recipientEmail: data.studentEmail,
      title: 'Grievance Resolved',
      message: `Your grievance "${data.grievanceSubject}" has been resolved. Please rate your experience.`,
      type: 'success',
      category: 'grievance_update',
      actionable: true,
      primaryAction: {
        text: 'Rate Experience',
        url: `/dashboard/grievances/${data.grievanceId}?action=rate`
      }
    });
  }

  /**
   * Send escalation notification
   */
  static async sendGrievanceEscalatedNotification(data: GrievanceNotificationData, escalatedTo: string[]) {
    const template = NOTIFICATION_TEMPLATES.GRIEVANCE_ESCALATED;
    
    // Send to escalated admins
    for (const adminEmail of escalatedTo) {
      await this.sendNotification({
        template,
        recipient: {
          id: adminEmail,
          type: 'admin',
          email: adminEmail,
          name: 'Admin',
          preferences: { email: true, sms: true, push: true }
        },
        data
      });

      // Create in-app notification
      await this.createInAppNotification({
        grievanceId: data.grievanceId,
        recipientType: 'admin',
        recipientEmail: adminEmail,
        title: 'Grievance Escalated',
        message: `URGENT: Grievance "${data.grievanceSubject}" requires immediate attention.`,
        type: 'error',
        category: 'escalation',
        actionable: true,
        primaryAction: {
          text: 'Review Now',
          url: `/admin/grievances/${data.grievanceId}`
        }
      });
    }
  }

  /**
   * Send new comment notification
   */
  static async sendNewCommentNotification(
    data: GrievanceNotificationData, 
    comment: { message: string; senderName: string; senderType: 'student' | 'admin' },
    recipientEmail: string,
    recipientType: 'student' | 'admin'
  ) {
    const template = NOTIFICATION_TEMPLATES.NEW_COMMENT;
    
    await this.sendNotification({
      template,
      recipient: {
        id: recipientEmail,
        type: recipientType,
        email: recipientEmail,
        name: recipientType === 'student' ? data.studentName : 'Admin',
        preferences: { email: false, sms: false, push: true }
      },
      data: {
        ...data,
        senderName: comment.senderName,
        commentMessage: comment.message,
        recipientName: recipientType === 'student' ? data.studentName : 'Admin'
      }
    });

    // Create in-app notification
    await this.createInAppNotification({
      grievanceId: data.grievanceId,
      recipientType,
      recipientEmail,
      title: 'New Comment',
      message: `${comment.senderName} added a comment to your grievance.`,
      type: 'info',
      category: 'communication',
      actionable: true,
      primaryAction: {
        text: 'View Comment',
        url: recipientType === 'student' 
          ? `/dashboard/grievances/${data.grievanceId}` 
          : `/admin/grievances/${data.grievanceId}`
      }
    });
  }

  /**
   * Send SLA warning notification
   */
  static async sendSLAWarningNotification(data: GrievanceNotificationData) {
    const template = NOTIFICATION_TEMPLATES.SLA_WARNING;
    
    if (data.assignedAdminEmail) {
      await this.sendNotification({
        template,
        recipient: {
          id: data.assignedAdminEmail,
          type: 'admin',
          email: data.assignedAdminEmail,
          name: data.assignedAdminName || 'Admin',
          preferences: { email: true, sms: true, push: true }
        },
        data
      });

      // Create in-app notification
      await this.createInAppNotification({
        grievanceId: data.grievanceId,
        recipientType: 'admin',
        recipientEmail: data.assignedAdminEmail,
        title: 'SLA Warning',
        message: `Grievance "${data.grievanceSubject}" is approaching its SLA deadline.`,
        type: 'warning',
        category: 'sla_warning',
        actionable: true,
        primaryAction: {
          text: 'Take Action',
          url: `/admin/grievances/${data.grievanceId}`
        }
      });
    }
  }

  /**
   * Generic notification sender
   */
  private static async sendNotification({
    template,
    recipient,
    data
  }: {
    template: NotificationTemplate;
    recipient: NotificationRecipient;
    data: any;
  }) {
    try {
      // Replace template variables
      const processedSubject = this.replaceTemplateVariables(template.subject, data);
      const processedEmailContent = this.replaceTemplateVariables(template.emailTemplate, data);
      const processedSmsContent = template.smsTemplate ? this.replaceTemplateVariables(template.smsTemplate, data) : null;

      // Send email
      if (recipient.preferences?.email && recipient.email) {
        await this.sendEmail({
          to: recipient.email,
          subject: processedSubject,
          html: processedEmailContent,
          templateId: template.id
        });
      }

      // Send SMS
      if (recipient.preferences?.sms && recipient.mobile && processedSmsContent) {
        await this.sendSMS({
          to: recipient.mobile,
          message: processedSmsContent,
          templateId: template.id
        });
      }

      // Log notification
      await this.logNotification({
        templateId: template.id,
        recipientId: recipient.id,
        recipientType: recipient.type,
        channels: {
          email: recipient.preferences?.email || false,
          sms: recipient.preferences?.sms || false,
          push: recipient.preferences?.push || false
        },
        data
      });

    } catch (error) {
      console.error('Error sending notification:', error);
    }
  }

  /**
   * Create in-app notification
   */
  private static async createInAppNotification({
    grievanceId,
    recipientType,
    recipientEmail,
    title,
    message,
    type,
    category,
    actionable = false,
    primaryAction = null,
    secondaryAction = null
  }: {
    grievanceId: string;
    recipientType: 'student' | 'admin';
    recipientEmail: string;
    title: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error';
    category: string;
    actionable?: boolean;
    primaryAction?: { text: string; url: string } | null;
    secondaryAction?: { text: string; url: string } | null;
  }) {
    try {
      await supabase
        .from('notifications')
        .insert({
          title,
          message,
          type,
          category: 'grievance',
          target_audience: recipientType === 'student' ? 'students' : 'admins',
          specific_users: [recipientEmail], // Using email as identifier
          is_active: true,
          enable_push_notification: true,
          enable_email_notification: false,
          enable_sms_notification: false,
          actionable,
          primary_action: primaryAction,
          secondary_action: secondaryAction,
          tags: ['grievance', category, grievanceId],
          created_by: null // System generated
        });
    } catch (error) {
      console.error('Error creating in-app notification:', error);
    }
  }

  /**
   * Replace template variables with actual data
   */
  private static replaceTemplateVariables(template: string, data: any): string {
    let processed = template;
    
    // Replace all variables in the format {{variableName}}
    Object.keys(data).forEach(key => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      processed = processed.replace(regex, data[key] || '');
    });
    
    return processed;
  }

  /**
   * Send email (implement with your email service)
   */
  private static async sendEmail({
    to,
    subject,
    html,
    templateId
  }: {
    to: string;
    subject: string;
    html: string;
    templateId: string;
  }) {
    // Implement with your email service (SendGrid, AWS SES, etc.)
    console.log('Sending email:', { to, subject, templateId });
    
    // Example implementation with fetch to email service
    // await fetch('/api/send-email', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ to, subject, html, templateId })
    // });
  }

  /**
   * Send SMS (implement with your SMS service)
   */
  private static async sendSMS({
    to,
    message,
    templateId
  }: {
    to: string;
    message: string;
    templateId: string;
  }) {
    // Implement with your SMS service (Twilio, AWS SNS, etc.)
    console.log('Sending SMS:', { to, message, templateId });
    
    // Example implementation
    // await fetch('/api/send-sms', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ to, message, templateId })
    // });
  }

  /**
   * Log notification for tracking
   */
  private static async logNotification({
    templateId,
    recipientId,
    recipientType,
    channels,
    data
  }: {
    templateId: string;
    recipientId: string;
    recipientType: string;
    channels: { email: boolean; sms: boolean; push: boolean };
    data: any;
  }) {
    try {
      // Log to database for analytics and tracking
      // This could be a separate notifications_log table
      console.log('Notification sent:', {
        templateId,
        recipientId,
        recipientType,
        channels,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error logging notification:', error);
    }
  }

  /**
   * Check and send SLA warnings for overdue grievances
   */
  static async checkAndSendSLAWarnings() {
    try {
      const { data: overdueGrievances } = await supabase
        .from('grievances')
        .select(`
          *,
          students (student_name, email, roll_number),
          admin_users!assigned_to (name, email),
          grievance_categories_config (sla_hours)
        `)
        .in('status', ['open', 'in_progress'])
        .not('assigned_to', 'is', null);

      if (!overdueGrievances) return;

      for (const grievance of overdueGrievances) {
        const createdAt = new Date(grievance.created_at);
        const now = new Date();
        const hoursOpen = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
        const slaHours = grievance.grievance_categories_config?.sla_hours || 72;
        
        // Send warning 4 hours before SLA deadline
        if (hoursOpen >= (slaHours - 4) && hoursOpen < slaHours) {
          await this.sendSLAWarningNotification({
            grievanceId: grievance.id,
            grievanceSubject: grievance.subject,
            studentName: grievance.students.student_name,
            studentEmail: grievance.students.email,
            studentRollNumber: grievance.students.roll_number,
            assignedAdminName: grievance.admin_users?.name,
            assignedAdminEmail: grievance.admin_users?.email,
            status: grievance.status,
            priority: grievance.priority,
            urgency: grievance.urgency,
            category: grievance.category,
            createdAt: grievance.created_at,
            updatedAt: grievance.updated_at,
            slaHours
          });
        }
      }
    } catch (error) {
      console.error('Error checking SLA warnings:', error);
    }
  }

  /**
   * Auto-escalate overdue grievances
   */
  static async autoEscalateOverdueGrievances() {
    try {
      const { data: overdueGrievances } = await supabase
        .from('grievances')
        .select(`
          *,
          students (student_name, email, roll_number),
          admin_users!assigned_to (name, email),
          grievance_categories_config (sla_hours, escalation_hours)
        `)
        .in('status', ['open', 'in_progress'])
        .is('escalated_to', null);

      if (!overdueGrievances) return;

      for (const grievance of overdueGrievances) {
        const createdAt = new Date(grievance.created_at);
        const now = new Date();
        const hoursOpen = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
        const escalationHours = grievance.grievance_categories_config?.escalation_hours || 48;
        
        if (hoursOpen >= escalationHours) {
          // Get escalation rules
          const { data: escalationRules } = await supabase
            .from('grievance_escalation_rules')
            .select('*')
            .eq('is_active', true)
            .order('escalation_level');

          if (escalationRules && escalationRules.length > 0) {
            const rule = escalationRules[0]; // Use first active rule
            
            // Update grievance
            await supabase
              .from('grievances')
              .update({
                escalated_to: rule.escalate_to,
                escalation_reason: `Auto-escalated after ${escalationHours} hours`,
                escalated_at: now.toISOString()
              })
              .eq('id', grievance.id);

            // Send escalation notification
            const escalatedAdminEmails = [rule.escalate_to]; // This should be fetched from admin_users table
            
            await this.sendGrievanceEscalatedNotification({
              grievanceId: grievance.id,
              grievanceSubject: grievance.subject,
              studentName: grievance.students.student_name,
              studentEmail: grievance.students.email,
              studentRollNumber: grievance.students.roll_number,
              assignedAdminName: grievance.admin_users?.name,
              assignedAdminEmail: grievance.admin_users?.email,
              status: grievance.status,
              priority: grievance.priority,
              urgency: grievance.urgency,
              category: grievance.category,
              createdAt: grievance.created_at,
              updatedAt: grievance.updated_at,
              escalationReason: `Auto-escalated after ${escalationHours} hours`,
              actualResolutionTime: `${Math.round(hoursOpen)} hours`
            }, escalatedAdminEmails);
          }
        }
      }
    } catch (error) {
      console.error('Error auto-escalating grievances:', error);
    }
  }
} 