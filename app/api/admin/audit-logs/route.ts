import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

interface AuditLog {
  id: string;
  user_id?: string;
  user_email?: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  resource_name?: string;
  old_values?: any;
  new_values?: any;
  ip_address?: string;
  user_agent?: string;
  session_id?: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  status: 'success' | 'failed' | 'pending';
  metadata?: any;
  created_at: string;
}

interface AuditLogFilters {
  user_id?: string;
  action?: string;
  resource_type?: string;
  severity?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// System activity types
const ACTIVITY_TYPES = {
  // User Management
  'user.created': 'User created',
  'user.updated': 'User updated',
  'user.deleted': 'User deleted',
  'user.login': 'User logged in',
  'user.logout': 'User logged out',
  'user.password_changed': 'Password changed',
  'user.role_changed': 'User role changed',
  'user.activated': 'User activated',
  'user.deactivated': 'User deactivated',
  
  // Route Management
  'route.created': 'Route created',
  'route.updated': 'Route updated',
  'route.deleted': 'Route deleted',
  'route.activated': 'Route activated',
  'route.deactivated': 'Route deactivated',
  
  // Schedule Management
  'schedule.created': 'Schedule created',
  'schedule.updated': 'Schedule updated',
  'schedule.deleted': 'Schedule deleted',
  'schedule.approved': 'Schedule approved',
  'schedule.rejected': 'Schedule rejected',
  'schedule.cancelled': 'Schedule cancelled',
  
  // Booking Management
  'booking.created': 'Booking created',
  'booking.updated': 'Booking updated',
  'booking.cancelled': 'Booking cancelled',
  'booking.confirmed': 'Booking confirmed',
  
  // Payment Management
  'payment.processed': 'Payment processed',
  'payment.failed': 'Payment failed',
  'payment.refunded': 'Payment refunded',
  'payment.disputed': 'Payment disputed',
  
  // System Events
  'system.maintenance_started': 'Maintenance started',
  'system.maintenance_ended': 'Maintenance ended',
  'system.backup_created': 'Backup created',
  'system.cache_cleared': 'Cache cleared',
  'system.settings_updated': 'Settings updated',
  'system.security_scan': 'Security scan performed',
  
  // API Events
  'api.key_created': 'API key created',
  'api.key_deleted': 'API key deleted',
  'api.key_used': 'API key used',
  'api.webhook_triggered': 'Webhook triggered',
  'api.rate_limit_exceeded': 'Rate limit exceeded',
  
  // Security Events
  'security.failed_login': 'Failed login attempt',
  'security.suspicious_activity': 'Suspicious activity detected',
  'security.permission_denied': 'Permission denied',
  'security.data_export': 'Data exported',
  'security.data_import': 'Data imported'
};

// GET - Fetch audit logs with filtering and pagination
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    const filters: AuditLogFilters = {
      user_id: searchParams.get('user_id') || undefined,
      action: searchParams.get('action') || undefined,
      resource_type: searchParams.get('resource_type') || undefined,
      severity: searchParams.get('severity') || undefined,
      status: searchParams.get('status') || undefined,
      date_from: searchParams.get('date_from') || undefined,
      date_to: searchParams.get('date_to') || undefined,
      search: searchParams.get('search') || undefined,
      page: parseInt(searchParams.get('page') || '1'),
      limit: parseInt(searchParams.get('limit') || '50'),
      sortBy: searchParams.get('sortBy') || 'created_at',
      sortOrder: (searchParams.get('sortOrder') as 'asc' | 'desc') || 'desc'
    };

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Start building query
    let query = supabase
      .from('audit_logs')
      .select(`
        id,
        user_id,
        user_email,
        action,
        resource_type,
        resource_id,
        resource_name,
        old_values,
        new_values,
        ip_address,
        user_agent,
        session_id,
        severity,
        status,
        metadata,
        created_at
      `, { count: 'exact' });

    // Apply filters
    if (filters.user_id) {
      query = query.eq('user_id', filters.user_id);
    }

    if (filters.action) {
      query = query.eq('action', filters.action);
    }

    if (filters.resource_type) {
      query = query.eq('resource_type', filters.resource_type);
    }

    if (filters.severity) {
      query = query.eq('severity', filters.severity);
    }

    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    if (filters.date_from) {
      query = query.gte('created_at', filters.date_from);
    }

    if (filters.date_to) {
      query = query.lte('created_at', filters.date_to);
    }

    if (filters.search) {
      query = query.or(`
        user_email.ilike.%${filters.search}%,
        action.ilike.%${filters.search}%,
        resource_name.ilike.%${filters.search}%,
        ip_address.ilike.%${filters.search}%
      `);
    }

    // Apply sorting
    query = query.order(filters.sortBy || 'created_at', { 
      ascending: filters.sortOrder === 'asc' 
    });

    // Apply pagination
    const from = ((filters.page || 1) - 1) * (filters.limit || 50);
    const to = from + (filters.limit || 50) - 1;
    query = query.range(from, to);

    const { data: logs, error, count } = await query;

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch audit logs' },
        { status: 500 }
      );
    }

    // Calculate pagination info
    const totalPages = Math.ceil((count || 0) / (filters.limit || 50));

    return NextResponse.json({
      success: true,
      data: logs || [],
      pagination: {
        page: filters.page || 1,
        limit: filters.limit || 50,
        total: count || 0,
        totalPages,
        hasNext: (filters.page || 1) < totalPages,
        hasPrev: (filters.page || 1) > 1
      },
      metadata: {
        activity_types: ACTIVITY_TYPES
      }
    });

  } catch (error: any) {
    console.error('Error in audit logs API:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Create new audit log entry
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      user_id,
      user_email,
      action,
      resource_type,
      resource_id,
      resource_name,
      old_values,
      new_values,
      severity = 'info',
      status = 'success',
      metadata
    } = body;

    // Validate required fields
    if (!action || !resource_type) {
      return NextResponse.json(
        { error: 'Action and resource_type are required' },
        { status: 400 }
      );
    }

    // Get client information from headers
    const ip_address = getClientIP(request);
    const user_agent = request.headers.get('user-agent') || undefined;
    const session_id = request.headers.get('x-session-id') || undefined;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Create audit log entry
    const { data: auditLog, error } = await supabase
      .from('audit_logs')
      .insert({
        user_id,
        user_email,
        action,
        resource_type,
        resource_id,
        resource_name,
        old_values,
        new_values,
        ip_address,
        user_agent,
        session_id,
        severity,
        status,
        metadata,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'Failed to create audit log' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: auditLog,
      message: 'Audit log created successfully'
    });

  } catch (error: any) {
    console.error('Error creating audit log:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Delete audit logs (admin only, for cleanup)
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const beforeDate = searchParams.get('before_date');
    const logIds = searchParams.get('ids')?.split(',');

    if (!beforeDate && !logIds) {
      return NextResponse.json(
        { error: 'Either before_date or ids parameter is required' },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let query = supabase.from('audit_logs').delete();

    if (beforeDate) {
      // Delete logs older than specified date
      query = query.lt('created_at', beforeDate);
    } else if (logIds) {
      // Delete specific log entries
      query = query.in('id', logIds);
    }

    const { error, count } = await query;

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'Failed to delete audit logs' },
        { status: 500 }
      );
    }

    // Create an audit log for this deletion
    await supabase
      .from('audit_logs')
      .insert({
        action: 'audit_logs.deleted',
        resource_type: 'audit_logs',
        resource_name: beforeDate ? `Logs before ${beforeDate}` : `${logIds?.length} log entries`,
        severity: 'warning',
        status: 'success',
        metadata: {
          deleted_count: count,
          deletion_criteria: beforeDate ? { before_date: beforeDate } : { ids: logIds }
        },
        ip_address: getClientIP(request),
        user_agent: request.headers.get('user-agent'),
        created_at: new Date().toISOString()
      });

    return NextResponse.json({
      success: true,
      message: `${count || 0} audit logs deleted successfully`,
      deleted_count: count || 0
    });

  } catch (error: any) {
    console.error('Error deleting audit logs:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// Helper function to get client IP address
function getClientIP(request: NextRequest): string {
  // Check various headers for client IP
  const forwarded = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');
  const clientIP = request.headers.get('x-client-ip');
  
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  
  if (realIP) {
    return realIP;
  }
  
  if (clientIP) {
    return clientIP;
  }
  
  // Fallback to connection info
  return 'unknown';
}

// Helper function to create audit log (can be used by other APIs)
export async function createAuditLog({
  user_id,
  user_email,
  action,
  resource_type,
  resource_id,
  resource_name,
  old_values,
  new_values,
  severity = 'info',
  status = 'success',
  metadata,
  ip_address,
  user_agent,
  session_id
}: {
  user_id?: string;
  user_email?: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  resource_name?: string;
  old_values?: any;
  new_values?: any;
  severity?: 'info' | 'warning' | 'error' | 'critical';
  status?: 'success' | 'failed' | 'pending';
  metadata?: any;
  ip_address?: string;
  user_agent?: string;
  session_id?: string;
}) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Supabase configuration missing for audit log');
      return null;
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data, error } = await supabase
      .from('audit_logs')
      .insert({
        user_id,
        user_email,
        action,
        resource_type,
        resource_id,
        resource_name,
        old_values,
        new_values,
        ip_address,
        user_agent,
        session_id,
        severity,
        status,
        metadata,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating audit log:', error);
      return null;
    }

    return data;

  } catch (error) {
    console.error('Error in createAuditLog helper:', error);
    return null;
  }
} 