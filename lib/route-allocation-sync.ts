import { supabase } from './supabase';

export interface RouteAllocationSync {
  studentId: string;
  routeId: string;
  boardingPoint?: string;
  boardingStopId?: string;
}

export class RouteAllocationSyncService {
  /**
   * Sync route allocation between legacy (students table) and new (student_route_allocations table) systems
   */
  static async syncRouteAllocation(data: RouteAllocationSync): Promise<void> {
    const { studentId, routeId, boardingPoint, boardingStopId } = data;

    try {
      // Start a transaction
      const { data: transaction, error: transactionError } = await supabase.rpc('begin_transaction');
      if (transactionError) throw transactionError;

      try {
        // Step 1: Update legacy system (students table)
        const { error: legacyError } = await supabase
          .from('students')
          .update({
            allocated_route_id: routeId,
            boarding_point: boardingPoint,
            transport_status: 'active',
            updated_at: new Date().toISOString()
          })
          .eq('id', studentId);

        if (legacyError) throw legacyError;

        // Step 2: Update new system (student_route_allocations table)
        // First, deactivate any existing allocations for this student
        const { error: deactivateError } = await supabase
          .from('student_route_allocations')
          .update({
            is_active: false,
            updated_at: new Date().toISOString()
          })
          .eq('student_id', studentId);

        if (deactivateError) throw deactivateError;

        // Then insert/update the new allocation
        const { error: newAllocationError } = await supabase
          .from('student_route_allocations')
          .upsert({
            student_id: studentId,
            route_id: routeId,
            is_active: true,
            boarding_stop_id: boardingStopId,
            allocated_at: new Date().toISOString()
          });

        if (newAllocationError) throw newAllocationError;

        // Commit transaction
        await supabase.rpc('commit_transaction');
        
        console.log('Route allocation synced successfully for student:', studentId);
      } catch (error) {
        // Rollback transaction on error
        await supabase.rpc('rollback_transaction');
        throw error;
      }
    } catch (error) {
      console.error('Error syncing route allocation:', error);
      throw error;
    }
  }

  /**
   * Get student's current route allocation from both systems
   */
  static async getStudentRouteAllocation(studentId: string): Promise<{
    legacy: any;
    new: any;
    synced: boolean;
  }> {
    try {
      // Get legacy allocation
      const { data: legacyData, error: legacyError } = await supabase
        .from('students')
        .select(`
          allocated_route_id,
          boarding_point,
          transport_status,
          routes:allocated_route_id(route_number, route_name)
        `)
        .eq('id', studentId)
        .single();

      if (legacyError) throw legacyError;

      // Get new allocation
      const { data: newData, error: newError } = await supabase
        .from('student_route_allocations')
        .select(`
          route_id,
          is_active,
          boarding_stop_id,
          allocated_at,
          routes:route_id(route_number, route_name),
          route_stops:boarding_stop_id(stop_name)
        `)
        .eq('student_id', studentId)
        .eq('is_active', true)
        .single();

      // Check if systems are synced
      const synced = legacyData?.allocated_route_id === newData?.route_id;

      return {
        legacy: legacyData,
        new: newData,
        synced
      };
    } catch (error) {
      console.error('Error getting route allocation:', error);
      throw error;
    }
  }

  /**
   * Sync all students with route allocations
   */
  static async syncAllStudentAllocations(): Promise<{
    success: number;
    failed: number;
    errors: any[];
  }> {
    const results = {
      success: 0,
      failed: 0,
      errors: [] as any[]
    };

    try {
      // Get all students with route allocations in legacy system
      const { data: studentsWithRoutes, error: studentsError } = await supabase
        .from('students')
        .select(`
          id,
          student_name,
          allocated_route_id,
          boarding_point,
          route_stops(id, stop_name)
        `)
        .not('allocated_route_id', 'is', null);

      if (studentsError) throw studentsError;

      // Process each student
      for (const student of studentsWithRoutes || []) {
        try {
          // Find boarding stop ID if boarding point is specified
          let boardingStopId: string | undefined;
          if (student.boarding_point) {
            const { data: routeStop, error: stopError } = await supabase
              .from('route_stops')
              .select('id')
              .eq('route_id', student.allocated_route_id)
              .eq('stop_name', student.boarding_point)
              .single();

            if (!stopError && routeStop) {
              boardingStopId = routeStop.id;
            }
          }

          await this.syncRouteAllocation({
            studentId: student.id,
            routeId: student.allocated_route_id,
            boardingPoint: student.boarding_point,
            boardingStopId
          });

          results.success++;
        } catch (error) {
          results.failed++;
          results.errors.push({
            studentId: student.id,
            studentName: student.student_name,
            error: error.message
          });
        }
      }

      return results;
    } catch (error) {
      console.error('Error syncing all student allocations:', error);
      throw error;
    }
  }

  /**
   * Remove route allocation from both systems
   */
  static async removeRouteAllocation(studentId: string): Promise<void> {
    try {
      // Update legacy system
      const { error: legacyError } = await supabase
        .from('students')
        .update({
          allocated_route_id: null,
          boarding_point: null,
          transport_status: 'inactive',
          updated_at: new Date().toISOString()
        })
        .eq('id', studentId);

      if (legacyError) throw legacyError;

      // Update new system
      const { error: newError } = await supabase
        .from('student_route_allocations')
        .update({
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq('student_id', studentId);

      if (newError) throw newError;

      console.log('Route allocation removed successfully for student:', studentId);
    } catch (error) {
      console.error('Error removing route allocation:', error);
      throw error;
    }
  }
} 