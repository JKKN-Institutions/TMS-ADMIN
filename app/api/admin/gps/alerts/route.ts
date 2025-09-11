import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET - Fetch GPS alerts
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const routeId = searchParams.get('route_id');
    const unresolved = searchParams.get('unresolved') === 'true';

    let query = supabase
      .from('gps_alerts')
      .select(`
        *,
        routes (
          route_number,
          route_name
        ),
        gps_devices (
          device_id,
          device_name
        )
      `);

    if (routeId) {
      query = query.eq('route_id', routeId);
    }

    if (unresolved) {
      query = query.eq('resolved', false);
    }

    const { data: alerts, error } = await query
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Error fetching GPS alerts:', error);
      return NextResponse.json(
        { error: 'Failed to fetch GPS alerts' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: alerts || [],
      count: alerts?.length || 0
    });

  } catch (error) {
    console.error('GPS alerts fetch error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Create new GPS alert
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      route_id, 
      gps_device_id, 
      alert_type, 
      severity, 
      title, 
      description, 
      alert_data 
    } = body;

    // Validate required fields
    if (!alert_type || !title) {
      return NextResponse.json(
        { error: 'Alert type and title are required' },
        { status: 400 }
      );
    }

    // Create alert
    const { data: newAlert, error } = await supabase
      .from('gps_alerts')
      .insert([{
        route_id: route_id || null,
        gps_device_id: gps_device_id || null,
        alert_type,
        severity: severity || 'medium',
        title,
        description: description || null,
        alert_data: alert_data || null,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) {
      console.error('Error creating GPS alert:', error);
      return NextResponse.json(
        { error: 'Failed to create GPS alert' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: newAlert,
      message: 'GPS alert created successfully'
    });

  } catch (error) {
    console.error('GPS alert creation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT - Update alert status (acknowledge/resolve)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { alert_id, action, admin_user_id } = body;

    if (!alert_id || !action) {
      return NextResponse.json(
        { error: 'Alert ID and action are required' },
        { status: 400 }
      );
    }

    const currentTime = new Date().toISOString();
    let updateData: any = { updated_at: currentTime };

    if (action === 'acknowledge') {
      updateData.acknowledged = true;
      updateData.acknowledged_by = admin_user_id;
      updateData.acknowledged_at = currentTime;
    } else if (action === 'resolve') {
      updateData.resolved = true;
      updateData.resolved_at = currentTime;
      // If resolving, also acknowledge
      if (!updateData.acknowledged) {
        updateData.acknowledged = true;
        updateData.acknowledged_by = admin_user_id;
        updateData.acknowledged_at = currentTime;
      }
    } else {
      return NextResponse.json(
        { error: 'Invalid action. Use "acknowledge" or "resolve"' },
        { status: 400 }
      );
    }

    const { data: updatedAlert, error } = await supabase
      .from('gps_alerts')
      .update(updateData)
      .eq('id', alert_id)
      .select()
      .single();

    if (error) {
      console.error('Error updating GPS alert:', error);
      return NextResponse.json(
        { error: 'Failed to update GPS alert' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: updatedAlert,
      message: `GPS alert ${action}d successfully`
    });

  } catch (error) {
    console.error('GPS alert update error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 