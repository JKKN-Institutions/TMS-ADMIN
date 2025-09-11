// Verify current database state
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyDatabase() {
  console.log('🔍 Checking current database state...\n');

  const tables = [
    'students',
    'routes', 
    'drivers',
    'vehicles',
    'bookings',
    'payments',
    'notifications',
    'grievances',
    'departments',
    'programs',
    'institutions'
  ];

  for (const table of tables) {
    try {
      const { data, error, count } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

      if (error) {
        console.log(`❌ ${table}: Error - ${error.message}`);
      } else {
        console.log(`✅ ${table}: ${count || 0} records`);
      }
    } catch (err) {
      console.log(`❌ ${table}: Table might not exist`);
    }
  }

  console.log('\n🔍 Checking admin users...');
  try {
    const { data: adminUsers, error } = await supabase
      .from('admin_users')
      .select('name, email, role')
      .limit(5);

    if (error) {
      console.log(`❌ admin_users: ${error.message}`);
    } else {
      console.log(`✅ admin_users: ${adminUsers?.length || 0} records`);
      if (adminUsers && adminUsers.length > 0) {
        console.log('📋 Admin users:');
        adminUsers.forEach(user => {
          console.log(`   - ${user.name} (${user.email}) - ${user.role}`);
        });
      }
    }
  } catch (err) {
    console.log('❌ admin_users: Table access error');
  }
}

verifyDatabase()
  .then(() => {
    console.log('\n✅ Database verification complete');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Verification failed:', err);
    process.exit(1);
  }); 