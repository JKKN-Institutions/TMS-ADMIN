import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

interface SemesterFee {
  id: string;
  allocated_route_id: string;
  stop_name: string;
  semester_fee: number;
  academic_year: string;
  semester: string;
  effective_from: string;
  effective_until: string;
  is_active: boolean;
  created_at: string;
}

interface Route {
  id: string;
  route_number: string;
  route_name: string;
  start_location: string;
  end_location: string;
}

// GET - Fetch semester fees
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const routeId = searchParams.get('routeId');
    const academicYear = searchParams.get('academicYear');
    const semester = searchParams.get('semester');

    let query = supabase
      .from('semester_fees')
      .select(`
        id,
        allocated_route_id,
        stop_name,
        semester_fee,
        academic_year,
        semester,
        effective_from,
        effective_until,
        is_active,
        created_at
      `)
      .eq('is_active', true)
      .order('allocated_route_id')
      .order('stop_name');

    // Apply filters if provided
    if (routeId) {
      query = query.eq('allocated_route_id', routeId);
    }
    if (academicYear) {
      query = query.eq('academic_year', academicYear);
    }
    if (semester) {
      query = query.eq('semester', semester);
    }

    const { data: fees, error } = await query;

    if (error) {
      console.error('Error fetching semester fees:', error);
      return NextResponse.json({ error: 'Failed to fetch semester fees' }, { status: 500 });
    }

    // If we have fees, fetch the corresponding routes separately
    if (fees && fees.length > 0) {
      const routeIds = [...new Set(fees.map((fee: SemesterFee) => fee.allocated_route_id))];
      
      const { data: routes, error: routesError } = await supabase
        .from('routes')
        .select('id, route_number, route_name, start_location, end_location')
        .in('id', routeIds);

      if (routesError) {
        console.error('Error fetching routes:', routesError);
        return NextResponse.json({ error: 'Failed to fetch route information' }, { status: 500 });
      }

      // Combine the data manually
      const feesWithRoutes = fees.map((fee: SemesterFee) => ({
        ...fee,
        route_id: fee.allocated_route_id, // Add route_id for compatibility
        routes: routes?.find((route: Route) => route.id === fee.allocated_route_id) || null
      }));

      return NextResponse.json(feesWithRoutes, { status: 200 });
    }

    return NextResponse.json(fees || [], { status: 200 });
  } catch (error) {
    console.error('Error in semester fees GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Create semester fees
export async function POST(request: NextRequest) {
  try {
    const { routeId, stops, academicYear, semester, effectiveFrom, effectiveUntil } = await request.json();

    if (!routeId || !stops || !academicYear || !semester || !effectiveFrom || !effectiveUntil) {
      return NextResponse.json({ 
        error: 'Route ID, stops, academic year, semester, and effective dates are required' 
      }, { status: 400 });
    }

    if (!Array.isArray(stops) || stops.length === 0) {
      return NextResponse.json({ 
        error: 'Stops must be a non-empty array' 
      }, { status: 400 });
    }

    // Validate each stop has required fields
    for (const stop of stops) {
      if (!stop.stopName || !stop.fee || stop.fee <= 0) {
        return NextResponse.json({ 
          error: 'Each stop must have a valid name and fee' 
        }, { status: 400 });
      }
    }

    // Get current admin user (this would come from auth in a real app)
    const { data: adminUsers } = await supabase
      .from('admin_users')
      .select('id')
      .eq('is_active', true)
      .limit(1);

    const createdBy = adminUsers?.[0]?.id;

    // Prepare fee records with correct column names
    const feeRecords = stops.map(stop => ({
      allocated_route_id: routeId, // Use allocated_route_id instead of route_id
      stop_name: stop.stopName,
      semester_fee: stop.fee,
      academic_year: academicYear,
      semester: semester,
      effective_from: effectiveFrom,
      effective_until: effectiveUntil,
      created_by: createdBy,
      is_active: true
    }));

    const { data: insertedFees, error } = await supabase
      .from('semester_fees')
      .insert(feeRecords)
      .select(`
        id,
        allocated_route_id,
        stop_name,
        semester_fee,
        academic_year,
        semester,
        effective_from,
        effective_until,
        is_active,
        created_at
      `);

    if (error) {
      console.error('Error creating semester fees:', error);
      if (error.code === '23505') { // Unique constraint violation
        return NextResponse.json({ 
          error: 'Fees already exist for this route, academic year, and semester combination' 
        }, { status: 409 });
      }
      return NextResponse.json({ error: 'Failed to create semester fees' }, { status: 500 });
    }

    // Fetch route information for the created fees
    if (insertedFees && insertedFees.length > 0) {
      const { data: route, error: routeError } = await supabase
        .from('routes')
        .select('id, route_number, route_name, start_location, end_location')
        .eq('id', routeId)
        .single();

      if (!routeError && route) {
        const feesWithRoute = insertedFees.map((fee: SemesterFee) => ({
          ...fee,
          route_id: fee.allocated_route_id,
          routes: route
        }));
        return NextResponse.json(feesWithRoute, { status: 201 });
      }
    }

    return NextResponse.json(insertedFees, { status: 201 });
  } catch (error) {
    console.error('Error in semester fees POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT - Update semester fees
export async function PUT(request: NextRequest) {
  try {
    const { id, routeId, stopName, semesterFee, academicYear, semester, effectiveFrom, effectiveUntil, isActive } = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'Fee ID is required' }, { status: 400 });
    }

    const updateData: any = {};
    
    if (routeId !== undefined) updateData.allocated_route_id = routeId;
    if (stopName !== undefined) updateData.stop_name = stopName;
    if (semesterFee !== undefined) updateData.semester_fee = semesterFee;
    if (academicYear !== undefined) updateData.academic_year = academicYear;
    if (semester !== undefined) updateData.semester = semester;
    if (effectiveFrom !== undefined) updateData.effective_from = effectiveFrom;
    if (effectiveUntil !== undefined) updateData.effective_until = effectiveUntil;
    if (isActive !== undefined) updateData.is_active = isActive;

    const { data: updatedFee, error } = await supabase
      .from('semester_fees')
      .update(updateData)
      .eq('id', id)
      .select(`
        id,
        allocated_route_id,
        stop_name,
        semester_fee,
        academic_year,
        semester,
        effective_from,
        effective_until,
        is_active,
        created_at
      `)
      .single();

    if (error) {
      console.error('Error updating semester fee:', error);
      return NextResponse.json({ error: 'Failed to update semester fee' }, { status: 500 });
    }

    if (!updatedFee) {
      return NextResponse.json({ error: 'Semester fee not found' }, { status: 404 });
    }

    // Fetch route information for the updated fee
    const { data: route, error: routeError } = await supabase
      .from('routes')
      .select('id, route_number, route_name, start_location, end_location')
      .eq('id', updatedFee.allocated_route_id)
      .single();

    const feeWithRoute = {
      ...updatedFee,
      route_id: updatedFee.allocated_route_id,
      routes: routeError ? null : route
    };

    return NextResponse.json(feeWithRoute, { status: 200 });
  } catch (error) {
    console.error('Error in semester fees PUT:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Delete semester fees
export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'Fee ID is required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('semester_fees')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting semester fee:', error);
      return NextResponse.json({ error: 'Failed to delete semester fee' }, { status: 500 });
    }

    return NextResponse.json({ message: 'Semester fee deleted successfully' }, { status: 200 });
  } catch (error) {
    console.error('Error in semester fees DELETE:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
