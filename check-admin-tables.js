const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkTables() {
  console.log('🔍 Checking if required tables exist for admin bug reports API...');
  
  const tables = [
    'bug_reports',
    'bug_comments', 
    'bug_status_history',
    'bug_report_labels',
    'bug_labels',
    'admin_users'
  ];
  
  const results = {};
  
  for (const table of tables) {
    try {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .limit(1);
      
      if (error) {
        console.log(`❌ Table '${table}': ${error.message}`);
        results[table] = { exists: false, error: error.message };
      } else {
        console.log(`✅ Table '${table}': EXISTS`);
        results[table] = { exists: true };
      }
    } catch (err) {
      console.log(`❌ Table '${table}': ${err.message}`);
      results[table] = { exists: false, error: err.message };
    }
  }
  
  // Check if bug_report_stats view exists
  console.log('\n🔍 Checking views...');
  try {
    const { data, error } = await supabase
      .from('bug_report_stats')
      .select('*')
      .single();
    
    if (error) {
      console.log(`❌ View 'bug_report_stats': ${error.message}`);
      results['bug_report_stats'] = { exists: false, error: error.message };
    } else {
      console.log(`✅ View 'bug_report_stats': EXISTS`);
      results['bug_report_stats'] = { exists: true };
    }
  } catch (err) {
    console.log(`❌ View 'bug_report_stats': ${err.message}`);
    results['bug_report_stats'] = { exists: false, error: err.message };
  }
  
  // Test admin API query
  console.log('\n🧪 Testing admin API query...');
  try {
    const { data, error } = await supabase
      .from('bug_reports')
      .select(`
        *,
        bug_comments(
          id,
          comment,
          is_internal,
          author_type,
          author_name,
          created_at
        )
      `)
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (error) {
      console.log(`❌ Admin API query failed: ${error.message}`);
      results['admin_api_query'] = { success: false, error: error.message };
    } else {
      console.log(`✅ Admin API query successful, found ${data.length} records`);
      results['admin_api_query'] = { success: true, count: data.length };
    }
  } catch (err) {
    console.log(`❌ Admin API query error: ${err.message}`);
    results['admin_api_query'] = { success: false, error: err.message };
  }
  
  // Check admin_users table specifically
  console.log('\n👤 Testing admin authentication...');
  try {
    const { data, error } = await supabase
      .from('admin_users')
      .select('id, role, is_active')
      .eq('is_active', true)
      .limit(1);
    
    if (error) {
      console.log(`❌ Admin users check failed: ${error.message}`);
      results['admin_auth'] = { success: false, error: error.message };
    } else if (data && data.length > 0) {
      console.log(`✅ Admin users found: ${data.length} active admin(s)`);
      results['admin_auth'] = { success: true, count: data.length };
    } else {
      console.log(`⚠️ No active admin users found`);
      results['admin_auth'] = { success: false, error: 'No active admin users' };
    }
  } catch (err) {
    console.log(`❌ Admin users error: ${err.message}`);
    results['admin_auth'] = { success: false, error: err.message };
  }
  
  console.log('\n📋 Summary:');
  console.log('='.repeat(50));
  
  const missingTables = Object.keys(results).filter(key => 
    results[key].exists === false || results[key].success === false
  );
  
  if (missingTables.length > 0) {
    console.log('❌ Issues found:');
    missingTables.forEach(table => {
      console.log(`   - ${table}: ${results[table].error}`);
    });
  } else {
    console.log('✅ All required tables and functionality working');
  }
  
  return results;
}

checkTables().then((results) => {
  console.log('\n✅ Table check completed');
  process.exit(0);
}).catch(err => {
  console.error('❌ Check failed:', err);
  process.exit(1);
});
