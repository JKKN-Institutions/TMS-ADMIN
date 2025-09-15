import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const { date, adminId } = await request.json();
    console.log('🚀 Route Optimization API called:', { date, adminId });

    if (!date || !adminId) {
      console.error('❌ Missing parameters:', { date, adminId });
      return NextResponse.json(
        { error: 'Missing required parameters: date and adminId' },
        { status: 400 }
      );
    }

    // Step 0: Check for existing transfers on this date
    console.log('🔍 Checking for existing transfers...');
    const existingTransfers = await checkExistingTransfers(date);
    
    if (existingTransfers.hasTransfers) {
      console.log(`📋 Found existing transfers for ${date}:`, existingTransfers.summary);
      return NextResponse.json({
        hasExistingTransfers: true,
        existingTransfers: existingTransfers.transfers,
        transferSummary: existingTransfers.summary,
        optimizationDate: date
      });
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
      console.log('📊 Using direct query for booking counts...');
      
      const { data: directBookingData, error: directError } = await supabaseAdmin
        .from('bookings')
        .select(`
          route_id,
          student_id,
          boarding_stop,
          seat_number,
          student:students(
            id,
            student_name,
            roll_number,
            email,
            mobile
          )
        `)
        .eq('trip_date', date)
        .eq('status', 'confirmed')
        .order('route_id');

      if (directError) {
        console.error('❌ Error fetching booking data:', directError);
        throw directError;
      }

      // Group bookings by route
      const bookingsByRoute = (directBookingData || []).reduce((acc: any, booking: any) => {
        if (!acc[booking.route_id]) {
          acc[booking.route_id] = [];
        }
        acc[booking.route_id].push(booking);
        return acc;
      }, {});

      routeBookingData = bookingsByRoute;
    } else {
      routeBookingData = bookingCounts;
    }

    // Analyze ALL routes and categorize them
    const lowCrowdRoutes = [];
    const normalRoutes = [];
    const noBookingRoutes = [];
    
    for (const route of routeBookings || []) {
      const routeBookings = routeBookingData[route.id] || [];
      const passengerCount = Array.isArray(routeBookings) ? routeBookings.length : 0;
      
      const routeWithData = {
        ...route,
        bookings: routeBookings,
        passengerCount
      };
      
      if (passengerCount === 0) {
        noBookingRoutes.push(routeWithData);
      } else if (passengerCount <= 30) {
        lowCrowdRoutes.push(routeWithData);
      } else {
        normalRoutes.push(routeWithData);
      }
    }

    console.log(`📊 Analysis Summary:
      - Total Routes: ${routeBookings?.length || 0}
      - Low-Crowd Routes (1-30 passengers): ${lowCrowdRoutes.length}
      - Normal Routes (31+ passengers): ${normalRoutes.length}
      - No Booking Routes (0 passengers): ${noBookingRoutes.length}
    `);
    
    // Log progress for debugging
    console.log('🔄 Step 1: Route Analysis Complete');
    console.log('🔄 Step 2: Starting Transfer Feasibility Analysis...');
    
    const allRoutesToAnalyze = [...lowCrowdRoutes, ...normalRoutes, ...noBookingRoutes];
    
    if (allRoutesToAnalyze.length === 0) {
      console.log('ℹ️ No routes found for optimization, returning empty result');
      
      return NextResponse.json({
        lowCrowdBuses: [],
        optimizationSummary: {
          totalLowCrowdBuses: 0,
          totalPassengersAffected: 0,
          fullTransfers: 0,
          partialTransfers: 0,
          noTransfers: 0,
          noBookings: 0,
          potentialSavings: 0
        }
      });
    }

    // Step 2: Analyze transfer feasibility for all routes
    const optimizationResults = [];
    let totalPassengersAffected = 0;
    let fullTransferCount = 0;
    let partialTransferCount = 0;
    let noTransferCount = 0;
    let noBookingCount = 0;
    let normalRouteCount = 0;

    for (const route of allRoutesToAnalyze) {
      const passengers = route.bookings || [];
      
      // Get schedule information for this route on the selected date
      const { data: scheduleData, error: scheduleError } = await supabaseAdmin
        .from('schedules')
        .select('departure_time, arrival_time')
        .eq('route_id', route.id)
        .eq('schedule_date', date)
        .limit(1)
        .single();
      
      const departureTime = scheduleData?.departure_time || 'N/A';
      const arrivalTime = scheduleData?.arrival_time || 'N/A';
      
      // Handle routes with no passengers - mark as "no bookings"
      if (passengers.length === 0) {
        noBookingCount++;
        optimizationResults.push({
          schedule: {
            id: `route-${route.id}`, // Use route-based ID since we're not using schedules
            routeId: route.id,
            routeName: route.route_name || 'Unknown Route',
            routeNumber: route.route_number || 'N/A',
            departureTime: departureTime,
            arrivalTime: arrivalTime,
            currentPassengers: 0,
            totalCapacity: 60, // Default bus capacity
            availableSeats: 60
          },
          passengers: [],
          transferType: 'no_bookings' as const,
          transferablePassengers: 0,
          totalPassengers: 0,
          canCancelBus: true,
          estimatedSavings: 0 // No savings since no passengers to transfer
        });
        continue;
      }

      // Handle normal routes (31+ passengers) - mark as "normal route"
      if (passengers.length > 30) {
        normalRouteCount++;
        optimizationResults.push({
          schedule: {
            id: `route-${route.id}`,
            routeId: route.id,
            routeName: route.route_name || 'Unknown Route',
            routeNumber: route.route_number || 'N/A',
            departureTime: departureTime,
            arrivalTime: arrivalTime,
            currentPassengers: passengers.length,
            totalCapacity: 60,
            availableSeats: 60 - passengers.length
          },
          passengers: passengers.map((passenger: any) => ({
            passenger: {
              id: passenger.student_id,
              name: passenger.student?.student_name || 'Unknown Student',
              rollNumber: passenger.student?.roll_number || 'N/A',
              email: passenger.student?.email || 'N/A',
              mobile: passenger.student?.mobile || 'N/A',
              boardingStop: passenger.boarding_stop,
              seatNumber: passenger.seat_number
            },
            targetBus: null,
            transferFeasible: false,
            reason: 'Normal capacity route - no optimization required'
          })),
          transferType: 'normal_route' as const,
          transferablePassengers: 0,
          totalPassengers: passengers.length,
          canCancelBus: false,
          estimatedSavings: 0
        });
        continue;
      }

      // This is a low-crowd route (1-30 passengers) - count passengers for transfer analysis
      totalPassengersAffected += passengers.length;

      // Step 3: Find alternative routes with available capacity from ALL routes (not just low-crowd)
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

      // Get booking counts for all routes to find those with available capacity
      const alternativeRoutes = [];
      for (const altRoute of allRoutes || []) {
        if (altRoute.id === route.id) continue; // Skip same route
        
        const altBookings = routeBookingData[altRoute.id] || [];
        const altPassengerCount = Array.isArray(altBookings) ? altBookings.length : 0;
        const remainingCapacity = 60 - altPassengerCount;
        
        // Only consider routes that have enough capacity for at least some passengers
        if (remainingCapacity > 0) {
          // Get schedule information for this alternative route
          const { data: altScheduleData } = await supabaseAdmin
            .from('schedules')
            .select('departure_time, arrival_time')
            .eq('route_id', altRoute.id)
            .eq('schedule_date', date)
            .limit(1)
            .single();
          
          alternativeRoutes.push({
            ...altRoute,
            passengerCount: altPassengerCount,
            availableCapacity: remainingCapacity,
            departureTime: altScheduleData?.departure_time || 'N/A',
            arrivalTime: altScheduleData?.arrival_time || 'N/A'
          });
        }
      }

      console.log(`🔄 Found ${alternativeRoutes.length} alternative routes with capacity for ${route.route_name} (${passengers.length} passengers)`);
      console.log(`🔄 Step 3: Analyzing transfers for route ${route.route_name} (${route.passengerCount} passengers)...`);

      // Get stops for the current route
      const { data: currentRouteStops, error: stopsError } = await supabaseAdmin
        .from('route_stops')
        .select('stop_name, sequence_order')
        .eq('route_id', route.id)
        .order('sequence_order');

      if (stopsError) {
        console.error('Error fetching current route stops:', stopsError);
        continue;
      }

      const currentStops = currentRouteStops?.map(s => s.stop_name.toLowerCase()) || [];

      // Analyze transfer feasibility
      const passengerTransfers = [];
      let transferablePassengers = 0;

      for (const passenger of passengers) {
        const passengerStop = passenger.boarding_stop?.toLowerCase();
        
        // Find alternative routes that have this passenger's boarding stop and available capacity
        let bestAlternative = null;
        
        for (const altRoute of alternativeRoutes) {
          // Get stops for the alternative route
          const { data: altStops } = await supabaseAdmin
            .from('route_stops')
            .select('stop_name, sequence_order')
            .eq('route_id', altRoute.id)
            .order('sequence_order');

          const altStopNames = (altStops || []).map(s => s.stop_name.toLowerCase());
          
          // Enhanced matching: check for exact match or partial match
          const hasMatchingStop = altStopNames.some(stopName => {
            // Exact match
            if (stopName === passengerStop) return true;
            
            // Generic "Main Stop" matching - assume passengers can board at any major stop on a route
            if (passengerStop === 'main stop') {
              // Match common main stops/bus stands
              return stopName.includes('bus stand') || 
                     stopName.includes('main') || 
                     stopName.includes('center') ||
                     stopName.includes('corner') ||
                     stopName.includes('colony') ||
                     stopName.includes('junction') ||
                     altStopNames.indexOf(stopName) <= 2; // First few stops are usually major
            }
            
            // Route-specific matching for named stops
            if (passengerStop.includes('erode') && stopName.includes('erode')) return true;
            if (passengerStop.includes('gobi') && stopName.includes('gobi')) return true;
            if (passengerStop.includes('kolathur') && stopName.includes('kolathur')) return true;
            if (passengerStop.includes('salem') && stopName.includes('salem')) return true;
            if (passengerStop.includes('college') && stopName.includes('college')) return true;
            
            // Partial matching for common patterns
            if (passengerStop.includes('main') && stopName.includes('main')) return true;
            if (passengerStop.includes('center') && stopName.includes('center')) return true;
            if (passengerStop.includes('secondary') && stopName.includes('office')) return true;
            if (passengerStop.includes('third') && stopName.includes('pirivu')) return true;
            if (passengerStop.includes('bus stand') && stopName.includes('bus stand')) return true;
            if (passengerStop.includes('railway') && stopName.includes('railway')) return true;
            
            // Broad compatibility - if passenger stop contains part of route stop name
            const passengerWords = passengerStop.split(' ');
            const stopWords = stopName.split(' ');
            for (const passengerWord of passengerWords) {
              if (passengerWord.length > 3) { // Only check meaningful words
                for (const stopWord of stopWords) {
                  if (stopWord.toLowerCase().includes(passengerWord) || 
                      passengerWord.includes(stopWord.toLowerCase())) {
                    return true;
                  }
                }
              }
            }
            
            return false;
          });
          
          if (hasMatchingStop) {
            console.log(`🔄 Found matching stop for passenger at "${passengerStop}" in route ${altRoute.route_name} (${altRoute.availableCapacity} seats available)`);
            if (!bestAlternative || altRoute.availableCapacity > bestAlternative.availableCapacity) {
              bestAlternative = altRoute;
            }
          }
        }

        if (bestAlternative) {
          passengerTransfers.push({
            passenger: {
              id: passenger.student_id,
              name: passenger.student?.student_name || 'Unknown',
              rollNumber: passenger.student?.roll_number || 'N/A',
              email: passenger.student?.email || 'N/A',
              mobile: passenger.student?.mobile || 'N/A',
              boardingStop: passenger.boarding_stop,
              seatNumber: passenger.seat_number
            },
            targetBus: {
              scheduleId: `route-${bestAlternative.id}`,
              routeName: bestAlternative.route_name || 'Unknown Route',
              routeNumber: bestAlternative.route_number || 'N/A',
              departureTime: bestAlternative.departureTime || 'N/A',
              arrivalTime: bestAlternative.arrivalTime || 'N/A',
              availableSeats: bestAlternative.availableCapacity,
              currentPassengers: bestAlternative.passengerCount
            },
            transferFeasible: true
          });
          transferablePassengers++;
        } else {
          passengerTransfers.push({
            passenger: {
              id: passenger.student_id,
              name: passenger.student?.student_name || 'Unknown',
              rollNumber: passenger.student?.roll_number || 'N/A',
              email: passenger.student?.email || 'N/A',
              mobile: passenger.student?.mobile || 'N/A',
              boardingStop: passenger.boarding_stop,
              seatNumber: passenger.seat_number
            },
            targetBus: null,
            transferFeasible: false,
            reason: 'No alternative route covers this boarding stop with available capacity'
          });
        }
      }

      // Determine transfer type
      let transferType: 'full_transfer' | 'partial_transfer' | 'no_transfer';
      let estimatedSavings = 0;
      
      if (transferablePassengers === passengers.length && passengers.length > 0) {
        transferType = 'full_transfer';
        fullTransferCount++;
        estimatedSavings = 2500; // Full bus cancellation savings
      } else if (transferablePassengers > 0) {
        transferType = 'partial_transfer';
        partialTransferCount++;
        estimatedSavings = Math.floor(transferablePassengers * 100); // ₹100 per transferred passenger
      } else {
        transferType = 'no_transfer';
        noTransferCount++;
        estimatedSavings = 0;
      }

      optimizationResults.push({
        schedule: {
          id: `route-${route.id}`,
          routeId: route.id,
          routeName: route.route_name || 'Unknown Route',
          routeNumber: route.route_number || 'N/A',
          departureTime: departureTime,
          arrivalTime: arrivalTime,
          currentPassengers: passengers.length,
          totalCapacity: 60, // Default bus capacity
          availableSeats: 60 - passengers.length
        },
        passengers: passengerTransfers,
        transferType,
        transferablePassengers,
        totalPassengers: passengers.length,
        canCancelBus: transferablePassengers === passengers.length && passengers.length > 0,
        estimatedSavings
      });
    }

    // Calculate potential savings
    const potentialSavings = optimizationResults.reduce((sum, result) => sum + result.estimatedSavings, 0);

    // Create optimization record (using only existing table columns)
    const { data: optimizationRecord, error: recordError } = await supabaseAdmin
      .from('route_optimizations')
      .insert({
        optimization_date: date,
        total_low_crowd_buses: lowCrowdRoutes.length, // Actual low-crowd routes only
        total_passengers_affected: totalPassengersAffected,
        full_transfers: fullTransferCount,
        partial_transfers: partialTransferCount,
        no_transfers: noTransferCount,
        potential_savings: potentialSavings,
        created_by: adminId
      })
      .select()
      .single();

    if (recordError) {
      console.error('Error creating optimization record:', recordError);
      // Continue without optimization record - the analysis is still valid
    } else {
      console.log('✅ Created optimization record:', optimizationRecord?.id);
    }

      return NextResponse.json({
        optimizationId: optimizationRecord?.id,
        lowCrowdBuses: optimizationResults,
        optimizationSummary: {
          totalLowCrowdBuses: lowCrowdRoutes.length,
          totalPassengersAffected,
          fullTransfers: fullTransferCount,
          partialTransfers: partialTransferCount,
          noTransfers: noTransferCount,
          noBookings: noBookingRoutes.length,
          normalRoutes: normalRoutes.length,
          potentialSavings
        }
      });

  } catch (error) {
    console.error('Error in route optimization:', error);
    return NextResponse.json(
      { error: 'Failed to perform route optimization' },
      { status: 500 }
    );
  }
}

// Helper function to check for existing transfers on a given date
async function checkExistingTransfers(date: string) {
  try {
    // Get all bookings that have been updated recently (indicating transfers)
    // and compare with original route assignments
    const { data: recentlyUpdatedBookings, error } = await supabaseAdmin
      .from('bookings')
      .select(`
        id,
        student_id,
        route_id,
        trip_date,
        boarding_stop,
        created_at,
        updated_at,
        student:students(
          student_name,
          roll_number
        ),
        route:routes(
          route_name,
          route_number
        )
      `)
      .eq('trip_date', date)
      .eq('status', 'confirmed')
      .gte('updated_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString()) // Updated today
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error checking existing transfers:', error);
      return { hasTransfers: false, transfers: [], summary: null };
    }

    // Check if there are any bookings that were updated recently
    // (This is a simple heuristic - in production you might want a more sophisticated approach)
    const transfersDetected = recentlyUpdatedBookings?.filter(booking => {
      const updatedTime = new Date(booking.updated_at);
      const createdTime = new Date(booking.created_at || booking.trip_date);
      // If updated more than 1 hour after the booking was created, likely a transfer
      return updatedTime.getTime() > createdTime.getTime() + (60 * 60 * 1000);
    }) || [];

    if (transfersDetected.length > 0) {
      // Group transfers by route
      const transfersByRoute = transfersDetected.reduce((acc: any, booking: any) => {
        const routeName = booking.route?.route_name || 'Unknown Route';
        if (!acc[routeName]) {
          acc[routeName] = [];
        }
        acc[routeName].push({
          studentId: booking.student_id,
          studentName: booking.student?.student_name || 'Unknown Student',
          rollNumber: booking.student?.roll_number || 'N/A',
          boardingStop: booking.boarding_stop,
          currentRoute: routeName,
          transferredAt: booking.updated_at
        });
        return acc;
      }, {});

      const summary = {
        totalTransfers: transfersDetected.length,
        affectedRoutes: Object.keys(transfersByRoute).length,
        transferDate: date,
        lastTransferTime: transfersDetected[0]?.updated_at
      };

      return {
        hasTransfers: true,
        transfers: transfersByRoute,
        summary
      };
    }

    return { hasTransfers: false, transfers: [], summary: null };
  } catch (error) {
    console.error('Error in checkExistingTransfers:', error);
    return { hasTransfers: false, transfers: [], summary: null };
  }
}
