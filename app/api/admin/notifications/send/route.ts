import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { emailSMSService, EmailSMSService } from '@/lib/email-sms-service';

export async function POST(request: NextRequest) {
  try {
    const {
      notificationId,
      title,
      message,
      targetAudience = 'all',
      specificUsers = [],
      channels = ['email'], // ['email', 'sms', 'push']
      templateType = 'system_announcement',
      customTemplate,
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

    // Check if admin has permission to send notifications
    const canSendNotifications = ['super_admin', 'operations_admin'].includes(admin.role);
    if (!canSendNotifications) {
      return NextResponse.json({ 
        error: 'Insufficient permissions to send notifications' 
      }, { status: 403 });
    }

    // Get recipients based on target audience
    let recipients: any[] = [];

    if (targetAudience === 'students' || targetAudience === 'all') {
      const { data: students, error: studentsError } = await supabase
        .from('students')
        .select('id, student_name, email, mobile')
        .not('email', 'is', null);

      if (!studentsError && students) {
        recipients.push(...students.map((student: any) => ({
          id: student.id,
          name: student.student_name,
          email: student.email,
          mobile: student.mobile,
          type: 'student'
        })));
      }
    }

    if (targetAudience === 'admins' || targetAudience === 'all') {
      const { data: admins, error: adminsError } = await supabase
        .from('admin_users')
        .select('id, name, email')
        .eq('is_active', true)
        .not('email', 'is', null);

      if (!adminsError && admins) {
        recipients.push(...admins.map((admin: any) => ({
          id: admin.id,
          name: admin.name,
          email: admin.email,
          mobile: null, // Admins typically don't have mobile in this system
          type: 'admin'
        })));
      }
    }

    if (specificUsers.length > 0) {
      // Get specific users (could be students or admins)
      const { data: specificStudents } = await supabase
        .from('students')
        .select('id, student_name, email, mobile')
        .in('id', specificUsers);

      const { data: specificAdmins } = await supabase
        .from('admin_users')
        .select('id, name, email')
        .in('id', specificUsers);

      if (specificStudents) {
        recipients.push(...specificStudents.map((student: any) => ({
          id: student.id,
          name: student.student_name,
          email: student.email,
          mobile: student.mobile,
          type: 'student'
        })));
      }

      if (specificAdmins) {
        recipients.push(...specificAdmins.map((admin: any) => ({
          id: admin.id,
          name: admin.name,
          email: admin.email,
          mobile: null,
          type: 'admin'
        })));
      }
    }

    if (recipients.length === 0) {
      return NextResponse.json({ 
        success: true,
        message: 'No valid recipients found',
        results: { total: 0, emailSent: 0, smsSent: 0, failed: 0 }
      });
    }

    // Get notification template
    const templates = EmailSMSService.getDefaultTemplates();
    const template = customTemplate || templates[templateType] || templates.system_announcement;

    // Prepare template data
    const templateData = {
      title,
      message,
      notificationId,
      sentBy: admin.role,
      sentDate: new Date().toLocaleDateString()
    };

    // Get user notification preferences
    const recipientsWithPreferences = await Promise.all(
      recipients.map(async (recipient) => {
        // Get user notification settings
        const { data: settings } = await supabase
          .from('system_settings')
          .select('setting_value')
          .eq('setting_key', `notification_settings_${recipient.id}`)
          .single();

        const userSettings = settings?.setting_value || {
          emailEnabled: true,
          smsEnabled: false
        };

        return {
          id: recipient.id,
          name: recipient.name,
          email: recipient.email,
          mobile: recipient.mobile,
          preferences: {
            email: userSettings.emailEnabled && channels.includes('email'),
            sms: userSettings.smsEnabled && channels.includes('sms')
          }
        };
      })
    );

    // Send notifications
    let results = { total: 0, emailSent: 0, smsSent: 0, failed: 0 };

    if (channels.includes('email') || channels.includes('sms')) {
      const bulkResults = await emailSMSService.sendBulkNotifications(
        recipientsWithPreferences,
        template,
        templateData
      );
      
      results = {
        total: bulkResults.total,
        emailSent: bulkResults.emailSent,
        smsSent: bulkResults.smsSent,
        failed: bulkResults.failed
      };
    }

    // Send push notifications if requested
    if (channels.includes('push')) {
      try {
        const pushResponse = await fetch('/api/admin/push/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            notificationId,
            title,
            message,
            targetAudience,
            specificUsers,
            adminId
          })
        });

        if (pushResponse.ok) {
          const pushData = await pushResponse.json();
          console.log('Push notifications sent:', pushData.results);
        }
      } catch (error) {
        console.error('Error sending push notifications:', error);
      }
    }

    // Log notification send activity
    try {
      await supabase
        .from('notification_send_logs')
        .insert({
          notification_id: notificationId,
          title,
          message,
          target_audience: targetAudience,
          specific_users: specificUsers,
          channels,
          total_recipients: results.total,
          email_sent: results.emailSent,
          sms_sent: results.smsSent,
          failed_count: results.failed,
          sent_by: adminId,
          sent_at: new Date().toISOString()
        });
    } catch (logError) {
      console.error('Error logging notification send:', logError);
    }

    return NextResponse.json({
      success: true,
      message: 'Notifications sent successfully',
      results: {
        ...results,
        channels: channels,
        templateUsed: templateType
      }
    });

  } catch (error) {
    console.error('Error sending notifications:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
} 