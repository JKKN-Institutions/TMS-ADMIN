import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const { optimizationId, transfers, adminId } = await request.json();

    if (!optimizationId || !transfers || !Array.isArray(transfers) || !adminId) {
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

    // Group transfers by source schedule to handle bus cancellations
    const transfersBySchedule = transfers.reduce((acc: any, transfer: any) => {
      const scheduleId = transfer.fromScheduleId;
      if (!acc[scheduleId]) {
        acc[scheduleId] = [];
      }
      acc[scheduleId].push(transfer);
      return acc;
    }, {});

    // Process transfers for each schedule
    for (const [fromScheduleId, scheduleTransfers] of Object.entries(transfersBySchedule)) {
      const transferArray = scheduleTransfers as any[];
      
      try {
        // Start a transaction for each schedule
        const { data: currentSchedule, error: scheduleError } = await supabaseAdmin
          .from('schedules')
          .select(`
            id,
            booked_seats,
            available_seats,
            total_seats,
            route:routes(route_name, route_number)
          `)
          .eq('id', fromScheduleId)
          .single();

        if (scheduleError) {
          throw new Error(`Failed to fetch schedule ${fromScheduleId}: ${scheduleError.message}`);
        }

        let successfulTransfersForSchedule = 0;
        const scheduleTransferDetails = [];

        // Process each transfer for this schedule
        for (const transfer of transferArray) {
          try {
            // Verify target schedule has capacity
            const { data: targetSchedule, error: targetError } = await supabaseAdmin
              .from('schedules')
              .select('id, booked_seats, available_seats, total_seats')
              .eq('id', transfer.toScheduleId)
              .single();

            if (targetError) {
              throw new Error(`Target schedule not found: ${targetError.message}`);
            }

            if (targetSchedule.available_seats <= 0) {
              throw new Error(`Target schedule ${transfer.toScheduleId} has no available seats`);
            }

            // Update the booking to point to the new schedule
            const { error: bookingUpdateError } = await supabaseAdmin
              .from('bookings')
              .update({
                schedule_id: transfer.toScheduleId,
                route_id: transfer.toRouteId,
                updated_at: new Date().toISOString()
              })
              .eq('student_id', transfer.studentId)
              .eq('schedule_id', fromScheduleId);

            if (bookingUpdateError) {
              throw new Error(`Failed to update booking: ${bookingUpdateError.message}`);
            }

            // Update seat counts for both schedules
            const { error: sourceUpdateError } = await supabaseAdmin
              .from('schedules')
              .update({
                booked_seats: Math.max(0, currentSchedule.booked_seats - 1),
                available_seats: Math.min(currentSchedule.total_seats || 50, currentSchedule.available_seats + 1),
                updated_at: new Date().toISOString()
              })
              .eq('id', fromScheduleId);

            if (sourceUpdateError) {
              throw new Error(`Failed to update source schedule: ${sourceUpdateError.message}`);
            }

            const { error: targetUpdateError } = await supabaseAdmin
              .from('schedules')
              .update({
                booked_seats: targetSchedule.booked_seats + 1,
                available_seats: Math.max(0, targetSchedule.available_seats - 1),
                updated_at: new Date().toISOString()
              })
              .eq('id', transfer.toScheduleId);

            if (targetUpdateError) {
              throw new Error(`Failed to update target schedule: ${targetUpdateError.message}`);
            }

            // Log the transfer
            const { error: transferLogError } = await supabaseAdmin
              .from('passenger_transfers')
              .insert({
                optimization_id: optimizationId,
                student_id: transfer.studentId,
                from_schedule_id: fromScheduleId,
                to_schedule_id: transfer.toScheduleId,
                from_route_name: transfer.fromRouteName,
                to_route_name: transfer.toRouteName,
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

            successfulTransfersForSchedule++;
            results.successful++;

            scheduleTransferDetails.push({
              studentId: transfer.studentId,
              studentName: transfer.studentName,
              fromRoute: transfer.fromRouteName,
              toRoute: transfer.toRouteName,
              boardingStop: transfer.boardingStop,
              status: 'completed'
            });

          } catch (transferError) {
            results.failed++;
            results.errors.push(`Transfer failed for student ${transfer.studentName}: ${transferError}`);
            
            scheduleTransferDetails.push({
              studentId: transfer.studentId,
              studentName: transfer.studentName,
              fromRoute: transfer.fromRouteName,
              toRoute: transfer.toRouteName,
              boardingStop: transfer.boardingStop,
              status: 'failed',
              error: String(transferError)
            });
          }
        }

        // Check if we should cancel the bus (if all passengers were transferred)
        const remainingPassengers = currentSchedule.booked_seats - successfulTransfersForSchedule;
        
        if (remainingPassengers === 0 && successfulTransfersForSchedule > 0) {
          // Cancel the schedule
          const { error: cancelError } = await supabaseAdmin
            .from('schedules')
            .update({
              status: 'cancelled',
              booked_seats: 0,
              available_seats: currentSchedule.total_seats || 50,
              updated_at: new Date().toISOString()
            })
            .eq('id', fromScheduleId);

          if (cancelError) {
            console.error(`Failed to cancel schedule ${fromScheduleId}:`, cancelError);
            results.errors.push(`Failed to cancel bus ${currentSchedule.route?.route_name}: ${cancelError.message}`);
          } else {
            results.cancelledBuses.push(
              `${currentSchedule.route?.route_name} (${currentSchedule.route?.route_number})`
            );
          }
        }

        results.transferDetails.push({
          scheduleId: fromScheduleId,
          routeName: currentSchedule.route?.route_name,
          routeNumber: currentSchedule.route?.route_number,
          totalTransfers: transferArray.length,
          successfulTransfers: successfulTransfersForSchedule,
          failedTransfers: transferArray.length - successfulTransfersForSchedule,
          busCancelled: remainingPassengers === 0,
          transfers: scheduleTransferDetails
        });

      } catch (scheduleError) {
        results.errors.push(`Failed to process schedule ${fromScheduleId}: ${scheduleError}`);
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
