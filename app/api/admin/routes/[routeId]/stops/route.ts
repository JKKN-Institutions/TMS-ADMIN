import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ routeId: string }> }
) {
  try {
    const resolvedParams = await params;
    const { routeId } = resolvedParams;

    if (!routeId) {
      return NextResponse.json(
        { error: 'Route ID is required' },
        { status: 400 }
      );
    }

    // Create Supabase admin client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify route exists
    const { data: route, error: routeError } = await supabase
      .from('routes')
      .select('id, route_number, route_name, status')
      .eq('id', routeId)
      .single();

    if (routeError || !route) {
      return NextResponse.json(
        { error: 'Route not found' },
        { status: 404 }
      );
    }

    // Fetch route stops
    const { data: stops, error: stopsError } = await supabase
      .from('route_stops')
      .select('id, stop_name, stop_time, sequence_order, is_major_stop')
      .eq('route_id', routeId)
      .order('sequence_order');

    if (stopsError) {
      console.error('Error fetching route stops:', stopsError);
      return NextResponse.json(
        { error: 'Failed to fetch route stops' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      route: {
        id: route.id,
        route_number: route.route_number,
        route_name: route.route_name,
        status: route.status
      },
      stops: stops || [],
      count: stops?.length || 0
    });

  } catch (error: any) {
    console.error('Error in route stops API:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
} 

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ routeId: string }> }
) {
  try {
    const resolvedParams = await params;
    const { routeId } = resolvedParams;
    const { stopData, insertAfterSequence } = await request.json();

    if (!routeId) {
      return NextResponse.json(
        { error: 'Route ID is required' },
        { status: 400 }
      );
    }

    if (!stopData || !stopData.stop_name || !stopData.stop_time) {
      return NextResponse.json(
        { error: 'Stop name and time are required' },
        { status: 400 }
      );
    }

    // Create Supabase admin client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify route exists
    const { data: route, error: routeError } = await supabase
      .from('routes')
      .select('id')
      .eq('id', routeId)
      .single();

    if (routeError || !route) {
      return NextResponse.json(
        { error: 'Route not found' },
        { status: 404 }
      );
    }

    // Determine sequence order
    let newSequenceOrder = 1;
    
    if (insertAfterSequence !== undefined && insertAfterSequence !== null) {
      // Get existing stops to update sequence numbers
      const { data: existingStops, error: fetchError } = await supabase
        .from('route_stops')
        .select('id, sequence_order')
        .eq('route_id', routeId)
        .gt('sequence_order', insertAfterSequence)
        .order('sequence_order');

      if (fetchError) {
        console.error('Error fetching existing stops:', fetchError);
        return NextResponse.json(
          { error: 'Failed to fetch existing stops' },
          { status: 500 }
        );
      }

      // Update sequence numbers for stops that come after the insertion point
      if (existingStops && existingStops.length > 0) {
        for (const stop of existingStops) {
          const { error: updateError } = await supabase
            .from('route_stops')
            .update({ sequence_order: stop.sequence_order + 1 })
            .eq('id', stop.id);
            
          if (updateError) {
            console.error('Error updating stop sequence:', updateError);
            return NextResponse.json(
              { error: 'Failed to update stop sequence' },
              { status: 500 }
            );
          }
        }
      }
      
      newSequenceOrder = insertAfterSequence + 1;
    } else {
      // Add to the end - get the highest sequence order
      const { data: lastStop } = await supabase
        .from('route_stops')
        .select('sequence_order')
        .eq('route_id', routeId)
        .order('sequence_order', { ascending: false })
        .limit(1);
        
      newSequenceOrder = lastStop && lastStop.length > 0 ? lastStop[0].sequence_order + 1 : 1;
    }

    // Insert the new stop
    const { data: newStop, error: insertError } = await supabase
      .from('route_stops')
      .insert([{
        route_id: routeId,
        stop_name: stopData.stop_name.trim(),
        stop_time: stopData.stop_time,
        sequence_order: newSequenceOrder,
        latitude: stopData.latitude || null,
        longitude: stopData.longitude || null,
        is_major_stop: stopData.is_major_stop || false,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting new stop:', insertError);
      return NextResponse.json(
        { error: 'Failed to add stop to route' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Stop added successfully',
      data: newStop
    });

  } catch (error: any) {
    console.error('Error adding stop to route:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ routeId: string }> }
) {
  try {
    const resolvedParams = await params;
    const { routeId } = resolvedParams;
    const { searchParams } = new URL(request.url);
    const stopId = searchParams.get('stopId');

    if (!routeId) {
      return NextResponse.json(
        { error: 'Route ID is required' },
        { status: 400 }
      );
    }

    if (!stopId) {
      return NextResponse.json(
        { error: 'Stop ID is required' },
        { status: 400 }
      );
    }

    // Create Supabase admin client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify route exists
    const { data: route, error: routeError } = await supabase
      .from('routes')
      .select('id')
      .eq('id', routeId)
      .single();

    if (routeError || !route) {
      return NextResponse.json(
        { error: 'Route not found' },
        { status: 404 }
      );
    }

    // Get the stop to be deleted to know its sequence order
    const { data: stopToDelete, error: fetchStopError } = await supabase
      .from('route_stops')
      .select('id, sequence_order')
      .eq('id', stopId)
      .eq('route_id', routeId)
      .single();

    if (fetchStopError || !stopToDelete) {
      return NextResponse.json(
        { error: 'Stop not found' },
        { status: 404 }
      );
    }

    // Delete the stop
    const { error: deleteError } = await supabase
      .from('route_stops')
      .delete()
      .eq('id', stopId)
      .eq('route_id', routeId);

    if (deleteError) {
      console.error('Error deleting stop:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete stop' },
        { status: 500 }
      );
    }

    // Update sequence numbers for stops that come after the deleted stop
    const { data: stopsToUpdate, error: fetchStopsError } = await supabase
      .from('route_stops')
      .select('id, sequence_order')
      .eq('route_id', routeId)
      .gt('sequence_order', stopToDelete.sequence_order)
      .order('sequence_order');

    if (fetchStopsError) {
      console.error('Error fetching stops to update:', fetchStopsError);
      // Don't fail the operation, just log the error
      console.warn('Stop deleted but sequence update failed');
    } else if (stopsToUpdate && stopsToUpdate.length > 0) {
      // Update sequence numbers
      for (const stop of stopsToUpdate) {
        const { error: updateError } = await supabase
          .from('route_stops')
          .update({ sequence_order: stop.sequence_order - 1 })
          .eq('id', stop.id);
          
        if (updateError) {
          console.error('Error updating stop sequence:', updateError);
          // Don't fail the operation, just log the error
          console.warn('Stop deleted but sequence update failed for stop:', stop.id);
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Stop deleted successfully'
    });

  } catch (error: any) {
    console.error('Error deleting stop from route:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
} 