import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET - Fetch possible stops for a route
export async function GET(
  request: NextRequest,
  { params }: { params: { routeId: string } }
) {
  try {
    const { routeId } = params;

    const { data: possibleStops, error } = await supabase
      .from('route_possible_stops')
      .select(`
        *,
        source_route:routes!source_route_id(
          route_name,
          id
        )
      `)
      .eq('route_id', routeId)
      .order('sequence_order');

    if (error) {
      console.error('Error fetching possible stops:', error);
      return NextResponse.json(
        { error: 'Failed to fetch possible stops' },
        { status: 500 }
      );
    }

    return NextResponse.json({ possibleStops });
  } catch (error) {
    console.error('Error in GET possible stops:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Add possible stops to a route
export async function POST(
  request: NextRequest,
  { params }: { params: { routeId: string } }
) {
  try {
    console.log('=== POST POSSIBLE STOPS CALLED ===');
    console.log('Params received:', params);
    const { routeId } = params;
    console.log('Route ID:', routeId);
    
    // Log the raw request for debugging
    console.log('Request URL:', request.url);
    console.log('Request method:', request.method);
    console.log('Request headers:', Object.fromEntries(request.headers.entries()));
    
    if (!routeId) {
      return NextResponse.json(
        { error: 'Route ID is required' },
        { status: 400 }
      );
    }
    
    // Check if Supabase client is configured
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Missing Supabase environment variables');
      return NextResponse.json(
        { error: 'Database configuration error' },
        { status: 500 }
      );
    }
    
    let body;
    try {
      body = await request.json();
      console.log('✅ Request body parsed successfully:', body);
    } catch (parseError) {
      console.error('❌ Failed to parse request JSON:', parseError);
      return NextResponse.json(
        { error: 'Invalid JSON in request body', details: parseError instanceof Error ? parseError.message : 'Parse error' },
        { status: 400 }
      );
    }
    
    const { possibleStops } = body;

    // Debug logging
    console.log('Debug info:', {
      routeId: routeId,
      bodyReceived: body,
      possibleStopsCount: possibleStops?.length || 0,
      isArray: Array.isArray(possibleStops)
    });

    // Continue with normal processing

    if (!possibleStops || !Array.isArray(possibleStops)) {
      console.error('Invalid possible stops data:', possibleStops);
      return NextResponse.json(
        { error: 'Invalid possible stops data - must be an array' },
        { status: 400 }
      );
    }

    // Validate and prepare the data for insertion
    console.log('🔄 Starting data validation and preparation...');
    
    let stopsToInsert;
    let duplicateStops: Array<{ stop_name: string; source_route_id: string }> = [];
    
    try {
      stopsToInsert = possibleStops.map((stop, index) => {
        console.log(`Validating stop ${index + 1}:`, stop);
        
        // Validate required fields
        if (!stop.stop_name || !stop.stop_time || !stop.source_route_id) {
          throw new Error(`Missing required fields in stop ${index + 1}: stop_name=${stop.stop_name}, stop_time=${stop.stop_time}, source_route_id=${stop.source_route_id}`);
        }
        
        const preparedStop = {
          route_id: routeId,
          stop_name: stop.stop_name,
          stop_time: stop.stop_time,
          sequence_order: stop.sequence_order || index + 1,
          source_route_id: stop.source_route_id,
          latitude: stop.latitude || null,
          longitude: stop.longitude || null,
          is_major_stop: stop.is_major_stop || false
        };
        
        console.log(`✅ Stop ${index + 1} prepared:`, preparedStop);
        return preparedStop;
      });
      
      console.log('✅ All stops validated and prepared successfully');
      
      // Check for existing possible stops and filter out duplicates
      console.log('🔍 Checking for existing possible stops...');
      
      let newStops = [];
      let checkError = null;
      
      try {
        // Check each stop individually to avoid complex OR queries
        for (const stop of stopsToInsert) {
          const { data: existing, error: err } = await supabase
            .from('route_possible_stops')
            .select('stop_name, source_route_id')
            .eq('route_id', routeId)
            .eq('stop_name', stop.stop_name)
            .eq('source_route_id', stop.source_route_id)
            .limit(1);
          
          if (err) {
            checkError = err;
            break;
          }
          
          if (existing && existing.length > 0) {
            // This stop already exists - mark as duplicate
            duplicateStops.push({
              stop_name: stop.stop_name,
              source_route_id: stop.source_route_id
            });
            console.log(`🔄 Skipping duplicate stop: ${stop.stop_name}`);
          } else {
            // This stop is new - add to insertion list
            newStops.push(stop);
            console.log(`✅ New stop to add: ${stop.stop_name}`);
          }
        }
      } catch (queryError) {
        console.error('Error in duplicate check query:', queryError);
        checkError = queryError;
      }
      
      if (checkError) {
        console.error('Error checking existing stops:', checkError);
        // Continue with all stops if check failed, database constraints will handle duplicates
        newStops = stopsToInsert;
      }
      
      console.log(`📊 Summary: ${newStops.length} new stops to add, ${duplicateStops.length} duplicates found`);
      
      // Update stopsToInsert to only include new stops
      stopsToInsert = newStops;
      // Validation passed, continue to database insertion
      
    } catch (validationError) {
      console.error('❌ Data validation failed:', validationError);
      return NextResponse.json(
        { error: 'Data validation failed', details: validationError instanceof Error ? validationError.message : 'Validation error' },
        { status: 400 }
      );
    }

    // If no new stops to insert, return appropriate response
    if (stopsToInsert.length === 0) {
      console.log('⚠️ No new stops to insert - all were duplicates');
      return NextResponse.json({
        message: 'No new stops added - all selected stops were already present',
        addedCount: 0,
        skippedCount: duplicateStops.length,
        skippedStops: duplicateStops,
        data: []
      });
    }
    
    console.log('Inserting stops:', stopsToInsert);
    
    let data, error;
    try {
      const result = await supabase
        .from('route_possible_stops')
        .insert(stopsToInsert)
        .select();
      data = result.data;
      error = result.error;
    } catch (dbError) {
      console.error('Database operation failed:', dbError);
      return NextResponse.json(
        { 
          error: 'Database operation failed', 
          details: dbError instanceof Error ? dbError.message : 'Unknown database error'
        },
        { status: 500 }
      );
    }

    if (error) {
      console.error('Supabase error adding possible stops:', error);
      
      // Handle duplicate key constraint violation
      if (error.code === '23505' || error.message.includes('duplicate key value violates unique constraint')) {
        return NextResponse.json(
          { 
            error: 'Duplicate possible stop', 
            details: 'One or more of the selected stops are already added as possible stops for this route',
            errorType: 'duplicate_constraint'
          },
          { status: 409 } // Conflict status code
        );
      }
      
      // Handle foreign key constraint violation
      if (error.code === '23503' || error.message.includes('violates foreign key constraint')) {
        return NextResponse.json(
          { 
            error: 'Invalid route reference', 
            details: 'One or more route IDs are invalid',
            errorType: 'foreign_key_constraint'
          },
          { status: 400 }
        );
      }
      
      // Generic database error
      return NextResponse.json(
        { error: 'Failed to add possible stops', details: error.message },
        { status: 500 }
      );
    }

    console.log('Successfully inserted', data?.length || 0, 'possible stops');

    // Create comprehensive response including both added and skipped stops
    const addedCount = data?.length || 0;
    const skippedCount = duplicateStops.length;
    
    let message;
    if (skippedCount === 0) {
      message = `Successfully added ${addedCount} possible stop${addedCount === 1 ? '' : 's'}`;
    } else if (addedCount === 0) {
      message = `No new stops added - all ${skippedCount} selected stop${skippedCount === 1 ? ' was' : 's were'} already present`;
    } else {
      message = `Successfully added ${addedCount} new stop${addedCount === 1 ? '' : 's'}. ${skippedCount} stop${skippedCount === 1 ? ' was' : 's were'} already present and skipped`;
    }

    return NextResponse.json({ 
      message,
      addedCount,
      skippedCount,
      skippedStops: duplicateStops,
      data 
    });
  } catch (error) {
    console.error('Error in POST possible stops:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json(
      { 
        error: 'Internal server error', 
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

// DELETE - Remove a possible stop
export async function DELETE(
  request: NextRequest,
  { params }: { params: { routeId: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const stopId = searchParams.get('stopId');

    if (!stopId) {
      return NextResponse.json(
        { error: 'Stop ID is required' },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('route_possible_stops')
      .delete()
      .eq('id', stopId)
      .eq('route_id', params.routeId);

    if (error) {
      console.error('Error deleting possible stop:', error);
      return NextResponse.json(
        { error: 'Failed to delete possible stop' },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      message: 'Possible stop deleted successfully' 
    });
  } catch (error) {
    console.error('Error in DELETE possible stop:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
