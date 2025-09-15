import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const { date, adminId, useEnhancedStops = true } = await request.json();
    console.log('🚀 Enhanced Route Optimization API called:', { date, adminId, useEnhancedStops });

    if (!date || !adminId) {
      console.error('❌ Missing parameters:', { date, adminId });
      return NextResponse.json(
        { error: 'Missing required parameters: date and adminId' },
        { status: 400 }
      );
    }

    // Step 0: Populate possible stops if not already done
    if (useEnhancedStops) {
      console.log('🔄 Analyzing and populating possible stops...');
      await supabaseAdmin.rpc('analyze_and_populate_possible_stops');
    }

    // Step 1: Get all routes with their booking counts for the given date
    const { data: routeBookings, error: routeBookingsError } = await supabaseAdmin
      .from('routes')
      .select(`
        id,
        route_name,
        route_number,
        start_location,
        end_location,
        status
      `)
      .eq('status', 'active');

    if (routeBookingsError) {
      console.error('❌ Error fetching routes:', routeBookingsError);
      throw routeBookingsError;
    }

    // Get booking counts for each route on the selected date
    const { data: bookingCounts, error: bookingCountsError } = await supabaseAdmin
      .rpc('get_route_booking_counts', { 
        selected_date: date 
      });

    // If RPC doesn't exist, fall back to direct query
    let routeBookingData;
    if (bookingCountsError || !bookingCounts) {
      console.log('📊 RPC not available, using direct query for booking counts...');
      
      const { data: directBookings, error: directError } = await supabaseAdmin
        .from('bookings')
        .select(`
          route_id,
          student_id,
          boarding_stop,
          student:students(
            student_name,
            roll_number,
            email
          )
        `)
        .eq('trip_date', date)
        .eq('status', 'confirmed');

      if (directError) {
        console.error('❌ Error fetching bookings:', directError);
        throw directError;
      }

      // Group bookings by route
      routeBookingData = (directBookings || []).reduce((acc: any, booking: any) => {
        if (!acc[booking.route_id]) {
          acc[booking.route_id] = [];
        }
        acc[booking.route_id].push(booking);
        return acc;
      }, {});
    } else {
      routeBookingData = bookingCounts.reduce((acc: any, item: any) => {
        acc[item.route_id] = item.bookings || [];
        return acc;
      }, {});
    }

    // Step 2: Identify low-crowd routes (≤30 passengers)
    const lowCrowdRoutes = [];
    const routeAnalysis = [];

    for (const route of routeBookings || []) {
      const bookings = routeBookingData[route.id] || [];
      const passengerCount = Array.isArray(bookings) ? bookings.length : 0;
      
      routeAnalysis.push({
        ...route,
        passengerCount,
        bookings
      });

      if (passengerCount <= 30 && passengerCount > 0) {
        lowCrowdRoutes.push({
          ...route,
          passengerCount,
          bookings
        });
      }
    }

    console.log(`📊 Found ${lowCrowdRoutes.length} low-crowd routes out of ${routeBookings?.length || 0} total routes`);

    if (lowCrowdRoutes.length === 0) {
      return NextResponse.json({
        hasLowCrowdRoutes: false,
        message: 'No low-crowd routes found for optimization',
        optimizationDate: date,
        routeAnalysis: routeAnalysis.map(r => ({
          routeId: r.id,
          routeName: r.route_name,
          routeNumber: r.route_number,
          passengerCount: r.passengerCount
        }))
      });
    }

    // Step 3: Enhanced transfer analysis using both regular and possible stops
    const optimizationResults = [];
    let totalPotentialSavings = 0;

    for (const route of lowCrowdRoutes) {
      const passengers = route.bookings || [];
      console.log(`🔄 Analyzing enhanced transfers for route ${route.route_name} (${passengers.length} passengers)...`);

      // Get all alternative routes with capacity
      const { data: allRoutes, error: allRoutesError } = await supabaseAdmin
        .from('routes')
        .select(`
          id,
          route_name,
          route_number,
          start_location,
          end_location
        `)
        .eq('status', 'active');

      if (allRoutesError) {
        console.error('Error fetching all routes:', allRoutesError);
        continue;
      }

      const alternativeRoutes = [];
      for (const altRoute of allRoutes || []) {
        if (altRoute.id === route.id) continue;
        
        const altBookings = routeBookingData[altRoute.id] || [];
        const altPassengerCount = Array.isArray(altBookings) ? altBookings.length : 0;
        const remainingCapacity = 60 - altPassengerCount;
        
        if (remainingCapacity > 0) {
          alternativeRoutes.push({
            ...altRoute,
            passengerCount: altPassengerCount,
            availableCapacity: remainingCapacity
          });
        }
      }

      // Enhanced stop analysis
      const passengerTransfers = [];
      let transferablePassengers = 0;

      for (const passenger of passengers) {
        const passengerStop = passenger.boarding_stop?.toLowerCase();
        let bestAlternative = null;
        let stopMatchType = null;

        for (const altRoute of alternativeRoutes) {
          // Get ALL stops for the alternative route (regular + possible)
          const { data: allStops, error: stopsError } = await supabaseAdmin
            .rpc('get_route_all_stops', { p_route_id: altRoute.id });

          if (stopsError) {
            console.error('Error fetching enhanced stops:', stopsError);
            continue;
          }

          // Check for matches in both regular and possible stops
          const matchingStop = allStops?.find((stop: any) => {
            const stopName = stop.stop_name?.toLowerCase();
            
            // Exact match
            if (stopName === passengerStop) return true;
            
            // Enhanced matching logic
            if (passengerStop === 'main stop') {
              return stopName.includes('bus stand') || 
                     stopName.includes('main') || 
                     stopName.includes('center') ||
                     stopName.includes('corner') ||
                     stopName.includes('colony') ||
                     stopName.includes('junction');
            }
            
            // Location-based matching
            if (passengerStop.includes('erode') && stopName.includes('erode')) return true;
            if (passengerStop.includes('gobi') && stopName.includes('gobi')) return true;
            if (passengerStop.includes('kolathur') && stopName.includes('kolathur')) return true;
            if (passengerStop.includes('salem') && stopName.includes('salem')) return true;
            if (passengerStop.includes('college') && stopName.includes('college')) return true;
            
            // Partial matching
            if (passengerStop.includes('main') && stopName.includes('main')) return true;
            if (passengerStop.includes('center') && stopName.includes('center')) return true;
            
            return false;
          });

          if (matchingStop && altRoute.availableCapacity > 0) {
            bestAlternative = {
              ...altRoute,
              matchingStop: matchingStop.stop_name,
              stopCategory: matchingStop.stop_category,
              sourceRouteName: matchingStop.source_route_name
            };
            stopMatchType = matchingStop.stop_category;
            break;
          }
        }

        if (bestAlternative) {
          transferablePassengers++;
          passengerTransfers.push({
            studentId: passenger.student_id,
            studentName: passenger.student?.student_name || 'Unknown',
            rollNumber: passenger.student?.roll_number || 'Unknown',
            currentStop: passenger.boarding_stop,
            targetRoute: bestAlternative.route_name,
            targetRouteId: bestAlternative.id,
            matchingStop: bestAlternative.matchingStop,
            stopCategory: bestAlternative.stopCategory,
            sourceRouteName: bestAlternative.sourceRouteName,
            availableCapacity: bestAlternative.availableCapacity,
            transferType: stopMatchType === 'regular' ? 'regular_stop' : 'possible_stop'
          });
        }
      }

      // Determine transfer classification
      let transferClassification;
      let potentialSavings = 0;

      if (transferablePassengers === passengers.length && passengers.length > 0) {
        transferClassification = 'full_transfer';
        potentialSavings = 5000; // Estimated savings from cancelling a bus
      } else if (transferablePassengers > 0) {
        transferClassification = 'partial_transfer';
        potentialSavings = transferablePassengers * 50; // Estimated per-passenger savings
      } else {
        transferClassification = 'no_transfer';
      }

      totalPotentialSavings += potentialSavings;

      optimizationResults.push({
        routeId: route.id,
        routeName: route.route_name,
        routeNumber: route.route_number,
        currentPassengers: passengers.length,
        transferablePassengers,
        transferClassification,
        potentialSavings,
        passengerTransfers,
        enhancedStopsUsed: passengerTransfers.filter(t => t.transferType === 'possible_stop').length
      });
    }

    // Create optimization record
    const { data: optimizationRecord, error: optimizationError } = await supabaseAdmin
      .from('route_optimizations')
      .insert({
        optimization_date: date,
        total_low_crowd_buses: lowCrowdRoutes.length,
        total_passengers_affected: optimizationResults.reduce((sum, r) => sum + r.transferablePassengers, 0),
        full_transfers: optimizationResults.filter(r => r.transferClassification === 'full_transfer').length,
        partial_transfers: optimizationResults.filter(r => r.transferClassification === 'partial_transfer').length,
        no_transfers: optimizationResults.filter(r => r.transferClassification === 'no_transfer').length,
        potential_savings: totalPotentialSavings,
        created_by: adminId
      })
      .select()
      .single();

    if (optimizationError) {
      console.error('Error creating optimization record:', optimizationError);
    }

    console.log(`✅ Enhanced optimization complete. Potential savings: ₹${totalPotentialSavings}`);

    return NextResponse.json({
      success: true,
      optimizationId: optimizationRecord?.id,
      optimizationDate: date,
      summary: {
        totalLowCrowdBuses: lowCrowdRoutes.length,
        totalPassengersAffected: optimizationResults.reduce((sum, r) => sum + r.transferablePassengers, 0),
        fullTransfers: optimizationResults.filter(r => r.transferClassification === 'full_transfer').length,
        partialTransfers: optimizationResults.filter(r => r.transferClassification === 'partial_transfer').length,
        noTransfers: optimizationResults.filter(r => r.transferClassification === 'no_transfer').length,
        potentialSavings: totalPotentialSavings,
        enhancedStopsUsed: optimizationResults.reduce((sum, r) => sum + r.enhancedStopsUsed, 0)
      },
      lowCrowdRoutes: optimizationResults,
      useEnhancedStops
    });

  } catch (error) {
    console.error('❌ Enhanced route optimization error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to perform enhanced route optimization', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}
