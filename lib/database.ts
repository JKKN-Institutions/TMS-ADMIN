import { createClient } from '@supabase/supabase-js'
import {
  Route,
  Student,
  Driver,
  Vehicle,
  Schedule,
  Booking,
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
        { count: openGrievances }
      ] = await Promise.all([
        supabase.from('students').select('*', { count: 'exact', head: true }),
        supabase.from('drivers').select('*', { count: 'exact', head: true }),
        supabase.from('tms_route').select('*', { count: 'exact', head: true }),
        supabase.from('tms_vehicle').select('*', { count: 'exact', head: true }),
        supabase.from('bookings').select('*', { count: 'exact', head: true }),
        supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('status', 'confirmed'),
        supabase.from('grievances').select('*', { count: 'exact', head: true }).eq('status', 'open')
      ])

      // Calculate today's revenue
      const today = new Date()
      const todayStr = today.getFullYear() + '-' + 
                      String(today.getMonth() + 1).padStart(2, '0') + '-' + 
                      String(today.getDate()).padStart(2, '0')
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
        pendingPayments: 0,
        pendingGrievances: openGrievances || 0,
        todayRevenue: 0,
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
        .from('tms_vehicle')
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
        .from('tms_route')
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
        paymentCollection: 0,
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
        .from('tms_route')
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
          .from('tms_route')
          .select(`
            *,
            route_stops:tms_route_stop(
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
        .from('tms_vehicle')
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

  // Schedules
  static async getSchedules() {
    try {
      console.log('Fetching schedules from database...');
      
      // Try enhanced query with relationships first
      const { data: enhancedData, error: enhancedError } = await supabase
        .from('schedules')
        .select(`
          *,
          route:tms_route(
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
          route:tms_route(
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
        .from('tms_vehicle')
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
        .from('tms_route')
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
          .from('tms_route_stop')
          .insert(stopsData);

        if (stopsError) {
          console.error('Error adding route stops:', stopsError);
          // Try to clean up the route if stops failed
          await supabase.from('tms_route').delete().eq('id', newRoute.id);
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
          .from('tms_vehicle')
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
        .from('tms_route')
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
          .from('tms_route_stop')
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
          .from('tms_route_stop')
          .insert(stopsData);

        if (stopsError) {
          console.error('Error adding new stops:', stopsError);
          throw new Error(`Failed to add new stops: ${stopsError.message}`);
        }

        console.log('Route stops updated successfully');
      }

      // Handle driver assignment changes
      const previousRoute = await supabase
        .from('tms_route')
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
          .from('tms_vehicle')
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
          .from('tms_vehicle')
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
        .from('tms_route_stop')
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
        .from('tms_route')
        .select(`
          *,
          route_stops:tms_route_stop(
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
            .from('tms_route_stop')
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
        .from('tms_route_stop')
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
        .from('tms_route_stop')
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
        .from('tms_route')
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
        .from('tms_route_stop')
        .delete()
        .eq('route_id', routeId);

      if (stopsError) {
        console.error('Error deleting route stops:', stopsError);
        throw new Error(`Failed to delete route stops: ${stopsError.message}`);
      }

      // Delete the route itself
      const { error: routeError } = await supabase
        .from('tms_route')
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