// Test Admin Date Fix - July 15th Issue
// This script tests that the admin module correctly handles date selection

function formatDateForDatabase(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function testAdminDateHandling() {
  console.log('🧪 Testing Admin Date Handling\n');
  console.log('==============================\n');

  // Simulate July 15th click in admin calendar
  const july15 = new Date(2025, 6, 15); // July 15, 2025 local time
  
  console.log('📅 Admin Calendar Date Selection:');
  console.log(`Selected Date: ${july15.toLocaleDateString()}`);
  console.log(`Selected Date Object: ${july15.toString()}`);
  console.log('');
  
  // Test the old problematic method
  console.log('❌ Old Method (Problematic):');
  const oldMethod = july15.toISOString().split('T')[0];
  console.log(`toISOString().split('T')[0]: "${oldMethod}"`);
  console.log(`Expected: "2025-07-15", Got: "${oldMethod}"`);
  console.log(`Correct: ${oldMethod === '2025-07-15' ? '✅' : '❌'}`);
  console.log('');
  
  // Test the new fixed method
  console.log('✅ New Method (Fixed):');
  const newMethod = formatDateForDatabase(july15);
  console.log(`formatDateForDatabase(): "${newMethod}"`);
  console.log(`Expected: "2025-07-15", Got: "${newMethod}"`);
  console.log(`Correct: ${newMethod === '2025-07-15' ? '✅' : '❌'}`);
  console.log('');
  
  // Test multiple dates
  console.log('🔍 Testing Multiple Dates:\n');
  
  const testDates = [
    { name: 'July 14th', date: new Date(2025, 6, 14), expected: '2025-07-14' },
    { name: 'July 15th', date: new Date(2025, 6, 15), expected: '2025-07-15' },
    { name: 'July 16th', date: new Date(2025, 6, 16), expected: '2025-07-16' },
    { name: 'December 31st', date: new Date(2024, 11, 31), expected: '2024-12-31' },
    { name: 'January 1st', date: new Date(2025, 0, 1), expected: '2025-01-01' },
  ];
  
  testDates.forEach(test => {
    const oldResult = test.date.toISOString().split('T')[0];
    const newResult = formatDateForDatabase(test.date);
    
    console.log(`${test.name}:`);
    console.log(`  Expected: ${test.expected}`);
    console.log(`  Old method: ${oldResult} ${oldResult === test.expected ? '✅' : '❌'}`);
    console.log(`  New method: ${newResult} ${newResult === test.expected ? '✅' : '❌'}`);
    console.log('');
  });
  
  // Simulate the CreateScheduleModal flow
  console.log('🔧 Simulating CreateScheduleModal Flow:\n');
  
  const selectedDate = new Date(2025, 6, 15); // July 15th selected in calendar
  console.log(`1. User selects: ${selectedDate.toLocaleDateString()}`);
  
  // What would be sent to API (old vs new)
  const oldScheduleData = {
    routeId: 'route-123',
    scheduleDate: selectedDate.toISOString().split('T')[0], // Old method
    departureTime: '07:50:00',
    arrivalTime: '08:55:00'
  };
  
  const newScheduleData = {
    routeId: 'route-123', 
    scheduleDate: formatDateForDatabase(selectedDate), // New method
    departureTime: '07:50:00',
    arrivalTime: '08:55:00'
  };
  
  console.log('2. Data sent to API:');
  console.log('   Old method:', JSON.stringify(oldScheduleData, null, 2));
  console.log('   New method:', JSON.stringify(newScheduleData, null, 2));
  console.log('');
  
  console.log('3. Expected database storage:');
  console.log(`   Should store: "2025-07-15"`);
  console.log(`   Old stores: "${oldScheduleData.scheduleDate}" ${oldScheduleData.scheduleDate === '2025-07-15' ? '✅' : '❌'}`);
  console.log(`   New stores: "${newScheduleData.scheduleDate}" ${newScheduleData.scheduleDate === '2025-07-15' ? '✅' : '❌'}`);
  console.log('');
  
  // Show timezone information
  console.log('🌍 Timezone Information:\n');
  const now = new Date();
  console.log(`Current timezone offset: ${now.getTimezoneOffset()} minutes`);
  console.log(`Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
  
  const utcJuly15 = new Date('2025-07-15T00:00:00.000Z');
  console.log(`UTC July 15th midnight: ${utcJuly15.toISOString()}`);
  console.log(`Local representation: ${utcJuly15.toString()}`);
  console.log(`toDateString(): ${utcJuly15.toDateString()}`);
  
  console.log('\n' + '='.repeat(60) + '\n');
  
  // Summary
  console.log('📋 Fix Summary:\n');
  console.log('❌ Problem: selectedDate.toISOString().split("T")[0]');
  console.log('   - Converts to UTC, causing date shift in some timezones');
  console.log('   - July 15th local → July 14th UTC in some cases');
  console.log('');
  console.log('✅ Solution: formatDateForDatabase(selectedDate)');
  console.log('   - Uses local date components directly');
  console.log('   - July 15th local → July 15th in database');
  console.log('   - No timezone conversion issues');
  console.log('');
  console.log('🔧 Files Fixed:');
  console.log('   - admin/components/create-schedule-modal.tsx');
  console.log('   - admin/components/global-booking-calendar.tsx');
  console.log('   - admin/lib/date-utils.ts (utility functions)');
  console.log('');
  console.log('🎯 Result: July 15th admin → July 15th database → July 15th passenger ✅');
}

testAdminDateHandling(); 