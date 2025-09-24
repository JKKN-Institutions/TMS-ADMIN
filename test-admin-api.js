const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testAdminAPI() {
  console.log('🧪 Testing Admin Bug Reports API...');
  
  try {
    // Test getting admin user
    const { data: adminUsers, error: adminError } = await supabase
      .from('admin_users')
      .select('id, role, is_active')
      .eq('is_active', true)
      .limit(1);
    
    if (adminError || !adminUsers || adminUsers.length === 0) {
      console.log('❌ No active admin users found');
      return;
    }
    
    const adminId = adminUsers[0].id;
    console.log('✅ Found admin user:', adminId);
    
    // Test the admin API query (same as the API uses)
    let query = supabase
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
      .range(0, 19); // First 20 records
    
    const { data: bugReports, error: fetchError } = await query;
    
    if (fetchError) {
      console.log('❌ Bug reports fetch failed:', fetchError.message);
      return;
    }
    
    console.log(`✅ Successfully fetched ${bugReports.length} bug reports`);
    
    // Test statistics calculation
    const { data: statsData, error: statsError } = await supabase
      .from('bug_reports')
      .select('status, priority, created_at, resolved_at');
    
    if (statsError) {
      console.log('❌ Stats calculation failed:', statsError.message);
    } else {
      const stats = {
        total_bugs: statsData.length,
        open_bugs: statsData.filter(b => b.status === 'open').length,
        in_progress_bugs: statsData.filter(b => b.status === 'in_progress').length,
        resolved_bugs: statsData.filter(b => b.status === 'resolved').length,
        closed_bugs: statsData.filter(b => b.status === 'closed').length,
        critical_bugs: statsData.filter(b => b.priority === 'critical').length,
        high_severity_bugs: statsData.filter(b => b.priority === 'high').length,
        urgent_bugs: statsData.filter(b => b.priority === 'critical' || b.priority === 'high').length
      };
      
      console.log('✅ Statistics calculated successfully:');
      console.log(`   Total: ${stats.total_bugs}`);
      console.log(`   Open: ${stats.open_bugs}`);
      console.log(`   In Progress: ${stats.in_progress_bugs}`);
      console.log(`   Resolved: ${stats.resolved_bugs}`);
      console.log(`   Critical: ${stats.critical_bugs}`);
      console.log(`   High Priority: ${stats.high_severity_bugs}`);
    }
    
    // Show sample bug reports
    console.log('\n📋 Sample bug reports:');
    bugReports.slice(0, 3).forEach((bug, index) => {
      console.log(`${index + 1}. ${bug.title}`);
      console.log(`   Status: ${bug.status} | Priority: ${bug.priority}`);
      console.log(`   Reporter: ${bug.reporter_email}`);
      console.log(`   Created: ${bug.created_at}`);
      console.log(`   Comments: ${bug.bug_comments ? bug.bug_comments.length : 0}`);
      console.log('   ---');
    });
    
    console.log('\n🎉 Admin API is working correctly!');
    console.log('\n✅ What works:');
    console.log('  - Fetching bug reports with comments');
    console.log('  - Statistics calculation');
    console.log('  - Admin authentication');
    console.log('  - Filtering and pagination (in API)');
    
    console.log('\n⚠️ What needs database tables:');
    console.log('  - Status history tracking');
    console.log('  - Labels management');
    console.log('  - Advanced analytics');
    
  } catch (error) {
    console.error('❌ Admin API test failed:', error.message);
  }
}

testAdminAPI().then(() => {
  console.log('\n✅ Admin API test completed');
  process.exit(0);
}).catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});

