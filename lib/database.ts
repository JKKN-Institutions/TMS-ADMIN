import { createClient } from '@supabase/supabase-js'
import {
  Route,
  Student,
  Driver,
  Vehicle,
  Schedule,
  Booking,
  Payment,
  Notification,
  Grievance,
  DashboardStats
} from '@/types';

// Lazy client creation to avoid environment variable loading issues during build
let _supabase: ReturnType<typeof createClient> | null = null;

function getSupabaseClient() {
  if (!_supabase) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      const missingVars = [];
      if (!supabaseUrl) missingVars.push('NEXT_PUBLIC_SUPABASE_URL');
      if (!supabaseAnonKey) missingVars.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
      
      throw new Error(`Missing Supabase environment variables: ${missingVars.join(', ')}. Please add them to your deployment environment variables.`);
    }

    _supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true
      }
    });
  }
  
  return _supabase;
}

// Export the lazy client via Proxy
const supabase = new Proxy({} as ReturnType<typeof createClient>, {
  get(target, prop) {
    return getSupabaseClient()[prop as keyof ReturnType<typeof createClient>];
  }
});

// Database service for all data operations
export class DatabaseService {
  
  // Dashboard Statistics
  static async getDashboardStats(): Promise<DashboardStats> {
    try {
      const [
        { count: totalStudents },
        { count: totalDrivers },
        { count: totalRoutes },
        { count: totalVehicles },
        { count: totalBookings },
        { count: activeBookings },
        { count: pendingPayments },
        { count: openGrievances }
      ] = await Promise.all([
        supabase.from('students').select('*', { count: 'exact', head: true }),
        supabase.from('drivers').select('*', { count: 'exact', head: true }),
        supabase.from('routes').select('*', { count: 'exact', head: true }),
        supabase.from('vehicles').select('*', { count: 'exact', head: true }),
        supabase.from('bookings').select('*', { count: 'exact', head: true }),
        supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('status', 'confirmed'),
        supabase.from('payments').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('grievances').select('*', { count: 'exact', head: true }).eq('status', 'open')
      ])

      // Calculate today's revenue
      const today = new Date()
      const todayStr = today.getFullYear() + '-' + 
                      String(today.getMonth() + 1).padStart(2, '0') + '-' + 
                      String(today.getDate()).padStart(2, '0')
      const { data: todayPayments } = await supabase
        .from('payments')
        .select('amount')
        .eq('status', 'paid')
        .gte('created_at', `${todayStr}T00:00:00`)
        .lt('created_at', `${todayStr}T23:59:59`)

      const todayRevenue = todayPayments?.reduce((sum, payment) => sum + (payment.amount || 0), 0) || 0

      // Get today's bookings
      const { count: todayBookings } = await supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', `${todayStr}T00:00:00`)
        .lt('created_at', `${todayStr}T23:59:59`)

      return {
        totalStudents: totalStudents || 0,
        totalDrivers: totalDrivers || 0,
        totalRoutes: totalRoutes || 0,
        activeRoutes: totalRoutes || 0, // For now, assume all routes are active
        totalVehicles: totalVehicles || 0,
        totalBookings: totalBookings || 0,
        activeBookings: activeBookings || 0,
        todayBookings: todayBookings || 0,
        pendingPayments: pendingPayments || 0,
        pendingGrievances: openGrievances || 0,
        todayRevenue: todayRevenue || 0,
        maintenanceAlerts: 0
      }
    } catch (error) {
      console.error('Error fetching dashboard stats:', error)
      // Return safe default values
      return {
        totalStudents: 0,
        totalDrivers: 0,
        totalRoutes: 0,
        activeRoutes: 0,
        totalVehicles: 0,
        totalBookings: 0,
        activeBookings: 0,
        todayBookings: 0,
        pendingPayments: 0,
        pendingGrievances: 0,
        todayRevenue: 0,
        maintenanceAlerts: 0
      }
    }
  }

  // Recent Activities
  static async getRecentActivities(limit: number = 10) {
    try {
      const activities: any[] = []

      // Get recent bookings
      const { data: recentBookings } = await supabase
        .from('bookings')
        .select(`
          id,
          created_at,
          status,
          students (student_name, roll_number),
          routes (route_name, route_number)
        `)
        .order('created_at', { ascending: false })
        .limit(5)

      if (recentBookings) {
        recentBookings.forEach(booking => {
          activities.push({
            id: `booking-${booking.id}`,
            type: 'booking',
            message: `New booking by ${Array.isArray(booking.students) ? booking.students[0]?.student_name : (booking.students as any)?.student_name || 'Unknown Student'}`,
            details: `Route: ${Array.isArray(booking.routes) ? booking.routes[0]?.route_name : (booking.routes as any)?.route_name || 'Unknown Route'}`,
            timestamp: booking.created_at,
            status: booking.status
          })
        })
      }

      // Get recent payments
      const { data: recentPayments } = await supabase
        .from('payments')
        .select(`
          id,
          created_at,
          amount,
          status,
          students (student_name, roll_number)
        `)
        .order('created_at', { ascending: false })
        .limit(5)

      if (recentPayments) {
        recentPayments.forEach(payment => {
          activities.push({
            id: `payment-${payment.id}`,
            type: 'payment',
            message: `Payment of ₹${payment.amount} by ${Array.isArray(payment.students) ? payment.students[0]?.student_name : (payment.students as any)?.student_name || 'Unknown Student'}`,
            details: `Status: ${payment.status}`,
            timestamp: payment.created_at,
            status: payment.status
          })
        })
      }

      // Get recent grievances
      const { data: recentGrievances } = await supabase
        .from('grievances')
        .select(`
          id,
          created_at,
          subject,
          status,
          students (student_name, roll_number)
        `)
        .order('created_at', { ascending: false })
        .limit(5)

      if (recentGrievances) {
        recentGrievances.forEach(grievance => {
          activities.push({
            id: `grievance-${grievance.id}`,
            type: 'grievance',
            message: `New grievance: ${grievance.subject}`,
            details: `By: ${Array.isArray(grievance.students) ? grievance.students[0]?.student_name : (grievance.students as any)?.student_name || 'Unknown Student'}`,
            timestamp: grievance.created_at,
            status: grievance.status
          })
        })
      }

      // Sort by timestamp and return latest 10
      return activities
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, limit)

    } catch (error) {
      console.error('Error fetching recent activities:', error)
      return []
    }
  }

  // Critical Alerts
  static async getCriticalAlerts() {
    try {
      const alerts: any[] = []

      // Overdue vehicle maintenance
      const { data: overdueVehicles } = await supabase
        .from('vehicles')
        .select('vehicle_number, last_maintenance, maintenance_due')
        .lt('maintenance_due', new Date().toISOString())

      if (overdueVehicles) {
        overdueVehicles.forEach(vehicle => {
          alerts.push({
            id: `maintenance-${vehicle.vehicle_number}`,
            type: 'maintenance',
            severity: 'high',
            title: 'Overdue Maintenance',
            message: `Vehicle ${vehicle.vehicle_number} maintenance is overdue`,
            timestamp: vehicle.maintenance_due
          })
        })
      }

      // Pending payments over 30 days
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      
      const { data: overduePayments } = await supabase
        .from('payments')
        .select(`
          id,
          amount,
          due_date,
          students (student_name, roll_number)
        `)
        .eq('status', 'pending')
        .lt('due_date', thirtyDaysAgo.toISOString())

      if (overduePayments) {
        overduePayments.forEach(payment => {
          alerts.push({
            id: `payment-${payment.id}`,
            type: 'payment',
            severity: 'medium',
            title: 'Overdue Payment',
            message: `Payment of ₹${payment.amount} overdue from ${Array.isArray(payment.students) ? payment.students[0]?.student_name : (payment.students as any)?.student_name}`,
            timestamp: payment.due_date
          })
        })
      }

      // High priority unresolved grievances
      const { data: urgentGrievances } = await supabase
        .from('grievances')
        .select(`
          id,
          subject,
          created_at,
          students (student_name, roll_number)
        `)
        .eq('priority', 'urgent')
        .in('status', ['open', 'in_progress'])

      if (urgentGrievances) {
        urgentGrievances.forEach(grievance => {
          alerts.push({
            id: `grievance-${grievance.id}`,
            type: 'grievance',
            severity: 'high',
            title: 'Urgent Grievance',
            message: `Urgent grievance: ${grievance.subject}`,
            timestamp: grievance.created_at
          })
        })
      }

      return alerts.slice(0, 5) // Return top 5 alerts

    } catch (error) {
      console.error('Error fetching critical alerts:', error)
      return []
    }
  }

  // Performance Metrics
  static async getPerformanceMetrics() {
    try {
      // Calculate route efficiency (bookings vs capacity)
      const { data: routeStats } = await supabase
        .from('routes')
        .select(`
          id,
          route_name,
          capacity,
          bookings (id, status)
        `)

      let avgOccupancy = 0
      if (routeStats && routeStats.length > 0) {
        const totalOccupancy = routeStats.reduce((sum, route) => {
          const activeBookings = route.bookings?.filter(b => b.status === 'confirmed').length || 0
          const capacity = route.capacity || 1
          return sum + (activeBookings / capacity)
        }, 0)
        avgOccupancy = Math.round((totalOccupancy / routeStats.length) * 100)
      }

      // Calculate payment collection rate
      const { data: paymentStats } = await supabase
        .from('payments')
        .select('status')

      let collectionRate = 0
      if (paymentStats && paymentStats.length > 0) {
        const paidPayments = paymentStats.filter(p => p.status === 'paid').length
        collectionRate = Math.round((paidPayments / paymentStats.length) * 100)
      }

      // Calculate grievance resolution rate
      const { data: grievanceStats } = await supabase
        .from('grievances')
        .select('status')

      let resolutionRate = 0
      if (grievanceStats && grievanceStats.length > 0) {
        const resolvedGrievances = grievanceStats.filter(g => g.status === 'resolved').length
        resolutionRate = Math.round((resolvedGrievances / grievanceStats.length) * 100)
      }

      // System uptime (mock - in real system would come from monitoring)
      const systemUptime = 99.5

      return {
        routeEfficiency: avgOccupancy || 0,
        routeUtilization: avgOccupancy || 0,
        paymentCollection: collectionRate || 0,
        grievanceResolution: resolutionRate || 0,
        onTimePerformance: 95, // Mock value
        systemUptime: systemUptime || 99.5
      }

    } catch (error) {
      console.error('Error fetching performance metrics:', error)
      return {
        routeEfficiency: 0,
        routeUtilization: 0,
        paymentCollection: 0,
        grievanceResolution: 0,
        onTimePerformance: 0,
        systemUptime: 0
      }
    }
  }

  // Routes
  static async getRoutes() {
    try {
      console.log('Fetching routes from database...');
      
      // First, try simple query to check if routes exist
      const { data: simpleData, error: simpleError } = await supabase
        .from('routes')
        .select('*')
        .order('route_number')

      if (simpleError) {
        console.error('Supabase error in getRoutes:', simpleError)
        throw new Error(`Database error: ${simpleError.message}`)
      }

      if (!simpleData || simpleData.length === 0) {
        console.log('No routes found in database (fresh installation)')
        return []
      }

      console.log(`Found ${simpleData.length} routes in database, fetching with relationships...`);

      // Try enhanced query with relationships only if routes exist
      try {
        const { data: enhancedData, error: enhancedError } = await supabase
          .from('routes')
          .select(`
            *,
            route_stops(
              id,
              stop_name,
              stop_time,
              sequence_order,
              latitude,
              longitude,
              is_major_stop
            ),
            drivers(
              id,
              name,
              license_number,
              phone,
              status
            ),
            vehicles(
              id,
              registration_number,
              model,
              capacity,
              status
            )
          `)
          .order('route_number')

        if (enhancedError) {
          console.warn('Enhanced query failed, using simple data:', enhancedError)
          // Use simple data if enhanced query fails
          return this.transformSimpleRouteData(simpleData)
        }

        console.log('Successfully fetched routes with relationships')
        return this.transformEnhancedRouteData(enhancedData || [])

      } catch (enhancedQueryError) {
        console.warn('Enhanced query failed, falling back to simple data:', enhancedQueryError)
        return this.transformSimpleRouteData(simpleData)
      }

    } catch (error) {
      console.error('Error fetching routes:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        error: error
      })
      return []
    }
  }

  // Helper method to transform simple route data
  static transformSimpleRouteData(routes: any[]) {
    return routes.map(route => ({
      id: route.id,
      route_number: route.route_number || 'N/A',
      route_name: route.route_name || 'Unnamed Route',
      start_location: route.start_location || 'Unknown',
      end_location: route.end_location || 'Unknown',
      start_latitude: route.start_latitude,
      start_longitude: route.start_longitude,
      end_latitude: route.end_latitude,
      end_longitude: route.end_longitude,
      departure_time: route.departure_time,
      arrival_time: route.arrival_time,
      total_capacity: route.total_capacity || 0,
      current_passengers: route.current_passengers || 0,
      fare: route.fare || 0,
      distance: route.distance || 0,
      duration: route.duration || 'N/A',
      status: route.status || 'active',
      driver_id: route.driver_id,
      vehicle_id: route.vehicle_id,
      created_at: route.created_at,
      updated_at: route.updated_at,
      route_stops: [],
      drivers: null,
      vehicles: null,
      occupancy_percentage: route.total_capacity > 0 
        ? Math.round(((route.current_passengers || 0) / route.total_capacity) * 100) 
        : 0,
      capacity: route.total_capacity || 0,
      bookings: []
    }))
  }

  // Helper method to transform enhanced route data
  static transformEnhancedRouteData(routes: any[]) {
    return routes.map(route => ({
      id: route.id,
      route_number: route.route_number || 'N/A',
      route_name: route.route_name || 'Unnamed Route',
      start_location: route.start_location || 'Unknown',
      end_location: route.end_location || 'Unknown',
      start_latitude: route.start_latitude,
      start_longitude: route.start_longitude,
      end_latitude: route.end_latitude,
      end_longitude: route.end_longitude,
      departure_time: route.departure_time,
      arrival_time: route.arrival_time,
      total_capacity: route.total_capacity || 0,
      current_passengers: route.current_passengers || 0,
      fare: route.fare || 0,
      distance: route.distance || 0,
      duration: route.duration || 'N/A',
      status: route.status || 'active',
      driver_id: route.driver_id,
      vehicle_id: route.vehicle_id,
      created_at: route.created_at,
      updated_at: route.updated_at,
      
      // Enhanced route stops with proper ordering (guarded as array)
      route_stops: (Array.isArray(route.route_stops) ? route.route_stops : [])
        .sort((a: any, b: any) => a.sequence_order - b.sequence_order)
        .map((stop: any) => ({
          id: stop.id,
          stop_name: stop.stop_name,
          stop_time: stop.stop_time,
          sequence_order: stop.sequence_order,
          latitude: stop.latitude,
          longitude: stop.longitude,
          is_major_stop: stop.is_major_stop || false
        })),
      
      // Driver information (always array for UI safety)
      drivers: route.drivers
        ? [
            {
              id: route.drivers.id,
              name: route.drivers.name,
              license_number: route.drivers.license_number,
              phone: route.drivers.phone,
              status: route.drivers.status
            }
          ]
        : [],
      
      // Vehicle information (always array for UI safety)
      vehicles: route.vehicles
        ? [
            {
              id: route.vehicles.id,
              registration_number: route.vehicles.registration_number,
              model: route.vehicles.model,
              capacity: route.vehicles.capacity,
              status: route.vehicles.status
            }
          ]
        : [],
      
      // Computed fields
      occupancy_percentage: route.total_capacity > 0 
        ? Math.round(((route.current_passengers || 0) / route.total_capacity) * 100) 
        : 0,
      
      // Legacy compatibility fields
      capacity: route.total_capacity || 0,
      bookings: []
    }))
  }

  // Add student to database (only for transport users)
  static async addStudent(studentData: any) {
    try {
      console.log('Adding student to database:', studentData);
      console.log('🔍 Debug parent mobile numbers:', {
        father_name: studentData.father_name,
        father_mobile: studentData.father_mobile,
        mother_name: studentData.mother_name,
        mother_mobile: studentData.mother_mobile
      });
      
      // Determine emergency contact information
      // Priority: Father's info first, then Mother's info as fallback
      let emergencyContactName = null;
      let emergencyContactPhone = null;
      
      if (studentData.father_name && studentData.father_mobile) {
        emergencyContactName = studentData.father_name;
        emergencyContactPhone = studentData.father_mobile;
      } else if (studentData.mother_name && studentData.mother_mobile) {
        emergencyContactName = studentData.mother_name;
        emergencyContactPhone = studentData.mother_mobile;
      }
      
      console.log('Emergency contact info:', { emergencyContactName, emergencyContactPhone });
      
      const { data, error } = await supabase
        .from('students')
        .insert([{
          external_id: studentData.external_id, // ID from external API
          student_name: studentData.student_name,
          roll_number: studentData.roll_number,
          email: studentData.email,
          mobile: studentData.mobile,
          department_name: studentData.department_name,
          institution_name: studentData.institution_name,
          program_name: studentData.program_name,
          degree_name: studentData.degree_name,
          father_name: studentData.father_name || null,
          mother_name: studentData.mother_name || null,
          father_mobile: studentData.father_mobile || null,
          mother_mobile: studentData.mother_mobile || null,
          date_of_birth: studentData.date_of_birth || null,
          gender: studentData.gender || null,
          address_street: studentData.address_street || null,
          address_district: studentData.address_district || null,
          address_state: studentData.address_state || null,
          address_pin_code: studentData.address_pin_code || null,
          is_profile_complete: studentData.is_profile_complete || false,
          
          // Emergency contact information mapped from external API
          emergency_contact_name: emergencyContactName,
          emergency_contact_phone: emergencyContactPhone,
          
          // Transport-related fields
          allocated_route_id: studentData.allocated_route_id || null,
          boarding_point: studentData.boarding_point || null,
          transport_status: studentData.transport_status || 'active',
          payment_status: studentData.payment_status || 'current',
          total_fines: 0,
          outstanding_amount: studentData.outstanding_amount || 0,
          
          // Enrollment status fields - CRITICAL FOR LOGIN FLOW
          transport_enrolled: true, // Set to true when manually enrolling from admin
          enrollment_status: 'approved', // Set to approved for manual enrollment
          
          // Quota and payment fields
          quota_type_id: studentData.quota_type_id || null,
          transport_fee_amount: studentData.transport_fee_amount || 0,
          
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select()

      if (error) {
        console.error('Error adding student:', error);
        throw new Error(`Failed to add student: ${error.message}`);
      }

      console.log('Student added successfully with emergency contact:', data[0]);
      console.log('🔍 Debug what was actually saved to DB:', {
        father_name: data[0].father_name,
        father_mobile: data[0].father_mobile,
        mother_name: data[0].mother_name,
        mother_mobile: data[0].mother_mobile,
        emergency_contact_name: data[0].emergency_contact_name,
        emergency_contact_phone: data[0].emergency_contact_phone
      });
      return data[0];
    } catch (error) {
      console.error('Exception adding student:', error);
      throw error;
    }
  }

  // Update student transport assignment
  static async updateStudentTransport(studentId: string, transportData: any) {
    try {
      console.log('Updating student transport:', studentId, transportData);
      
      // Step 1: Update legacy system (students table)
      const { data, error } = await supabase
        .from('students')
        .update({
          allocated_route_id: transportData.allocated_route_id || null,
          boarding_point: transportData.boarding_point || null,
          transport_status: transportData.transport_status || 'active',
          payment_status: transportData.payment_status || 'current',
          updated_at: new Date().toISOString()
        })
        .eq('id', studentId)
        .select()

      if (error) {
        console.error('Error updating student transport:', error);
        throw new Error(`Failed to update student transport: ${error.message}`);
      }

      // Step 2: Sync with new system (student_route_allocations table)
      if (transportData.allocated_route_id) {
        try {
          // Find boarding stop ID if boarding point is specified
          let boardingStopId = null;
          if (transportData.boarding_point) {
            const { data: routeStop, error: stopError } = await supabase
              .from('route_stops')
              .select('id')
              .eq('route_id', transportData.allocated_route_id)
              .eq('stop_name', transportData.boarding_point)
              .single();

            if (!stopError && routeStop) {
              boardingStopId = routeStop.id;
            }
          }

          // Deactivate existing allocations
          await supabase
            .from('student_route_allocations')
            .update({
              is_active: false,
              updated_at: new Date().toISOString()
            })
            .eq('student_id', studentId);

          // Insert new allocation
          await supabase
            .from('student_route_allocations')
            .upsert({
              student_id: studentId,
              route_id: transportData.allocated_route_id,
              is_active: true,
              boarding_stop_id: boardingStopId,
              allocated_at: new Date().toISOString()
            });

          console.log('Route allocation synced successfully');
        } catch (syncError) {
          console.error('Error syncing route allocation:', syncError);
          // Don't throw error - legacy update was successful
        }
      } else {
        // If no route assigned, deactivate all allocations
        try {
          await supabase
            .from('student_route_allocations')
            .update({
              is_active: false,
              updated_at: new Date().toISOString()
            })
            .eq('student_id', studentId);
        } catch (syncError) {
          console.error('Error deactivating route allocations:', syncError);
        }
      }

      console.log('Student transport updated successfully:', data[0]);
      return data[0];
    } catch (error) {
      console.error('Exception updating student transport:', error);
      throw error;
    }
  }

  // Fix emergency contacts for existing students
  static async fixEmergencyContacts() {
    try {
      console.log('Fixing emergency contacts for existing students...');
      
      const { data: students, error: fetchError } = await supabase
        .from('students')
        .select('id, father_name, father_mobile, mother_name, mother_mobile, emergency_contact_name, emergency_contact_phone');

      if (fetchError) {
        console.error('Error fetching students for emergency contact fix:', fetchError);
        return;
      }

      let updatedCount = 0;

      for (const student of students || []) {
        // Skip if emergency contact is already set
        if (student.emergency_contact_name && student.emergency_contact_phone) {
          continue;
        }

        let emergencyContactName = null;
        let emergencyContactPhone = null;

        // Priority: Father's info first, then Mother's info as fallback
        if (student.father_name && student.father_mobile) {
          emergencyContactName = student.father_name;
          emergencyContactPhone = student.father_mobile;
        } else if (student.mother_name && student.mother_mobile) {
          emergencyContactName = student.mother_name;
          emergencyContactPhone = student.mother_mobile;
        }

        if (emergencyContactName && emergencyContactPhone) {
          const { error: updateError } = await supabase
            .from('students')
            .update({
              emergency_contact_name: emergencyContactName,
              emergency_contact_phone: emergencyContactPhone,
              updated_at: new Date().toISOString()
            })
            .eq('id', student.id);

          if (updateError) {
            console.error(`Error updating emergency contact for student ${student.id}:`, updateError);
          } else {
            console.log(`Updated emergency contact for student ${student.id}: ${emergencyContactName} - ${emergencyContactPhone}`);
            updatedCount++;
          }
        }
      }

      console.log(`Emergency contact fix completed. Updated ${updatedCount} students.`);
      return updatedCount;
    } catch (error) {
      console.error('Error in fixEmergencyContacts:', error);
      throw error;
    }
  }

  // Delete student from transport system with cascading delete
  static async deleteStudent(studentId: string) {
    try {
      console.log(`🗑️ Starting cascading deletion for student ID: ${studentId}`);

      // Get student info before deletion for logging
      const { data: studentToDelete, error: fetchError } = await supabase
        .from('students')
        .select('student_name, roll_number, external_id, email, transport_enrolled')
        .eq('id', studentId)
        .single();

      if (fetchError) {
        console.error('Error fetching student to delete:', fetchError);
        throw new Error(`Failed to fetch student for deletion: ${fetchError.message}`);
      }

      console.log(`📋 Deleting student: ${studentToDelete?.student_name} (${studentToDelete?.roll_number}) - Enrolled: ${studentToDelete?.transport_enrolled}`);

      // Start transaction-like deletion process
      const deletionSteps = [];

      // 1. Delete transport enrollment activities (if any enrollment requests exist)
      console.log('🔄 Step 1: Deleting transport enrollment activities...');
      
      // First get the request IDs
      const { data: enrollmentRequests } = await supabase
        .from('transport_enrollment_requests')
        .select('id')
        .eq('student_id', studentId);
      
      if (enrollmentRequests && enrollmentRequests.length > 0) {
        const requestIds = enrollmentRequests.map(req => req.id);
        const { error: activitiesError } = await supabase
          .from('transport_enrollment_activities')
          .delete()
          .in('request_id', requestIds);
        
        if (activitiesError) {
          console.warn('Warning deleting enrollment activities:', activitiesError);
        } else {
          deletionSteps.push('✅ Transport enrollment activities');
        }
      } else {
        deletionSteps.push('✅ Transport enrollment activities (none found)');
      }

      // 2. Delete transport enrollment requests
      console.log('🔄 Step 2: Deleting transport enrollment requests...');
      const { error: requestsError } = await supabase
        .from('transport_enrollment_requests')
        .delete()
        .eq('student_id', studentId);
      
      if (requestsError) {
        console.warn('Warning deleting enrollment requests:', requestsError);
      } else {
        deletionSteps.push('✅ Transport enrollment requests');
      }

      // 3. Delete student route allocations
      console.log('🔄 Step 3: Deleting student route allocations...');
      const { error: allocationsError } = await supabase
        .from('student_route_allocations')
        .delete()
        .eq('student_id', studentId);
      
      if (allocationsError) {
        console.warn('Warning deleting route allocations:', allocationsError);
      } else {
        deletionSteps.push('✅ Student route allocations');
      }

      // 4. Delete student transport profiles
      console.log('🔄 Step 4: Deleting student transport profiles...');
      const { error: profilesError } = await supabase
        .from('student_transport_profiles')
        .delete()
        .eq('student_id', studentId);
      
      if (profilesError) {
        console.warn('Warning deleting transport profiles:', profilesError);
      } else {
        deletionSteps.push('✅ Student transport profiles');
      }

      // 5. Delete semester payments
      console.log('🔄 Step 5: Deleting semester payments...');
      const { error: paymentsError } = await supabase
        .from('semester_payments')
        .delete()
        .eq('student_id', studentId);
      
      if (paymentsError) {
        console.warn('Warning deleting semester payments:', paymentsError);
      } else {
        deletionSteps.push('✅ Semester payments');
      }

      // 6. Delete payment receipts (via semester payments)
      console.log('🔄 Step 6: Deleting payment receipts...');
      
      // First get the semester payment IDs
      const { data: semesterPayments } = await supabase
        .from('semester_payments')
        .select('id')
        .eq('student_id', studentId);
      
      if (semesterPayments && semesterPayments.length > 0) {
        const paymentIds = semesterPayments.map(payment => payment.id);
        const { error: receiptsError } = await supabase
          .from('payment_receipts')
          .delete()
          .in('semester_payment_id', paymentIds);
        
        if (receiptsError) {
          console.warn('Warning deleting payment receipts:', receiptsError);
        } else {
          deletionSteps.push('✅ Payment receipts');
        }
      } else {
        deletionSteps.push('✅ Payment receipts (none found)');
      }

      // 7. Delete bookings
      console.log('🔄 Step 7: Deleting bookings...');
      const { error: bookingsError } = await supabase
        .from('bookings')
        .delete()
        .eq('student_id', studentId);
      
      if (bookingsError) {
        console.warn('Warning deleting bookings:', bookingsError);
      } else {
        deletionSteps.push('✅ Bookings');
      }

      // 8. Delete attendance records
      console.log('🔄 Step 8: Deleting attendance records...');
      const { error: attendanceError } = await supabase
        .from('attendance')
        .delete()
        .eq('student_id', studentId);
      
      if (attendanceError) {
        console.warn('Warning deleting attendance:', attendanceError);
      } else {
        deletionSteps.push('✅ Attendance records');
      }

      // 9. Delete grievances
      console.log('🔄 Step 9: Deleting grievances...');
      const { error: grievancesError } = await supabase
        .from('grievances')
        .delete()
        .eq('student_id', studentId);
      
      if (grievancesError) {
        console.warn('Warning deleting grievances:', grievancesError);
      } else {
        deletionSteps.push('✅ Grievances');
      }

      // 10. Delete student activity visibility records
      console.log('🔄 Step 10: Deleting student activity visibility...');
      const { error: visibilityError } = await supabase
        .from('student_activity_visibility')
        .delete()
        .eq('student_id', studentId);
      
      if (visibilityError) {
        console.warn('Warning deleting activity visibility:', visibilityError);
      } else {
        deletionSteps.push('✅ Student activity visibility');
      }

      // 11. Delete general payments table records
      console.log('🔄 Step 11: Deleting payments...');
      const { error: generalPaymentsError } = await supabase
        .from('payments')
        .delete()
        .eq('student_id', studentId);
      
      if (generalPaymentsError) {
        console.warn('Warning deleting payments:', generalPaymentsError);
      } else {
        deletionSteps.push('✅ Payments');
      }

      // 12. Finally, delete the student record
      console.log('🔄 Step 12: Deleting student record...');
      const { error: deleteError } = await supabase
        .from('students')
        .delete()
        .eq('id', studentId);

      if (deleteError) {
        console.error('❌ Error deleting student record:', deleteError);
        throw new Error(`Failed to delete student: ${deleteError.message}`);
      }

      deletionSteps.push('✅ Student record');

      console.log(`🎉 Student ${studentToDelete?.student_name} (${studentToDelete?.roll_number}) and all related data deleted successfully!`);
      console.log('📋 Deletion summary:', deletionSteps.join(', '));
      
      return {
        student: studentToDelete,
        deletedComponents: deletionSteps
      };
    } catch (error) {
      console.error('❌ Error in cascading deleteStudent:', error);
      throw error;
    }
  }

  // Students
  static async getStudents() {
    try {
      console.log('Fetching students from database...');
      
      const { data, error } = await supabase
        .from('students')
        .select('*')
        .order('student_name')

      if (error) {
        console.error('Supabase error in getStudents:', error)
        return []
      }

      console.log(`Found ${data?.length || 0} students in database`);

      if (!data || data.length === 0) {
        console.log('No students found in database')
        return []
      }

      // Transform data with actual database values
      return data.map(student => ({
        id: student.id,
        student_name: student.student_name || 'Unknown Student',
        roll_number: student.roll_number || 'N/A',
        email: student.email || 'N/A',
        mobile: student.mobile || 'N/A',
        created_at: student.created_at,
        updated_at: student.updated_at,
        
        // All the additional fields from our enhanced schema
        external_id: student.external_id,
        department_name: student.department_name,
        institution_name: student.institution_name,
        program_name: student.program_name,
        degree_name: student.degree_name,
        father_name: student.father_name,
        mother_name: student.mother_name,
        father_mobile: student.father_mobile,
        mother_mobile: student.mother_mobile,
        date_of_birth: student.date_of_birth,
        gender: student.gender,
        address_street: student.address_street,
        address_district: student.address_district,
        address_state: student.address_state,
        address_pin_code: student.address_pin_code,
        is_profile_complete: student.is_profile_complete,
        
        // Emergency contact information
        emergency_contact_name: student.emergency_contact_name,
        emergency_contact_phone: student.emergency_contact_phone,
        
        // Transport status fields - USE ACTUAL DATABASE VALUES
        allocated_route_id: student.allocated_route_id,
        boarding_point: student.boarding_point,
        transport_status: student.transport_status,
        payment_status: student.payment_status,
        total_fines: student.total_fines || 0,
        outstanding_amount: student.outstanding_amount || 0
      }))

    } catch (error) {
      console.error('Error fetching students:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        error: error
      })
      return []
    }
  }

  // Drivers
  static async getDrivers() {
    try {
      console.log('Fetching drivers from database...');
      
      // Ensure environment variables are loaded
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        console.error('Missing Supabase environment variables for getDrivers');
        return [];
      }
      
      const { data, error } = await supabase
        .from('drivers')
        .select('*')
        .order('name')

      if (error) {
        console.error('Supabase error in getDrivers:', {
          message: error.message || 'Unknown error',
          details: error.details || 'No details',
          hint: error.hint || 'No hint',
          code: error.code || 'No code'
        });
        return []
      }

      // Handle empty data (fresh database)
      if (!data || data.length === 0) {
        console.log('No drivers found in database (fresh installation)');
        return []
      }

      console.log(`Found ${data.length} drivers in database`);

      // Transform data with safe defaults - using actual column names from schema
      return data.map(driver => ({
        id: driver.id,
        driver_name: driver.name || 'Unknown Driver', // Schema uses 'name' not 'driver_name'
        phone_number: driver.phone || 'N/A', // Schema uses 'phone' not 'phone_number'
        email: driver.email || 'N/A',
        license_number: driver.license_number || 'N/A',
        experience_years: driver.experience_years || 0,
        rating: driver.rating || 4.0,
        status: driver.status || 'active',
        created_at: driver.created_at,
        updated_at: driver.updated_at,
        // Default relationship fields
        routes: null,
        vehicles: null,
        total_trips: driver.total_trips || 0
      })) || []

    } catch (error) {
      console.error('JavaScript error in getDrivers:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        errorType: typeof error
      })
      return []
    }
  }

  // Vehicles
  static async getVehicles() {
    try {
      console.log('Fetching vehicles from database...');
      
      const { data, error } = await supabase
        .from('vehicles')
        .select('*')
        .order('registration_number')

      if (error) {
        console.error('Supabase error in getVehicles:', {
          message: error.message || 'Unknown error',
          details: error.details || 'No details',
          hint: error.hint || 'No hint',
          code: error.code || 'No code'
        });
        return []
      }

      // Handle empty data (fresh database)
      if (!data || data.length === 0) {
        console.log('No vehicles found in database (fresh installation)');
        return []
      }

      console.log(`Found ${data.length} vehicles in database`);

      return data.map(vehicle => ({
        ...vehicle,
        // Safe defaults for fields using actual schema column names
        vehicle_number: vehicle.registration_number || 'N/A', // For compatibility
        registration_number: vehicle.registration_number || 'N/A',
        model: vehicle.model || 'Unknown Model',
        capacity: vehicle.capacity || 0,
        fuel_type: vehicle.fuel_type || 'unknown',
        status: vehicle.status || 'active',
        mileage: vehicle.mileage || 0,
        // Calculate status fields using static method calls
        maintenance_status: DatabaseService.calculateMaintenanceStatus(vehicle.next_maintenance),
        insurance_status: DatabaseService.calculateInsuranceStatus(vehicle.insurance_expiry),
        fitness_status: DatabaseService.calculateFitnessStatus(vehicle.fitness_expiry),
        // Default relationship fields
        assigned_driver: null,
        assigned_route: null,
        drivers: null,
        routes: null,
        // Maintenance dates using actual schema column names
        last_maintenance: vehicle.last_maintenance || null,
        next_maintenance: vehicle.next_maintenance || null,
        insurance_expiry: vehicle.insurance_expiry || null,
        fitness_expiry: vehicle.fitness_expiry || null
      })) || []

    } catch (error) {
      console.error('JavaScript error in getVehicles:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        errorType: typeof error
      })
      return []
    }
  }

  // Bookings
  static async getBookings() {
    try {
      console.log('Fetching bookings from database...');
      
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Supabase error in getBookings:', error)
        return []
      }

      if (!data) {
        console.log('No bookings data returned from database')
        return []
      }

      console.log(`Found ${data.length} bookings in database`);

      return data.map(booking => ({
        ...booking,
        // Default relationship fields
        student_name: null,
        roll_number: null,
        route_name: null,
        route_number: null,
        payment_status: booking.payment_status || 'pending',
        amount: booking.amount || 0,
        // Safe defaults
        seat_number: booking.seat_number || 'N/A',
        trip_date: booking.trip_date || booking.created_at,
        status: booking.status || 'pending'
      })) || []

    } catch (error) {
      console.error('Error fetching bookings:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        error: error
      })
      return []
    }
  }

  // Grievances
  static async getGrievances() {
    try {
      console.log('Fetching grievances from database...');
      
      const { data, error } = await supabase
        .from('grievances')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Supabase error in getGrievances:', error)
        return []
      }

      if (!data) {
        console.log('No grievances data returned from database')
        return []
      }

      console.log(`Found ${data.length} grievances in database`);

      // Transform data with safe defaults
      return data.map(grievance => ({
        id: grievance.id,
        subject: grievance.subject || 'No Subject',
        description: grievance.description || 'No description',
        category: grievance.category || 'general',
        priority: grievance.priority || 'medium',
        status: grievance.status || 'open',
        student_id: grievance.student_id,
        route_id: grievance.route_id,
        driver_id: grievance.driver_id,
        created_at: grievance.created_at,
        updated_at: grievance.updated_at,
        assigned_to: grievance.assigned_to || null,
        resolution: grievance.resolution || null,
        // Default relationship fields
        student_name: null,
        roll_number: null,
        route_name: null,
        route_number: null,
        driver_name: null
      })) || []

    } catch (error) {
      console.error('Error fetching grievances:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        error: error
      })
      return []
    }
  }

  // Notifications
  static async getNotifications() {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error

      return data || []

    } catch (error) {
      console.error('Error fetching notifications:', error)
      return []
    }
  }

  // Payments
  static async getPayments() {
    try {
      console.log('Fetching payments from database...');
      
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Supabase error in getPayments:', error)
        return []
      }

      if (!data) {
        console.log('No payments data returned from database')
        return []
      }

      console.log(`Found ${data.length} payments in database`);

      return data.map(payment => ({
        ...payment,
        // Default relationship fields
        student_name: null,
        roll_number: null,
        trip_date: null,
        // Safe defaults
        amount: payment.amount || 0,
        status: payment.status || 'pending',
        payment_method: payment.payment_method || 'unknown',
        transaction_id: payment.transaction_id || null,
        description: payment.description || 'Payment'
      })) || []

    } catch (error) {
      console.error('Error fetching payments:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        error: error
      })
      return []
    }
  }

  // Schedules
  static async getSchedules() {
    try {
      console.log('Fetching schedules from database...');
      
      // Try enhanced query with relationships first
      const { data: enhancedData, error: enhancedError } = await supabase
        .from('schedules')
        .select(`
          *,
          route:routes(
            id,
            route_number,
            route_name,
            start_location,
            end_location,
            total_capacity,
            fare
          ),
          driver:drivers(
            id,
            name,
            phone,
            rating
          ),
          vehicle:vehicles(
            id,
            registration_number,
            model,
            capacity
          )
        `)
        .order('schedule_date', { ascending: false })

      if (enhancedError) {
        console.error('Enhanced query failed, trying simple query:', enhancedError);
        
        // Fallback to simple query
      const { data, error } = await supabase
        .from('schedules')
        .select('*')
        .order('schedule_date', { ascending: false })

      if (error) {
          console.error('Supabase error in getSchedules:', error);
        return []
      }

        return this.transformSimpleScheduleData(data || [])
      }

      return this.transformEnhancedScheduleData(enhancedData || [])

    } catch (error) {
      console.error('JavaScript error in getSchedules:', error)
      return []
    }
  }

  // Transform simple schedule data
  static transformSimpleScheduleData(schedules: any[]) {
    return schedules.map(schedule => ({
        id: schedule.id,
        route_id: schedule.route_id,
        schedule_date: schedule.schedule_date,
        departure_time: schedule.departure_time,
        arrival_time: schedule.arrival_time,
        status: schedule.status || 'scheduled',
        available_seats: schedule.available_seats || 0,
        booked_seats: schedule.booked_seats || 0,
        created_at: schedule.created_at,
        updated_at: schedule.updated_at,
        // Default values for missing relationship data
        routeNumber: 'N/A',
        routeName: 'Unknown Route',
        startLocation: 'Unknown',
        endLocation: 'Unknown',
        totalCapacity: 0,
        driverName: 'Unassigned',
        vehicleNumber: 'N/A',
        // Computed fields with safe defaults
        occupancyRate: 0,
        // Legacy field mappings for compatibility
        scheduleDate: new Date(schedule.schedule_date),
        departureTime: schedule.departure_time,
        arrivalTime: schedule.arrival_time,
        availableSeats: schedule.available_seats || 0,
        bookedSeats: schedule.booked_seats || 0,
        fineAmount: 0,
        schedulingCompliance: 'compliant'
    }))
  }

  // Transform enhanced schedule data
  static transformEnhancedScheduleData(schedules: any[]) {
    return schedules.map(schedule => {
      const route = schedule.route || {}
      const driver = schedule.driver || {}
      const vehicle = schedule.vehicle || {}
      const totalCapacity = route.total_capacity || vehicle.capacity || 50
      const bookedSeats = schedule.booked_seats || 0
      const availableSeats = schedule.available_seats || (totalCapacity - bookedSeats)

      return {
        id: schedule.id,
        route_id: schedule.route_id,
        schedule_date: schedule.schedule_date,
        departure_time: schedule.departure_time,
        arrival_time: schedule.arrival_time,
        status: schedule.status || 'scheduled',
        available_seats: availableSeats,
        booked_seats: bookedSeats,
        created_at: schedule.created_at,
        updated_at: schedule.updated_at,
        // Enhanced relationship data
        routeNumber: route.route_number || 'N/A',
        routeName: route.route_name || 'Unknown Route',
        startLocation: route.start_location || 'Unknown',
        endLocation: route.end_location || 'Unknown',
        totalCapacity: totalCapacity,
        driverName: driver.name || 'Unassigned',
        vehicleNumber: vehicle.registration_number || 'N/A',
        // Computed fields
        occupancyRate: totalCapacity > 0 ? Math.round((bookedSeats / totalCapacity) * 100) : 0,
        // Legacy field mappings for compatibility
        scheduleDate: new Date(schedule.schedule_date),
        departureTime: schedule.departure_time,
        arrivalTime: schedule.arrival_time,
        availableSeats: availableSeats,
        bookedSeats: bookedSeats,
        fineAmount: 0,
        schedulingCompliance: 'compliant'
      }
    })
  }

  // Add new schedule
  static async addSchedule(scheduleData: any) {
    try {
      console.log('Adding new schedule to database:', scheduleData);
      
      const { data, error } = await supabase
        .from('schedules')
        .insert([{
          route_id: scheduleData.route_id,
          schedule_date: scheduleData.schedule_date,
          departure_time: scheduleData.departure_time,
          arrival_time: scheduleData.arrival_time,
          available_seats: scheduleData.available_seats,
          booked_seats: scheduleData.booked_seats || 0,
          status: scheduleData.status || 'scheduled',
          driver_id: scheduleData.driver_id || null,
          vehicle_id: scheduleData.vehicle_id || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select()

      if (error) {
        console.error('Error adding schedule:', error);
        throw new Error(`Failed to add schedule: ${error.message}`);
      }

      console.log('Schedule added successfully:', data);
      return data[0];
    } catch (error) {
      console.error('Exception adding schedule:', error);
      throw error;
    }
  }

  // Update existing schedule
  static async updateSchedule(scheduleId: string, scheduleData: any) {
    try {
      console.log('Updating schedule:', scheduleId, scheduleData);
      
      const { data, error } = await supabase
        .from('schedules')
        .update({
          route_id: scheduleData.route_id,
          schedule_date: scheduleData.schedule_date,
          departure_time: scheduleData.departure_time,
          arrival_time: scheduleData.arrival_time,
          available_seats: scheduleData.available_seats,
          booked_seats: scheduleData.booked_seats,
          status: scheduleData.status,
          driver_id: scheduleData.driver_id || null,
          vehicle_id: scheduleData.vehicle_id || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', scheduleId)
        .select()

      if (error) {
        console.error('Error updating schedule:', error);
        throw new Error(`Failed to update schedule: ${error.message}`);
      }

      console.log('Schedule updated successfully:', data);
      return data[0];
    } catch (error) {
      console.error('Exception updating schedule:', error);
      throw error;
    }
  }

  // Delete schedule
  static async deleteSchedule(scheduleId: string) {
    try {
      console.log('Deleting schedule:', scheduleId);

      // First check if there are any bookings for this schedule
      const { data: bookings, error: bookingsError } = await supabase
        .from('bookings')
        .select('id')
        .eq('schedule_id', scheduleId)

      if (bookingsError) {
        console.error('Error checking schedule bookings:', bookingsError);
        throw new Error(`Failed to check schedule bookings: ${bookingsError.message}`);
      }

      if (bookings && bookings.length > 0) {
        throw new Error('Cannot delete schedule with existing bookings');
      }

      const { error } = await supabase
        .from('schedules')
        .delete()
        .eq('id', scheduleId)

      if (error) {
        console.error('Error deleting schedule:', error);
        throw new Error(`Failed to delete schedule: ${error.message}`);
      }

      console.log('Schedule deleted successfully');
      return true;
    } catch (error) {
      console.error('Exception deleting schedule:', error);
      throw error;
    }
  }

  // Get schedule by ID
  static async getScheduleById(scheduleId: string) {
    try {
      console.log('Fetching schedule by ID:', scheduleId);
      
      const { data, error } = await supabase
        .from('schedules')
        .select(`
          *,
          route:routes(
            id,
            route_number,
            route_name,
            start_location,
            end_location,
            total_capacity,
            fare
          ),
          driver:drivers(
            id,
            name,
            phone,
            rating
          ),
          vehicle:vehicles(
            id,
            registration_number,
            model,
            capacity
          )
        `)
        .eq('id', scheduleId)
        .single()

      if (error) {
        console.error('Error fetching schedule:', error);
        throw new Error(`Failed to fetch schedule: ${error.message}`);
      }

      return this.transformEnhancedScheduleData([data])[0];
    } catch (error) {
      console.error('Exception fetching schedule:', error);
      throw error;
    }
  }

  // Helper methods
  static calculatePaymentStatus(payments: any[]) {
    if (!payments.length) return 'no_payments'
    
    const hasPending = payments.some(p => p.status === 'pending')
    const hasOverdue = payments.some(p => p.status === 'overdue')
    
    if (hasOverdue) return 'overdue'
    if (hasPending) return 'pending'
    return 'paid'
  }

  static calculateMaintenanceStatus(maintenanceDue: string | null) {
    if (!maintenanceDue) return 'unknown'
    
    const dueDate = new Date(maintenanceDue)
    const today = new Date()
    const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    
    if (daysUntilDue < 0) return 'overdue'
    if (daysUntilDue <= 7) return 'due_soon'
    return 'up_to_date'
  }

  static calculateInsuranceStatus(insuranceExpiry: string | null) {
    if (!insuranceExpiry) return 'unknown'
    
    const expiryDate = new Date(insuranceExpiry)
    const today = new Date()
    const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    
    if (daysUntilExpiry < 0) return 'expired'
    if (daysUntilExpiry <= 30) return 'expiring_soon'
    return 'valid'
  }

  static calculateFitnessStatus(fitnessExpiry: string | null) {
    if (!fitnessExpiry) return 'unknown'
    
    const expiryDate = new Date(fitnessExpiry)
    const today = new Date()
    const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    
    if (daysUntilExpiry < 0) return 'expired'
    if (daysUntilExpiry <= 30) return 'expiring_soon'
    return 'valid'
  }

  // Add new driver to database
  static async addDriver(driverData: any) {
    try {
      console.log('Adding new driver to database:', driverData);
      
      // Helper function to convert empty strings to null for database
      const formatForDB = (value: any) => {
        if (value === '' || value === undefined) return null;
        return value;
      };

      // Helper function to format date properly
      const formatDate = (dateValue: any) => {
        if (!dateValue || dateValue === '') return null;
        // If it's already a valid date string, return as is
        if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
          return dateValue;
        }
        return null;
      };

      const insertData = {
        name: driverData.name,
        license_number: driverData.licenseNumber,
        aadhar_number: driverData.aadharNumber,
        phone: driverData.phone,
        email: formatForDB(driverData.email),
        experience_years: driverData.experienceYears || 0,
        rating: driverData.rating || 4.0,
        total_trips: driverData.totalTrips || 0,
        status: driverData.status || 'active',
        address: formatForDB(driverData.address),
        emergency_contact_name: formatForDB(driverData.emergencyContactName),
        emergency_contact_phone: formatForDB(driverData.emergencyContactPhone),
        license_expiry: formatDate(driverData.licenseExpiry),
        medical_certificate_expiry: formatDate(driverData.medicalCertificateExpiry),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      console.log('Formatted data for database insert:', insertData);
      
      const { data, error } = await supabase
        .from('drivers')
        .insert([insertData])
        .select()

      if (error) {
        console.error('Error adding driver:', error);
        throw new Error(`Failed to add driver: ${error.message}`);
      }

      console.log('Driver added successfully:', data);
      return data[0];
    } catch (error) {
      console.error('Exception adding driver:', error);
      throw error;
    }
  }

  // Update existing driver
  static async updateDriver(driverId: string, driverData: any) {
    try {
      console.log('Updating driver:', driverId, driverData);
      
      // Helper function to convert empty strings to null for database
      const formatForDB = (value: any) => {
        if (value === '' || value === undefined) return null;
        return value;
      };

      // Helper function to format date properly
      const formatDate = (dateValue: any) => {
        if (!dateValue || dateValue === '') return null;
        // If it's already a valid date string, return as is
        if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
          return dateValue;
        }
        return null;
      };

      const updateData = {
        name: driverData.name,
        license_number: driverData.licenseNumber,
        aadhar_number: driverData.aadharNumber,
        phone: driverData.phone,
        email: formatForDB(driverData.email),
        experience_years: driverData.experienceYears || 0,
        rating: driverData.rating || 4.0,
        total_trips: driverData.totalTrips || 0,
        status: driverData.status || 'active',
        address: formatForDB(driverData.address),
        emergency_contact_name: formatForDB(driverData.emergencyContactName),
        emergency_contact_phone: formatForDB(driverData.emergencyContactPhone),
        license_expiry: formatDate(driverData.licenseExpiry),
        medical_certificate_expiry: formatDate(driverData.medicalCertificateExpiry),
        updated_at: new Date().toISOString()
      };

      console.log('Formatted data for database update:', updateData);
      
      const { data, error } = await supabase
        .from('drivers')
        .update(updateData)
        .eq('id', driverId)
        .select()

      if (error) {
        console.error('Error updating driver:', error);
        throw new Error(`Failed to update driver: ${error.message}`);
      }

      console.log('Driver updated successfully:', data);
      return data[0];
    } catch (error) {
      console.error('Exception updating driver:', error);
      throw error;
    }
  }

  // Add new vehicle to database
  static async addVehicle(vehicleData: any) {
    try {
      console.log('Adding new vehicle to database:', vehicleData);
      
      const { data, error } = await supabase
        .from('vehicles')
        .insert([{
          registration_number: vehicleData.registrationNumber,
          model: vehicleData.model,
          capacity: vehicleData.capacity || 0,
          fuel_type: vehicleData.fuelType || 'diesel',
          status: vehicleData.status || 'active',
          insurance_expiry: vehicleData.insuranceExpiry || null,
          fitness_expiry: vehicleData.fitnessExpiry || null,
          next_maintenance: vehicleData.nextMaintenance || null,
          mileage: vehicleData.mileage || 0,
          purchase_date: vehicleData.purchaseDate || null,
          chassis_number: vehicleData.chassisNumber || null,
          engine_number: vehicleData.engineNumber || null,
          gps_device_id: vehicleData.gpsDeviceId || null,
          live_tracking_enabled: vehicleData.liveTrackingEnabled || false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select()

      if (error) {
        console.error('Error adding vehicle:', error);
        throw new Error(`Failed to add vehicle: ${error.message}`);
      }

      console.log('Vehicle added successfully:', data);
      return data[0];
    } catch (error) {
      console.error('Exception adding vehicle:', error);
      throw error;
    }
  }

  // Route and Route Stops Management
  static async addRoute(routeData: any, stops: any[] = []) {
    try {
      console.log('Adding new route to database:', routeData, stops);
      
      // Start a transaction-like operation by adding route first
      const { data: routeResult, error: routeError } = await supabase
        .from('routes')
        .insert([{
          route_number: routeData.route_number,
          route_name: routeData.route_name,
          start_location: routeData.start_location,
          end_location: routeData.end_location,
          start_latitude: routeData.start_latitude || null,
          start_longitude: routeData.start_longitude || null,
          end_latitude: routeData.end_latitude || null,
          end_longitude: routeData.end_longitude || null,
          departure_time: routeData.departure_time,
          arrival_time: routeData.arrival_time,
          distance: routeData.distance,
          duration: routeData.duration,
          total_capacity: routeData.total_capacity,
          current_passengers: 0,
          fare: routeData.fare,
          status: routeData.status || 'active',
          driver_id: routeData.driver_id || null,
          vehicle_id: routeData.vehicle_id || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select()

      if (routeError) {
        console.error('Error adding route:', routeError);
        throw new Error(`Failed to add route: ${routeError.message}`);
      }

      const newRoute = routeResult[0];
      console.log('Route added successfully:', newRoute);

      // Add route stops if provided
      if (stops && stops.length > 0) {
        const stopsData = stops.map((stop, index) => ({
          route_id: newRoute.id,
          stop_name: stop.stop_name,
          stop_time: stop.stop_time,
          sequence_order: stop.sequence_order || index + 1,
          latitude: stop.latitude || null,
          longitude: stop.longitude || null,
          is_major_stop: stop.is_major_stop || false,
          created_at: new Date().toISOString()
        }));

        const { error: stopsError } = await supabase
          .from('route_stops')
          .insert(stopsData);

        if (stopsError) {
          console.error('Error adding route stops:', stopsError);
          // Try to clean up the route if stops failed
          await supabase.from('routes').delete().eq('id', newRoute.id);
          throw new Error(`Failed to add route stops: ${stopsError.message}`);
        }

        console.log('Route stops added successfully');
      }

      // Update driver assignment if provided
      if (routeData.driver_id) {
        const { error: driverError } = await supabase
          .from('drivers')
          .update({ 
            assigned_route_id: newRoute.id,
            updated_at: new Date().toISOString()
          })
          .eq('id', routeData.driver_id);

        if (driverError) {
          console.error('Error updating driver assignment:', driverError);
          // Don't fail the whole operation, just log the error
          console.warn('Route created but driver assignment failed');
        } else {
          console.log('Driver assignment updated successfully');
        }
      }

      // Update vehicle assignment if provided
      if (routeData.vehicle_id) {
        const { error: vehicleError } = await supabase
          .from('vehicles')
          .update({ 
            assigned_route_id: newRoute.id,
            updated_at: new Date().toISOString()
          })
          .eq('id', routeData.vehicle_id);

        if (vehicleError) {
          console.error('Error updating vehicle assignment:', vehicleError);
          // Don't fail the whole operation, just log the error
          console.warn('Route created but vehicle assignment failed');
        } else {
          console.log('Vehicle assignment updated successfully');
        }
      }

      return newRoute;
    } catch (error) {
      console.error('Exception adding route:', error);
      throw error;
    }
  }

  static async updateRoute(routeId: string, routeData: any, stops: any[] = []) {
    try {
      console.log('Updating route:', routeId, routeData, stops);
      
      // Update route basic info
      const { data: routeResult, error: routeError } = await supabase
        .from('routes')
        .update({
          route_number: routeData.route_number,
          route_name: routeData.route_name,
          start_location: routeData.start_location,
          end_location: routeData.end_location,
          start_latitude: routeData.start_latitude || null,
          start_longitude: routeData.start_longitude || null,
          end_latitude: routeData.end_latitude || null,
          end_longitude: routeData.end_longitude || null,
          departure_time: routeData.departure_time,
          arrival_time: routeData.arrival_time,
          distance: routeData.distance,
          duration: routeData.duration,
          total_capacity: routeData.total_capacity,
          fare: routeData.fare,
          status: routeData.status,
          driver_id: routeData.driver_id || null,
          vehicle_id: routeData.vehicle_id || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', routeId)
        .select()

      if (routeError) {
        console.error('Error updating route:', routeError);
        throw new Error(`Failed to update route: ${routeError.message}`);
      }

      // Update stops if provided
      if (stops && stops.length > 0) {
        // Delete existing stops
        const { error: deleteError } = await supabase
          .from('route_stops')
          .delete()
          .eq('route_id', routeId);

        if (deleteError) {
          console.error('Error deleting old stops:', deleteError);
          throw new Error(`Failed to delete old stops: ${deleteError.message}`);
        }

        // Add new stops
        const stopsData = stops.map((stop, index) => ({
          route_id: routeId,
          stop_name: stop.stop_name,
          stop_time: stop.stop_time,
          sequence_order: stop.sequence_order || index + 1,
          latitude: stop.latitude || null,
          longitude: stop.longitude || null,
          is_major_stop: stop.is_major_stop || false,
          created_at: new Date().toISOString()
        }));

        const { error: stopsError } = await supabase
          .from('route_stops')
          .insert(stopsData);

        if (stopsError) {
          console.error('Error adding new stops:', stopsError);
          throw new Error(`Failed to add new stops: ${stopsError.message}`);
        }

        console.log('Route stops updated successfully');
      }

      // Handle driver assignment changes
      const previousRoute = await supabase
        .from('routes')
        .select('driver_id, vehicle_id')
        .eq('id', routeId)
        .single();

      // Clear previous driver assignment if changed
      if (previousRoute.data?.driver_id && previousRoute.data.driver_id !== routeData.driver_id) {
        await supabase
          .from('drivers')
          .update({ 
            assigned_route_id: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', previousRoute.data.driver_id);
        console.log('Previous driver assignment cleared');
      }

      // Update new driver assignment
      if (routeData.driver_id && routeData.driver_id !== previousRoute.data?.driver_id) {
        const { error: driverError } = await supabase
          .from('drivers')
          .update({ 
            assigned_route_id: routeId,
            updated_at: new Date().toISOString()
          })
          .eq('id', routeData.driver_id);

        if (driverError) {
          console.error('Error updating driver assignment:', driverError);
          console.warn('Route updated but driver assignment failed');
        } else {
          console.log('Driver assignment updated successfully');
        }
      }

      // Clear previous vehicle assignment if changed
      if (previousRoute.data?.vehicle_id && previousRoute.data.vehicle_id !== routeData.vehicle_id) {
        await supabase
          .from('vehicles')
          .update({ 
            assigned_route_id: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', previousRoute.data.vehicle_id);
        console.log('Previous vehicle assignment cleared');
      }

      // Update new vehicle assignment
      if (routeData.vehicle_id && routeData.vehicle_id !== previousRoute.data?.vehicle_id) {
        const { error: vehicleError } = await supabase
          .from('vehicles')
          .update({ 
            assigned_route_id: routeId,
            updated_at: new Date().toISOString()
          })
          .eq('id', routeData.vehicle_id);

        if (vehicleError) {
          console.error('Error updating vehicle assignment:', vehicleError);
          console.warn('Route updated but vehicle assignment failed');
        } else {
          console.log('Vehicle assignment updated successfully');
        }
      }

      return routeResult[0];
    } catch (error) {
      console.error('Exception updating route:', error);
      throw error;
    }
  }

  static async getRouteStops(routeId: string) {
    try {
      console.log('Fetching stops for route:', routeId);
      
      const { data, error } = await supabase
        .from('route_stops')
        .select('*')
        .eq('route_id', routeId)
        .order('sequence_order');

      if (error) {
        console.error('Error fetching route stops:', error);
        throw new Error(`Failed to fetch route stops: ${error.message}`);
      }

      console.log(`Found ${data?.length || 0} stops for route ${routeId}`);
      return data || [];
    } catch (error) {
      console.error('Exception fetching route stops:', error);
      throw error;
    }
  }

  // Get a single route by ID with its stops
  static async getRouteById(routeId: string) {
    try {
      console.log(`Fetching route by ID: ${routeId}`);
      
      const { data, error } = await supabase
        .from('routes')
        .select(`
          *,
          route_stops(
            id,
            stop_name,
            stop_time,
            sequence_order,
            latitude,
            longitude,
            is_major_stop
          )
        `)
        .eq('id', routeId)
        .single()

      if (error) {
        console.error('Error fetching route by ID:', error)
        throw new Error(`Failed to fetch route: ${error.message || 'Unknown database error'}`)
      }

      if (data) {
        // Sort stops by sequence_order (fallback to sequence_number for compatibility)
        if (data.route_stops) {
          data.route_stops.sort((a: any, b: any) => 
            (a.sequence_order || a.sequence_number || 0) - (b.sequence_order || b.sequence_number || 0)
          )
        }
        
        // Transform the data to match expected format
        const transformedRoute = {
          ...data,
          stops: data.route_stops || []
        }
        
        console.log(`Successfully fetched route ${routeId} with ${data.route_stops?.length || 0} stops`)
        return transformedRoute
      }

      return null
      
    } catch (error) {
      console.error('Error in getRouteById:', error)
      throw error
    }
  }

  static async addStopToRoute(routeId: string, stopData: any, insertAfterSequence?: number) {
    try {
      console.log('Adding stop to route:', routeId, stopData, 'after sequence:', insertAfterSequence);
      
      let newSequenceOrder = 1;
      
      if (insertAfterSequence !== undefined && insertAfterSequence !== null) {
        // Get existing stops to determine new sequence order
        const existingStops = await this.getRouteStops(routeId);
        
        // Update sequence numbers for stops that come after the insertion point
        const stopsToUpdate = existingStops.filter(stop => stop.sequence_order > insertAfterSequence);
        
        for (const stop of stopsToUpdate) {
          const { error: updateError } = await supabase
            .from('route_stops')
            .update({ sequence_order: stop.sequence_order + 1 })
            .eq('id', stop.id);
            
          if (updateError) {
            console.error('Error updating stop sequence:', updateError);
            throw new Error(`Failed to update stop sequence: ${updateError.message}`);
          }
        }
        
        newSequenceOrder = insertAfterSequence + 1;
      } else {
        // Add to the end
        const existingStops = await this.getRouteStops(routeId);
        newSequenceOrder = (existingStops.length > 0 ? Math.max(...existingStops.map(s => s.sequence_order)) : 0) + 1;
      }

      // Insert the new stop
      const { data, error } = await supabase
        .from('route_stops')
        .insert([{
          route_id: routeId,
          stop_name: stopData.stop_name,
          stop_time: stopData.stop_time,
          sequence_order: newSequenceOrder,
          latitude: stopData.latitude || null,
          longitude: stopData.longitude || null,
          is_major_stop: stopData.is_major_stop || false,
          created_at: new Date().toISOString()
        }])
        .select();

      if (error) {
        console.error('Error adding stop:', error);
        throw new Error(`Failed to add stop: ${error.message}`);
      }

      console.log('Stop added successfully:', data[0]);
      return data[0];
    } catch (error) {
      console.error('Exception adding stop to route:', error);
      throw error;
    }
  }

  static async removeStopFromRoute(stopId: string) {
    try {
      const { error } = await supabase
        .from('route_stops')
        .delete()
        .eq('id', stopId)

      if (error) {
        console.error('Error removing stop from route:', error)
        throw new Error(`Failed to remove stop: ${error.message}`)
      }

      return { success: true }
    } catch (error) {
      console.error('Error in removeStopFromRoute:', error)
      throw error
    }
  }

  // Delete Route
  static async deleteRoute(routeId: string) {
    try {
      console.log('Deleting route with ID:', routeId);

      // First, check if route exists
      const { data: existingRoute, error: fetchError } = await supabase
        .from('routes')
        .select('id, route_number, route_name')
        .eq('id', routeId)
        .single();

      if (fetchError || !existingRoute) {
        throw new Error('Route not found');
      }

      // Check for dependencies before deletion
      const dependencyChecks = await Promise.all([
        // Check for student allocations
        supabase.from('students').select('id').eq('allocated_route_id', routeId).limit(1),
        // Check for active bookings
        supabase.from('bookings').select('id').eq('route_id', routeId).in('status', ['confirmed', 'pending']).limit(1),
        // Check for schedules
        supabase.from('schedules').select('id').eq('route_id', routeId).gte('schedule_date', new Date().toISOString().split('T')[0]).limit(1)
      ]);

      const [studentsCheck, bookingsCheck, schedulesCheck] = dependencyChecks;

      // Build dependency warnings
      const dependencies = [];
      if (studentsCheck.data && studentsCheck.data.length > 0) {
        dependencies.push('students are assigned to this route');
      }
      if (bookingsCheck.data && bookingsCheck.data.length > 0) {
        dependencies.push('active bookings exist for this route');
      }
      if (schedulesCheck.data && schedulesCheck.data.length > 0) {
        dependencies.push('future schedules exist for this route');
      }

      if (dependencies.length > 0) {
        throw new Error(`Cannot delete route: ${dependencies.join(', ')}. Please reassign/cancel these first.`);
      }

      // If no dependencies, proceed with deletion
      // Delete in order: route_stops first, then route
      const { error: stopsError } = await supabase
        .from('route_stops')
        .delete()
        .eq('route_id', routeId);

      if (stopsError) {
        console.error('Error deleting route stops:', stopsError);
        throw new Error(`Failed to delete route stops: ${stopsError.message}`);
      }

      // Delete the route itself
      const { error: routeError } = await supabase
        .from('routes')
        .delete()
        .eq('id', routeId);

      if (routeError) {
        console.error('Error deleting route:', routeError);
        throw new Error(`Failed to delete route: ${routeError.message}`);
      }

      console.log(`Successfully deleted route ${existingRoute.route_number}`);
      return { 
        success: true, 
        message: `Route ${existingRoute.route_number} (${existingRoute.route_name}) has been deleted successfully.`
      };

    } catch (error) {
      console.error('Error in deleteRoute:', error);
      throw error;
    }
  }
} 