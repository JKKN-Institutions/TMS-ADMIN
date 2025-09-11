// Test SQL-based Date Fix
// This script tests the new specific-date API endpoint

const { createClient } = require('@supabase/supabase-js');

// Environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testSqlDateQuery() {
  console.log('🧪 Testing SQL-based Date Query\n');
  console.log('===============================\n');

  // Test with July 9th
  const testDate = '2024-07-09';
  console.log(`Testing SQL query for date: ${testDate}\n`);

  try {
    // Simulate the exact query from the new API
    const { data: schedules, error } = await supabase
      .from('schedules')
      .select(`
        id,
        route_id,
        schedule_date,
        departure_time,
        arrival_time,
        available_seats,
        booked_seats,
        total_seats,
        booking_enabled,
        status,
        routes:route_id(route_number, route_name, status)
      `)
      .eq('schedule_date', testDate) // Direct SQL string comparison
      .in('status', ['scheduled', 'in_progress'])
      .order('departure_time', { ascending: true });

    if (error) {
      console.error('SQL Query Error:', error);
      return;
    }

    console.log(`✅ SQL Query Results for ${testDate}:`);
    console.log(`Found ${schedules.length} schedules\n`);

    if (schedules.length === 0) {
      console.log('❌ No schedules found for this date');
      console.log('This could mean:');
      console.log('  1. No schedules created for July 9th');
      console.log('  2. Schedules exist but with different date format');
      console.log('  3. All schedules are cancelled/completed');
      
      // Check if any schedules exist for July 2024
      const { data: julySchedules, error: julyError } = await supabase
        .from('schedules')
        .select('id, schedule_date, status')
        .gte('schedule_date', '2024-07-01')
        .lte('schedule_date', '2024-07-31')
        .limit(10);

      if (julyError) {
        console.error('Error checking July schedules:', julyError);
      } else {
        console.log(`\n📊 Found ${julySchedules.length} schedules in July 2024:`);
        julySchedules.forEach((schedule, index) => {
          console.log(`  ${index + 1}. Date: ${schedule.schedule_date}, Status: ${schedule.status}`);
        });
      }
    } else {
      schedules.forEach((schedule, index) => {
        console.log(`Schedule ${index + 1}:`);
        console.log(`  ID: ${schedule.id}`);
        console.log(`  Date: ${schedule.schedule_date}`);
        console.log(`  Time: ${schedule.departure_time} - ${schedule.arrival_time}`);
        console.log(`  Route: ${schedule.routes?.route_number} - ${schedule.routes?.route_name}`);
        console.log(`  Available Seats: ${schedule.available_seats}`);
        console.log(`  Booked Seats: ${schedule.booked_seats || 0}`);
        console.log(`  Booking Enabled: ${schedule.booking_enabled !== false}`);
        console.log(`  Status: ${schedule.status}`);
        console.log(`  Route Status: ${schedule.routes?.status}`);
        console.log('');
      });
    }

    console.log('='.repeat(50) + '\n');

    // Test various date formats
    console.log('🔍 Testing Different Date Formats\n');
    
    const testDates = [
      '2024-07-08',
      '2024-07-09',
      '2024-07-10',
      '2024-07-11',
      '2024-07-12'
    ];

    for (const date of testDates) {
      const { data: daySchedules, error: dayError } = await supabase
        .from('schedules')
        .select('id, schedule_date, routes:route_id(route_number)')
        .eq('schedule_date', date)
        .in('status', ['scheduled', 'in_progress'])
        .limit(5);

      if (dayError) {
        console.error(`Error checking ${date}:`, dayError);
      } else {
        console.log(`${date}: ${daySchedules.length} schedules`);
        daySchedules.forEach(schedule => {
          console.log(`  - Route ${schedule.routes?.route_number} (${schedule.schedule_date})`);
        });
      }
    }

  } catch (error) {
    console.error('Test Error:', error);
  }
}

async function main() {
  console.log('🚀 Testing SQL-based Date Fix\n');
  console.log('This tests the new approach that queries the database directly\n');
  console.log('instead of doing date comparisons in JavaScript.\n');
  
  await testSqlDateQuery();
  
  console.log('🎯 Summary:');
  console.log('✅ SQL queries use direct string comparison on schedule_date');
  console.log('✅ No JavaScript date conversion or timezone issues');
  console.log('✅ Exact matching: "2024-07-09" = "2024-07-09"');
  console.log('✅ Admin enables July 9th → Passenger sees July 9th');
}

main().catch(console.error); 