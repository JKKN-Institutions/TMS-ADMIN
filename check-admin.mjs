import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('🔍 Checking Admin Setup...\n');

async function checkSetup() {
  try {
    // Check admin users
    console.log('1️⃣ Checking admin users...');
    const { data: users, error: userError } = await supabase
      .from('admin_users')
      .select('name, role, is_active');

    if (userError) {
      console.log('❌ Error fetching admin users:', userError.message);
      return;
    }

    if (users && users.length > 0) {
      console.log('✅ Admin users found:');
      users.forEach(user => console.log(`   - ${user.name} (${user.role})`));
    } else {
      console.log('❌ No admin users found');
    }

    // Check login mappings
    console.log('\n2️⃣ Checking login mappings...');
    const { data: mappings, error: mapError } = await supabase
      .from('admin_login_mapping')
      .select('admin_id, password');

    if (mapError) {
      console.log('❌ Error fetching mappings:', mapError.message);
      console.log('💡 The admin_login_mapping table might not exist yet.');
    } else if (mappings && mappings.length > 0) {
      console.log('✅ Login mappings found:');
      mappings.forEach(map => console.log(`   - ${map.admin_id}: ${map.password}`));
    } else {
      console.log('❌ No login mappings found');
    }

    // Test a login
    console.log('\n3️⃣ Testing Super Admin login...');
    const { data: testLogin, error: loginError } = await supabase
      .from('admin_login_mapping')
      .select('admin_id, admin_users(name, role)')
      .eq('admin_id', 'SA001')
      .eq('password', 'superadmin123')
      .single();

    if (loginError) {
      console.log('❌ Login test failed:', loginError.message);
    } else if (testLogin) {
      console.log('✅ Super Admin login works!');
      console.log(`   User: ${testLogin.admin_users.name} (${testLogin.admin_users.role})`);
    }

    console.log('\n📋 Summary:');
    if (users?.length >= 5 && mappings?.length >= 5 && testLogin) {
      console.log('🎉 Your admin setup looks good!');
      console.log('\n🔑 Login credentials:');
      console.log('   SA001 / superadmin123 (Super Admin)');
      console.log('   TM001 / transport123 (Transport Manager)');
      console.log('   FA001 / finance123 (Finance Admin)');
      console.log('   OA001 / operations123 (Operations Admin)');
      console.log('   DE001 / dataentry123 (Data Entry)');
    } else {
      console.log('⚠️ Some issues found. Make sure you ran the SQL setup.');
    }

  } catch (error) {
    console.log('💥 Error:', error.message);
  }
}

checkSetup(); 