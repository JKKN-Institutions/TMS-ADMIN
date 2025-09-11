const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('Environment check:');
console.log('URL:', url ? 'Set' : 'Missing');
console.log('Key:', key ? 'Set' : 'Missing');

if (!url || !key) {
  console.error('Missing environment variables');
  process.exit(1);
}

const supabase = createClient(url, key);

async function testRoutes() {
  console.log('\nTesting routes table...');
  
  try {
    // First, check if routes table exists
    const { data, error } = await supabase
      .from('routes')
      .select('*')
      .limit(5);
    
    if (error) {
      console.error('Error:', error);
      return;
    }
    
    console.log('Routes table access: SUCCESS');
    console.log('Number of routes:', data?.length || 0);
    
    if (data && data.length > 0) {
      console.log('Sample route:', JSON.stringify(data[0], null, 2));
    } else {
      console.log('No routes found in database');
    }
    
    // Test the complex query used in the app
    console.log('\nTesting complex query...');
    const { data: complexData, error: complexError } = await supabase
      .from('routes')
      .select(`
        *,
        drivers (id, driver_name, phone_number),
        vehicles (id, vehicle_number, vehicle_type),
        bookings (id, status)
      `)
      .order('route_number');
    
    if (complexError) {
      console.error('Complex query error:', complexError);
    } else {
      console.log('Complex query: SUCCESS');
      console.log('Complex data length:', complexData?.length || 0);
    }
    
  } catch (err) {
    console.error('Test failed:', err);
  }
}

testRoutes(); 