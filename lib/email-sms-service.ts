// Email and SMS Notification Service

interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

interface SMSConfig {
  apiKey: string;
  senderId: string;
  baseUrl: string;
}

interface NotificationTemplate {
  subject: string;
  emailTemplate: string;
  smsTemplate?: string;
}

interface NotificationRecipient {
  id: string;
  name: string;
  email?: string;
  mobile?: string;
  preferences: {
    email: boolean;
    sms: boolean;
  };
}

export class EmailSMSService {
  private static instance: EmailSMSService;
  private emailConfig: EmailConfig;
  private smsConfig: SMSConfig;

  constructor() {
    this.emailConfig = {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || ''
      }
    };

    this.smsConfig = {
      apiKey: process.env.SMS_API_KEY || '',
      senderId: process.env.SMS_SENDER_ID || 'TMS',
      baseUrl: process.env.SMS_API_URL || 'https://api.textlocal.in/send/'
    };
  }

  static getInstance(): EmailSMSService {
    if (!EmailSMSService.instance) {
      EmailSMSService.instance = new EmailSMSService();
    }
    return EmailSMSService.instance;
  }

  // Send email notification
  async sendEmail(recipient: NotificationRecipient, template: NotificationTemplate, data: Record<string, any> = {}): Promise<boolean> {
    try {
      if (!recipient.email || !recipient.preferences.email) {
        console.log(`Email notification skipped for ${recipient.id} - no email or preference disabled`);
        return false;
      }

      // Process template variables
      const subject = this.processTemplate(template.subject, data);
      const htmlContent = this.processTemplate(template.emailTemplate, data);

      // Simulate email sending (replace with actual SMTP implementation)
      console.log('Sending email notification:', {
        to: recipient.email,
        subject,
        content: htmlContent.substring(0, 100) + '...'
      });

      // In production, you would use nodemailer or similar service:
      /*
      const transporter = nodemailer.createTransporter(this.emailConfig);
      await transporter.sendMail({
        from: this.emailConfig.auth.user,
        to: recipient.email,
        subject,
        html: htmlContent
      });
      */

      // Simulate delay
      await new Promise(resolve => setTimeout(resolve, 500));

      // Log email notification
      await this.logNotification({
        recipientId: recipient.id,
        channel: 'email',
        destination: recipient.email,
        subject,
        content: htmlContent,
        status: 'sent',
        sentAt: new Date().toISOString()
      });

      return true;
    } catch (error) {
      console.error('Error sending email:', error);
      
      // Log failed notification
      await this.logNotification({
        recipientId: recipient.id,
        channel: 'email',
        destination: recipient.email || '',
        subject: template.subject,
        content: template.emailTemplate,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        sentAt: new Date().toISOString()
      });

      return false;
    }
  }

  // Send SMS notification
  async sendSMS(recipient: NotificationRecipient, template: NotificationTemplate, data: Record<string, any> = {}): Promise<boolean> {
    try {
      if (!recipient.mobile || !recipient.preferences.sms || !template.smsTemplate) {
        console.log(`SMS notification skipped for ${recipient.id} - no mobile, preference disabled, or no SMS template`);
        return false;
      }

      // Process template variables
      const message = this.processTemplate(template.smsTemplate, data);

      // Simulate SMS sending (replace with actual SMS API)
      console.log('Sending SMS notification:', {
        to: recipient.mobile,
        message: message.substring(0, 50) + '...'
      });

      // In production, you would use SMS service API:
      /*
      const response = await fetch(this.smsConfig.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apikey: this.smsConfig.apiKey,
          numbers: recipient.mobile,
          message,
          sender: this.smsConfig.senderId
        })
      });
      */

      // Simulate delay
      await new Promise(resolve => setTimeout(resolve, 300));

      // Log SMS notification
      await this.logNotification({
        recipientId: recipient.id,
        channel: 'sms',
        destination: recipient.mobile,
        subject: 'SMS Notification',
        content: message,
        status: 'sent',
        sentAt: new Date().toISOString()
      });

      return true;
    } catch (error) {
      console.error('Error sending SMS:', error);

      // Log failed notification
      await this.logNotification({
        recipientId: recipient.id,
        channel: 'sms',
        destination: recipient.mobile || '',
        subject: 'SMS Notification',
        content: template.smsTemplate || '',
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        sentAt: new Date().toISOString()
      });

      return false;
    }
  }

  // Send multi-channel notification
  async sendNotification(recipient: NotificationRecipient, template: NotificationTemplate, data: Record<string, any> = {}): Promise<{
    email: boolean;
    sms: boolean;
  }> {
    const results = await Promise.allSettled([
      this.sendEmail(recipient, template, data),
      this.sendSMS(recipient, template, data)
    ]);

    return {
      email: results[0].status === 'fulfilled' ? results[0].value : false,
      sms: results[1].status === 'fulfilled' ? results[1].value : false
    };
  }

  // Send bulk notifications
  async sendBulkNotifications(recipients: NotificationRecipient[], template: NotificationTemplate, data: Record<string, any> = {}): Promise<{
    total: number;
    emailSent: number;
    smsSent: number;
    failed: number;
  }> {
    const results = await Promise.allSettled(
      recipients.map(recipient => this.sendNotification(recipient, template, data))
    );

    let emailSent = 0;
    let smsSent = 0;
    let failed = 0;

    results.forEach(result => {
      if (result.status === 'fulfilled') {
        if (result.value.email) emailSent++;
        if (result.value.sms) smsSent++;
      } else {
        failed++;
      }
    });

    return {
      total: recipients.length,
      emailSent,
      smsSent,
      failed
    };
  }

  // Process template variables
  private processTemplate(template: string, data: Record<string, any>): string {
    let processed = template;

    // Replace variables in the format {{variableName}}
    Object.keys(data).forEach(key => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      processed = processed.replace(regex, String(data[key] || ''));
    });

    // Add default variables
    const defaultVars = {
      currentDate: new Date().toLocaleDateString(),
      currentTime: new Date().toLocaleTimeString(),
      appName: 'Transport Management System',
      supportEmail: 'support@tms.com'
    };

    Object.keys(defaultVars).forEach(key => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      processed = processed.replace(regex, defaultVars[key as keyof typeof defaultVars]);
    });

    return processed;
  }

  // Log notification for audit trail
  private async logNotification(logData: {
    recipientId: string;
    channel: 'email' | 'sms';
    destination: string;
    subject: string;
    content: string;
    status: 'sent' | 'failed';
    error?: string;
    sentAt: string;
  }): Promise<void> {
    try {
      // In production, store this in database
      console.log('Notification log:', logData);
      
      // You would typically store this in a notifications_log table:
      /*
      await supabase
        .from('notification_logs')
        .insert({
          recipient_id: logData.recipientId,
          channel: logData.channel,
          destination: logData.destination,
          subject: logData.subject,
          content: logData.content,
          status: logData.status,
          error_message: logData.error,
          sent_at: logData.sentAt
        });
      */
    } catch (error) {
      console.error('Error logging notification:', error);
    }
  }

  // Get notification templates
  static getDefaultTemplates(): Record<string, NotificationTemplate> {
    return {
      enrollment_approved: {
        subject: 'Transport Enrollment Approved - {{appName}}',
        emailTemplate: `
          <h2>Transport Enrollment Approved!</h2>
          <p>Dear {{studentName}},</p>
          <p>Congratulations! Your transport enrollment request has been approved.</p>
          <p><strong>Route Details:</strong></p>
          <ul>
            <li>Route: {{routeNumber}} - {{routeName}}</li>
            <li>Boarding Point: {{boardingPoint}}</li>
            <li>Departure Time: {{departureTime}}</li>
          </ul>
          <p>You can now start booking trips through the student portal.</p>
          <p>Best regards,<br>{{appName}} Team</p>
        `,
        smsTemplate: 'Transport enrollment approved! Route: {{routeNumber}}. Boarding: {{boardingPoint}}. Start booking trips now.'
      },
      enrollment_rejected: {
        subject: 'Transport Enrollment Update - {{appName}}',
        emailTemplate: `
          <h2>Transport Enrollment Update</h2>
          <p>Dear {{studentName}},</p>
          <p>We regret to inform you that your transport enrollment request could not be approved at this time.</p>
          <p><strong>Reason:</strong> {{rejectionReason}}</p>
          <p>You can submit a new request or contact our support team for assistance.</p>
          <p>Best regards,<br>{{appName}} Team</p>
        `,
        smsTemplate: 'Transport enrollment could not be approved. Reason: {{rejectionReason}}. Contact support for assistance.'
      },
      payment_confirmation: {
        subject: 'Payment Confirmation - {{appName}}',
        emailTemplate: `
          <h2>Payment Confirmed</h2>
          <p>Dear {{studentName}},</p>
          <p>Your payment has been successfully processed.</p>
          <p><strong>Payment Details:</strong></p>
          <ul>
            <li>Amount: ₹{{amount}}</li>
            <li>Transaction ID: {{transactionId}}</li>
            <li>Payment Date: {{paymentDate}}</li>
            <li>Route: {{routeNumber}}</li>
          </ul>
          <p>Your transport pass is now active.</p>
          <p>Best regards,<br>{{appName}} Team</p>
        `,
        smsTemplate: 'Payment confirmed! Amount: ₹{{amount}}, Transaction: {{transactionId}}. Transport pass now active.'
      },
      grievance_resolved: {
        subject: 'Grievance Resolved - {{appName}}',
        emailTemplate: `
          <h2>Grievance Resolved</h2>
          <p>Dear {{studentName}},</p>
          <p>Your grievance has been resolved.</p>
          <p><strong>Grievance ID:</strong> {{grievanceId}}</p>
          <p><strong>Resolution:</strong> {{resolution}}</p>
          <p>If you need further assistance, please don't hesitate to contact us.</p>
          <p>Best regards,<br>{{appName}} Team</p>
        `,
        smsTemplate: 'Grievance {{grievanceId}} resolved. Resolution: {{resolution}}'
      },
      system_announcement: {
        subject: 'System Announcement - {{appName}}',
        emailTemplate: `
          <h2>{{title}}</h2>
          <p>{{message}}</p>
          <p>Date: {{currentDate}}</p>
          <p>Best regards,<br>{{appName}} Team</p>
        `,
        smsTemplate: '{{title}}: {{message}}'
      }
    };
  }
}

// Singleton instance
export const emailSMSService = EmailSMSService.getInstance(); 