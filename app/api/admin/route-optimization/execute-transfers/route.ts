import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const { optimizationId, transfers, adminId, date } = await request.json();
    
    console.log('🚀 Execute Transfers API called with:', {
      optimizationId,
      transferCount: transfers?.length,
      adminId,
      date,
      transfers: transfers?.slice(0, 2) // Log first 2 transfers for debugging
    });

    if (!optimizationId || !transfers || !Array.isArray(transfers) || !adminId) {
      console.error('❌ Missing required parameters:', { optimizationId, transfers: !!transfers, adminId });
      return NextResponse.json(
        { error: 'Missing required parameters: optimizationId, transfers array, and adminId' },
        { status: 400 }
      );
    }

    const results = {
      successful: 0,
      failed: 0,
      errors: [] as string[],
      cancelledBuses: [] as string[],
      transferDetails: [] as any[]
    };

    // Group transfers by source route to handle bus cancellations
    const transfersByRoute = transfers.reduce((acc: any, transfer: any) => {
      const routeId = transfer.fromRouteId || transfer.fromScheduleId?.replace('route-', '');
      console.log('🔍 Processing transfer:', {
        studentId: transfer.studentId,
        studentName: transfer.studentName,
        fromScheduleId: transfer.fromScheduleId,
        fromRouteId: transfer.fromRouteId,
        extractedRouteId: routeId,
        toScheduleId: transfer.toScheduleId,
        toRouteId: transfer.toRouteId
      });
      
      if (!routeId) {
        console.error('❌ Could not extract route ID from transfer:', transfer);
        return acc;
      }
      
      if (!acc[routeId]) {
        acc[routeId] = [];
      }
      acc[routeId].push(transfer);
      return acc;
    }, {});

    console.log('🔄 Processing transfers for routes:', Object.keys(transfersByRoute));
    console.log('🔄 Transfer groups:', Object.entries(transfersByRoute).map(([routeId, transfers]) => 
      `${routeId}: ${(transfers as any[]).length} transfers`
    ));

    // Process transfers for each route
    for (const [fromRouteId, routeTransfers] of Object.entries(transfersByRoute)) {
      const transferArray = routeTransfers as any[];
      
      try {
        // Get route information
        const { data: currentRoute, error: routeError } = await supabaseAdmin
          .from('routes')
          .select('id, route_name, route_number')
          .eq('id', fromRouteId)
          .single();

        if (routeError) {
          throw new Error(`Failed to fetch route ${fromRouteId}: ${routeError.message}`);
        }

        let successfulTransfersForRoute = 0;
        const routeTransferDetails = [];

        console.log(`🔄 Processing ${transferArray.length} transfers for route ${currentRoute.route_name}`);

        // Process each transfer for this route
        for (const transfer of transferArray) {
          try {
            console.log(`🔄 Processing individual transfer for ${transfer.studentName}:`, {
              fromRouteId,
              toScheduleId: transfer.toScheduleId,
              toRouteId: transfer.toRouteId
            });

            // Get target route information
            const targetRouteId = transfer.toRouteId || transfer.toScheduleId?.replace('route-', '');
            
            if (!targetRouteId) {
              throw new Error(`Could not determine target route ID from: ${transfer.toScheduleId || 'undefined'}`);
            }

            console.log(`🎯 Target route ID extracted: ${targetRouteId}`);

            const { data: targetRoute, error: targetError } = await supabaseAdmin
              .from('routes')
              .select('id, route_name, route_number')
              .eq('id', targetRouteId)
              .single();

            if (targetError) {
              console.error(`❌ Target route query failed:`, targetError);
              throw new Error(`Target route not found: ${targetError.message}`);
            }

            console.log(`✅ Found target route: ${targetRoute.route_name} (${targetRoute.id})`);

            // Check if target route has capacity (get current booking count)
            const tripDate = date || new Date().toISOString().split('T')[0];
            const { data: targetBookings, error: targetBookingError } = await supabaseAdmin
              .from('bookings')
              .select('id')
              .eq('route_id', targetRouteId)
              .eq('trip_date', tripDate)
              .eq('status', 'confirmed');

            if (targetBookingError) {
              throw new Error(`Failed to check target route capacity: ${targetBookingError.message}`);
            }

            const currentTargetPassengers = targetBookings?.length || 0;
            if (currentTargetPassengers >= 60) { // Assuming 60 seat buses
              throw new Error(`Target route ${targetRoute.route_name} is at capacity (${currentTargetPassengers}/60 seats)`);
            }

            // Update the booking to point to the new route
            // We need to work around the trigger issue by using a direct SQL update
            console.log(`🔄 Updating booking for student ${transfer.studentId}:`, {
              fromRouteId,
              targetRouteId,
              tripDate
            });

            // Use raw SQL to avoid trigger issues
            const { data: updatedBooking, error: bookingUpdateError } = await supabaseAdmin
              .rpc('update_booking_route', {
                p_student_id: transfer.studentId,
                p_from_route_id: fromRouteId,
                p_to_route_id: targetRouteId,
                p_trip_date: tripDate
              });

            // If the RPC doesn't exist, fall back to regular update but disable triggers temporarily
            if (bookingUpdateError && bookingUpdateError.message?.includes('function')) {
              console.log('🔄 RPC not found, using direct update...');
              
              const { data: directUpdate, error: directError } = await supabaseAdmin
                .from('bookings')
                .update({
                  route_id: targetRouteId,
                  updated_at: new Date().toISOString()
                })
                .eq('student_id', transfer.studentId)
                .eq('route_id', fromRouteId)
                .eq('trip_date', tripDate)
                .select('*');

              if (directError) {
                console.error(`❌ Direct booking update failed:`, directError);
                throw new Error(`Failed to update booking: ${directError.message}`);
              }

              if (!directUpdate || directUpdate.length === 0) {
                console.error(`❌ No booking found to update for:`, {
                  studentId: transfer.studentId,
                  fromRouteId,
                  tripDate
                });
                throw new Error(`No booking found for student ${transfer.studentName} on route ${fromRouteId} for date ${tripDate}`);
              }

              console.log(`✅ Successfully updated booking:`, directUpdate[0]);
            } else if (bookingUpdateError) {
              console.error(`❌ RPC booking update failed:`, bookingUpdateError);
              throw new Error(`Failed to update booking: ${bookingUpdateError.message}`);
            } else {
              console.log(`✅ Successfully updated booking via RPC`);
            }


            // Since we're working with bookings directly, no need to update schedule seat counts
            // The booking update above handles the transfer

            // Log the transfer (using correct column names for passenger_transfers table)
            const { error: transferLogError } = await supabaseAdmin
              .from('passenger_transfers')
              .insert({
                optimization_id: optimizationId,
                student_id: transfer.studentId,
                from_schedule_id: transfer.fromScheduleId, // Use schedule ID format for logging
                to_schedule_id: transfer.toScheduleId,
                from_route_name: transfer.fromRouteName,
                to_route_name: transfer.toRouteName || targetRoute.route_name,
                boarding_stop: transfer.boardingStop,
                transfer_type: transfer.transferType,
                transfer_status: 'completed',
                transfer_reason: 'Route optimization - low passenger count',
                executed_by: adminId,
                executed_at: new Date().toISOString()
              });

            if (transferLogError) {
              console.error('Failed to log transfer:', transferLogError);
            }

            successfulTransfersForRoute++;
            results.successful++;

            routeTransferDetails.push({
              studentId: transfer.studentId,
              studentName: transfer.studentName,
              fromRoute: transfer.fromRouteName,
              toRoute: transfer.toRouteName || targetRoute.route_name,
              boardingStop: transfer.boardingStop,
              status: 'completed'
            });

            console.log(`✅ Successfully transferred ${transfer.studentName} from ${transfer.fromRouteName} to ${targetRoute.route_name}`);

          } catch (transferError) {
            results.failed++;
            results.errors.push(`Transfer failed for student ${transfer.studentName}: ${transferError}`);
            
            routeTransferDetails.push({
              studentId: transfer.studentId,
              studentName: transfer.studentName,
              fromRoute: transfer.fromRouteName,
              toRoute: transfer.toRouteName,
              boardingStop: transfer.boardingStop,
              status: 'failed',
              error: String(transferError)
            });

            console.log(`❌ Failed to transfer ${transfer.studentName}: ${transferError}`);
          }
        }

        // Check if we should mark the route as optimized (if all passengers were transferred)
        const tripDate = date || new Date().toISOString().split('T')[0];
        const { data: remainingBookings, error: remainingError } = await supabaseAdmin
          .from('bookings')
          .select('id')
          .eq('route_id', fromRouteId)
          .eq('trip_date', tripDate)
          .eq('status', 'confirmed');

        const remainingPassengers = remainingBookings?.length || 0;
        
        if (remainingPassengers === 0 && successfulTransfersForRoute > 0) {
          // Mark this route as having no bookings for the day (effectively cancelled)
          results.cancelledBuses.push(`${currentRoute.route_name} (${currentRoute.route_number})`);
          console.log(`🚌 Route ${currentRoute.route_name} has no remaining passengers - can be cancelled`);
        }

        results.transferDetails.push({
          routeId: fromRouteId,
          routeName: currentRoute.route_name,
          routeNumber: currentRoute.route_number,
          totalTransfers: transferArray.length,
          successfulTransfers: successfulTransfersForRoute,
          failedTransfers: transferArray.length - successfulTransfersForRoute,
          busCancelled: remainingPassengers === 0,
          transfers: routeTransferDetails
        });

      } catch (routeError) {
        results.errors.push(`Failed to process route ${fromRouteId}: ${routeError}`);
        results.failed += transferArray.length;
      }
    }

    // Update the optimization record
    const { error: updateOptError } = await supabaseAdmin
      .from('route_optimizations')
      .update({
        updated_at: new Date().toISOString()
      })
      .eq('id', optimizationId);

    if (updateOptError) {
      console.error('Failed to update optimization record:', updateOptError);
    }

    return NextResponse.json({
      success: true,
      results: {
        totalTransfers: transfers.length,
        successfulTransfers: results.successful,
        failedTransfers: results.failed,
        cancelledBuses: results.cancelledBuses,
        errors: results.errors,
        transferDetails: results.transferDetails
      }
    });

  } catch (error) {
    console.error('Error executing transfers:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to execute transfers',
        details: String(error)
      },
      { status: 500 }
    );
  }
}
