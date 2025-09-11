import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  try {
    // Create Supabase admin client (server-side only)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch dashboard stats
    const [
      studentsCount,
      driversCount,
      routesCount,
      vehiclesCount,
      totalBookings,
      confirmedBookings,
      pendingPayments,
      openGrievances
    ] = await Promise.all([
      supabase.from('students').select('*', { count: 'exact', head: true }),
      supabase.from('drivers').select('*', { count: 'exact', head: true }),
      supabase.from('routes').select('*', { count: 'exact', head: true }),
      supabase.from('vehicles').select('*', { count: 'exact', head: true }),
      supabase.from('bookings').select('*', { count: 'exact', head: true }),
      supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('status', 'confirmed'),
      supabase.from('payments').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('grievances').select('*', { count: 'exact', head: true }).eq('status', 'open')
    ]);

    // Calculate today's revenue
    const today = new Date().toISOString().split('T')[0];
    const { data: todayPayments } = await supabase
      .from('payments')
      .select('amount')
      .eq('status', 'completed')
      .gte('created_at', today);

    const todayRevenue = todayPayments?.reduce((sum, payment) => sum + (payment.amount || 0), 0) || 0;

    const stats = {
      totalStudents: studentsCount.count || 0,
      totalDrivers: driversCount.count || 0,
      totalRoutes: routesCount.count || 0,
      totalVehicles: vehiclesCount.count || 0,
      totalBookings: totalBookings.count || 0,
      confirmedBookings: confirmedBookings.count || 0,
      pendingPayments: pendingPayments.count || 0,
      openGrievances: openGrievances.count || 0,
      todayRevenue: todayRevenue,
      totalRevenue: todayRevenue // Simplified for now
    };

    // Fetch recent activities (simplified)
    const { data: recentActivities } = await supabase
      .from('bookings')
      .select('*, students(student_name), routes(route_name)')
      .order('created_at', { ascending: false })
      .limit(5);

    // Create mock critical alerts
    const criticalAlerts = [
      ...((pendingPayments.count || 0) > 10 ? [{ type: 'payment', message: `${pendingPayments.count || 0} pending payments require attention` }] : []),
      ...((openGrievances.count || 0) > 5 ? [{ type: 'grievance', message: `${openGrievances.count || 0} unresolved grievances` }] : [])
    ];

    // Mock performance metrics
    const performanceMetrics = {
      systemUptime: '99.9%',
      averageResponseTime: '0.8s',
      activeUsers: stats.totalStudents,
      dataUsage: '2.4GB'
    };

    return NextResponse.json({
      success: true,
      data: {
        stats,
        recentActivities: recentActivities || [],
        criticalAlerts,
        performanceMetrics
      }
    });

  } catch (error) {
    console.error('Dashboard API Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 