// Enable Booking Controls for Routes
// This script enables booking controls for specific routes and dates

const { createClient } = require('@supabase/supabase-js');

// Environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function enableBookingControls(routeId, startDate, endDate = null) {
  console.log(`🔧 Enabling booking controls for route ${routeId}...`);
  
  const end = endDate || startDate;
  
  try {
    // Get all schedules for the route in the date range
    const { data: schedules, error: schedulesError } = await supabase
      .from('schedules')
      .select('id, schedule_date, route_id')
      .eq('route_id', routeId)
      .gte('schedule_date', startDate)
      .lte('schedule_date', end);

    if (schedulesError) {
      console.error('Error fetching schedules:', schedulesError);
      return false;
    }

    if (!schedules || schedules.length === 0) {
      console.log('❌ No schedules found for the specified route and date range');
      return false;
    }

    console.log(`📊 Found ${schedules.length} schedules to enable`);

    // Update each schedule to enable booking
    for (const schedule of schedules) {
      const scheduleDate = new Date(schedule.schedule_date);
      const bookingDate = new Date(scheduleDate.getTime() - 24 * 60 * 60 * 1000);
      const bookingDeadline = `${bookingDate.toISOString().split('T')[0]} 19:00:00`;

      // Update schedule with booking controls
      const { error: scheduleUpdateError } = await supabase
        .from('schedules')
        .update({
          admin_scheduling_enabled: true,
          booking_enabled: true,
          is_booking_window_open: new Date() <= new Date(bookingDeadline),
          booking_deadline: bookingDeadline,
          updated_at: new Date().toISOString()
        })
        .eq('id', schedule.id);

      if (scheduleUpdateError) {
        console.error(`Error updating schedule ${schedule.id}:`, scheduleUpdateError);
        continue;
      }

      // Create or update booking availability record
      const { error: availabilityError } = await supabase
        .from('booking_availability')
        .upsert({
          route_id: routeId,
          availability_date: schedule.schedule_date,
          admin_enabled: true,
          is_booking_enabled: true,
          booking_start_time: '06:00:00',
          cutoff_time: '19:00:00',
          requires_admin_approval: false,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'route_id,availability_date'
        });

      if (availabilityError) {
        console.error(`Error updating booking availability for ${schedule.schedule_date}:`, availabilityError);
        continue;
      }

      console.log(`✅ Enabled booking for ${schedule.schedule_date}`);
    }

    return true;
  } catch (error) {
    console.error('Error enabling booking controls:', error);
    return false;
  }
}

async function enableBookingForAllActiveRoutes(startDate, endDate = null) {
  console.log('🚀 Enabling booking for all active routes...');
  
  try {
    // Get all active routes
    const { data: routes, error: routesError } = await supabase
      .from('routes')
      .select('id, route_number, route_name')
      .eq('status', 'active');

    if (routesError) {
      console.error('Error fetching routes:', routesError);
      return;
    }

    console.log(`📊 Found ${routes.length} active routes`);

    let success = 0;
    let failed = 0;

    for (const route of routes) {
      console.log(`\n🔄 Processing Route ${route.route_number} - ${route.route_name}...`);
      
      const result = await enableBookingControls(route.id, startDate, endDate);
      
      if (result) {
        success++;
      } else {
        failed++;
      }
    }

    console.log(`\n📊 Results:`);
    console.log(`  ✅ Success: ${success} routes`);
    console.log(`  ❌ Failed: ${failed} routes`);
  } catch (error) {
    console.error('Error enabling booking for all routes:', error);
  }
}

async function checkBookingStatus(routeId, date) {
  console.log(`🔍 Checking booking status for route ${routeId} on ${date}...`);
  
  try {
    // Check schedule
    const { data: schedule, error: scheduleError } = await supabase
      .from('schedules')
      .select(`
        *,
        routes:route_id(route_number, route_name)
      `)
      .eq('route_id', routeId)
      .eq('schedule_date', date)
      .single();

    if (scheduleError) {
      console.error('Schedule not found:', scheduleError);
      return;
    }

    // Check booking availability
    const { data: availability, error: availabilityError } = await supabase
      .from('booking_availability')
      .select('*')
      .eq('route_id', routeId)
      .eq('availability_date', date)
      .single();

    console.log('📋 Schedule Status:');
    console.log(`  Route: ${schedule.routes?.route_number} - ${schedule.routes?.route_name}`);
    console.log(`  Date: ${schedule.schedule_date}`);
    console.log(`  Admin Scheduling Enabled: ${schedule.admin_scheduling_enabled || false}`);
    console.log(`  Booking Enabled: ${schedule.booking_enabled || false}`);
    console.log(`  Booking Window Open: ${schedule.is_booking_window_open || false}`);
    console.log(`  Booking Deadline: ${schedule.booking_deadline || 'Not set'}`);
    console.log(`  Total Seats: ${schedule.available_seats || 0}`);
    console.log(`  Booked Seats: ${schedule.booked_seats || 0}`);

    if (availability) {
      console.log('\n📋 Booking Availability:');
      console.log(`  Admin Enabled: ${availability.admin_enabled}`);
      console.log(`  Is Booking Enabled: ${availability.is_booking_enabled}`);
      console.log(`  Booking Start Time: ${availability.booking_start_time}`);
      console.log(`  Cutoff Time: ${availability.cutoff_time}`);
      console.log(`  Requires Admin Approval: ${availability.requires_admin_approval}`);
    } else {
      console.log('\n❌ No booking availability record found');
    }
  } catch (error) {
    console.error('Error checking booking status:', error);
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('📖 Usage:');
    console.log('  node enable-booking-for-route.js enable <route_id> <date> [end_date]');
    console.log('  node enable-booking-for-route.js enable-all <start_date> [end_date]');
    console.log('  node enable-booking-for-route.js check <route_id> <date>');
    console.log('');
    console.log('📝 Examples:');
    console.log('  node enable-booking-for-route.js enable route-123 2024-07-06');
    console.log('  node enable-booking-for-route.js enable-all 2024-07-06 2024-07-08');
    console.log('  node enable-booking-for-route.js check route-123 2024-07-06');
    return;
  }

  const command = args[0];

  switch (command) {
    case 'enable':
      if (args.length < 3) {
        console.error('❌ Please provide route_id and date');
        return;
      }
      await enableBookingControls(args[1], args[2], args[3]);
      break;

    case 'enable-all':
      if (args.length < 2) {
        console.error('❌ Please provide start date');
        return;
      }
      await enableBookingForAllActiveRoutes(args[1], args[2]);
      break;

    case 'check':
      if (args.length < 3) {
        console.error('❌ Please provide route_id and date');
        return;
      }
      await checkBookingStatus(args[1], args[2]);
      break;

    default:
      console.error('❌ Unknown command:', command);
  }
}

// Run the script
main().catch(console.error); 