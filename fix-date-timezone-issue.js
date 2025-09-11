// Fix Date Timezone Issue
// This script helps identify and fix timezone-related date mismatches

const { createClient } = require('@supabase/supabase-js');

// Environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

function createLocalDate(dateString) {
  // Create a date object that represents the local date regardless of timezone
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day); // month is 0-indexed
}

function formatDateForDatabase(date) {
  // Format date as YYYY-MM-DD for database storage
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function testDateHandling() {
  console.log('🧪 Testing Date Handling...\n');
  
  const testDate = '2024-07-09';
  
  console.log('📅 Date String from Database:', testDate);
  console.log('');
  
  // Method 1: Admin way (correct)
  console.log('🔧 Admin Method (ISO String):');
  const adminDate = new Date();
  adminDate.setFullYear(2024, 6, 9); // July is month 6
  const adminDateString = adminDate.toISOString().split('T')[0];
  console.log('  Admin Date String:', adminDateString);
  console.log('  Matches DB Date:', adminDateString === testDate ? '✅' : '❌');
  console.log('');
  
  // Method 2: Passenger way (problematic)
  console.log('🔧 Passenger Method (Date String):');
  const passengerDate = new Date(testDate); // This creates UTC date
  const passengerDateString = passengerDate.toDateString();
  console.log('  Passenger Date Object:', passengerDate.toISOString());
  console.log('  Passenger Date String:', passengerDateString);
  console.log('  Local Timezone Offset:', passengerDate.getTimezoneOffset(), 'minutes');
  console.log('');
  
  // Method 3: Fixed way
  console.log('🔧 Fixed Method (Local Date):');
  const fixedDate = createLocalDate(testDate);
  const fixedDateString = formatDateForDatabase(fixedDate);
  console.log('  Fixed Date Object:', fixedDate);
  console.log('  Fixed Date String:', fixedDateString);
  console.log('  Matches DB Date:', fixedDateString === testDate ? '✅' : '❌');
  console.log('');
  
  // Show the issue
  console.log('🐛 The Issue:');
  console.log('  When you create new Date("2024-07-09"):');
  console.log('    - JavaScript treats it as UTC midnight');
  console.log('    - In timezones ahead of UTC (like IST +5:30)');
  console.log('    - .toDateString() converts to local time');
  console.log('    - This can shift the date by 1 day');
  console.log('');
}

async function checkScheduleDateIssues() {
  console.log('🔍 Checking Schedule Date Issues...\n');
  
  try {
    // Get recent schedules
    const { data: schedules, error } = await supabase
      .from('schedules')
      .select(`
        id,
        schedule_date,
        routes:route_id(route_number, route_name)
      `)
      .gte('schedule_date', '2024-07-01')
      .lte('schedule_date', '2024-07-31')
      .order('schedule_date')
      .limit(10);

    if (error) {
      console.error('Error fetching schedules:', error);
      return;
    }

    console.log('📊 Sample Schedule Dates:');
    schedules.forEach(schedule => {
      const dbDate = schedule.schedule_date;
      const jsDate = new Date(dbDate);
      const localDate = createLocalDate(dbDate);
      
      console.log(`  Schedule ID: ${schedule.id}`);
      console.log(`    DB Date: ${dbDate}`);
      console.log(`    new Date(dbDate): ${jsDate.toISOString()}`);
      console.log(`    jsDate.toDateString(): ${jsDate.toDateString()}`);
      console.log(`    localDate: ${localDate.toISOString()}`);
      console.log(`    Route: ${schedule.routes?.route_number} - ${schedule.routes?.route_name}`);
      console.log('');
    });
  } catch (error) {
    console.error('Error checking schedule dates:', error);
  }
}

function generateDateUtilityCode() {
  console.log('📝 Fixed Date Utility Code:\n');
  
  const utilityCode = `
// Date Utility Functions - Use these for consistent date handling

export function createLocalDate(dateString: string): Date {
  // Create a date object that represents the local date regardless of timezone
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day); // month is 0-indexed
}

export function formatDateForDatabase(date: Date): string {
  // Format date as YYYY-MM-DD for database storage
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return \`\${year}-\${month}-\${day}\`;
}

export function formatDateForDisplay(date: Date): string {
  // Format date for display in UI
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

export function isSameDate(date1: Date, date2: Date): boolean {
  // Compare two dates ignoring time
  return formatDateForDatabase(date1) === formatDateForDatabase(date2);
}

export function compareDateWithSchedule(calendarDate: Date, scheduleDate: string): boolean {
  // Compare calendar date with schedule date string from database
  return formatDateForDatabase(calendarDate) === scheduleDate;
}

// Example usage in passenger calendar:
// Instead of: s.scheduleDate.toDateString() === date.toDateString()
// Use: compareDateWithSchedule(date, s.schedule_date)
`;

  console.log(utilityCode);
}

async function main() {
  console.log('🚀 Date Timezone Issue Analysis\n');
  console.log('================================\n');
  
  await testDateHandling();
  await checkScheduleDateIssues();
  generateDateUtilityCode();
  
  console.log('🎯 Summary of the Issue:');
  console.log('  - Admin calendar uses ISO string comparison (correct)');
  console.log('  - Passenger calendar uses Date object comparison (problematic)');
  console.log('  - Timezone conversion causes date to shift by 1 day');
  console.log('  - July 9th in DB becomes July 8th in passenger UI');
  console.log('');
  console.log('💡 Solution:');
  console.log('  - Use consistent date comparison methods');
  console.log('  - Always compare dates as YYYY-MM-DD strings');
  console.log('  - Avoid timezone-dependent Date conversions');
}

// Run the analysis
main().catch(console.error); 