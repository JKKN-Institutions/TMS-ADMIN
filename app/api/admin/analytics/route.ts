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

    // Fetch all analytics data in parallel
    const [
      paymentsData,
      studentsData,
      routesData,
      driversData,
      vehiclesData,
      grievancesData,
      bookingsData
    ] = await Promise.all([
      supabase.from('payments').select('*').order('created_at', { ascending: false }),
      supabase.from('students').select('*').order('created_at', { ascending: false }),
      supabase.from('routes').select('*').order('created_at', { ascending: false }),
      supabase.from('drivers').select('*').order('created_at', { ascending: false }),
      supabase.from('vehicles').select('*').order('created_at', { ascending: false }),
      supabase.from('grievances').select('*').order('created_at', { ascending: false }),
      supabase.from('bookings').select('*').order('created_at', { ascending: false })
    ]);

    // Check for errors
    if (paymentsData.error) {
      console.error('Payments error:', paymentsData.error);
    }
    if (studentsData.error) {
      console.error('Students error:', studentsData.error);
    }
    if (routesData.error) {
      console.error('Routes error:', routesData.error);
    }
    if (driversData.error) {
      console.error('Drivers error:', driversData.error);
    }
    if (vehiclesData.error) {
      console.error('Vehicles error:', vehiclesData.error);
    }
    if (grievancesData.error) {
      console.error('Grievances error:', grievancesData.error);
    }
    if (bookingsData.error) {
      console.error('Bookings error:', bookingsData.error);
    }

    return NextResponse.json({
      success: true,
      data: {
        payments: paymentsData.data || [],
        students: studentsData.data || [],
        routes: routesData.data || [],
        drivers: driversData.data || [],
        vehicles: vehiclesData.data || [],
        grievances: grievancesData.data || [],
        bookings: bookingsData.data || []
      }
    });

  } catch (error) {
    console.error('Analytics API Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 