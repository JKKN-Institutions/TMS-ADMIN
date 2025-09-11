import { NextRequest, NextResponse } from 'next/server';
import { GrievanceNotificationService } from '@/lib/grievance-notifications';

// POST - Trigger notification for grievance events
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, grievanceData, ...additionalData } = body;
    
    switch (type) {
      case 'submitted':
        await GrievanceNotificationService.sendGrievanceSubmittedNotification(grievanceData);
        break;
        
      case 'assigned':
        await GrievanceNotificationService.sendGrievanceAssignedNotification(grievanceData);
        break;
        
      case 'resolved':
        await GrievanceNotificationService.sendGrievanceResolvedNotification(grievanceData);
        break;
        
      case 'escalated':
        await GrievanceNotificationService.sendGrievanceEscalatedNotification(
          grievanceData, 
          additionalData.escalatedTo || []
        );
        break;
        
      case 'comment':
        await GrievanceNotificationService.sendNewCommentNotification(
          grievanceData,
          additionalData.comment,
          additionalData.recipientEmail,
          additionalData.recipientType
        );
        break;
        
      case 'sla_warning':
        await GrievanceNotificationService.sendSLAWarningNotification(grievanceData);
        break;
        
      default:
        return NextResponse.json({ error: 'Invalid notification type' }, { status: 400 });
    }
    
    return NextResponse.json({ success: true, message: 'Notification sent successfully' });
    
  } catch (error) {
    console.error('Error sending notification:', error);
    return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 });
  }
}

// GET - Check and send automated notifications (SLA warnings, escalations)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    
    switch (action) {
      case 'sla_warnings':
        await GrievanceNotificationService.checkAndSendSLAWarnings();
        return NextResponse.json({ success: true, message: 'SLA warnings checked and sent' });
        
      case 'auto_escalate':
        await GrievanceNotificationService.autoEscalateOverdueGrievances();
        return NextResponse.json({ success: true, message: 'Auto-escalation completed' });
        
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
    
  } catch (error) {
    console.error('Error in automated notifications:', error);
    return NextResponse.json({ error: 'Failed to process automated notifications' }, { status: 500 });
  }
} 