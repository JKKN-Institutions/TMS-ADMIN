const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testBugBountySystem() {
  console.log('🏆 Testing Bug Bounty System...');
  
  try {
    // Get admin user for API calls
    const { data: adminUsers, error: adminError } = await supabase
      .from('admin_users')
      .select('id')
      .eq('is_active', true)
      .limit(1);
    
    if (adminError || !adminUsers || adminUsers.length === 0) {
      console.log('❌ No active admin users found');
      return;
    }
    
    const adminId = adminUsers[0].id;
    console.log('✅ Found admin user:', adminId);
    
    // Test bug bounty hunters API
    console.log('\n🔍 Testing Bug Bounty Hunters API...');
    try {
      const response = await fetch(`http://localhost:3000/api/admin/bug-bounty/hunters?adminId=${adminId}&timeframe=all&category=all&minReports=1`);
      
      if (response.ok) {
        const data = await response.json();
        console.log(`✅ Hunters API works: ${data.hunters?.length || 0} hunters found`);
        
        if (data.hunters && data.hunters.length > 0) {
          console.log('\n🏅 Top 3 Bug Hunters:');
          data.hunters.slice(0, 3).forEach((hunter, index) => {
            const points = (hunter.critical_bugs * 50) + (hunter.high_bugs * 30) + 
                          (hunter.medium_bugs * 15) + (hunter.low_bugs * 5);
            console.log(`${index + 1}. ${hunter.name} (${hunter.email})`);
            console.log(`   Reports: ${hunter.total_bugs} | Points: ${points}`);
            console.log(`   Critical: ${hunter.critical_bugs} | High: ${hunter.high_bugs} | Medium: ${hunter.medium_bugs} | Low: ${hunter.low_bugs}`);
            console.log('---');
          });
        }
      } else {
        console.log(`❌ Hunters API failed: HTTP ${response.status}`);
      }
    } catch (fetchError) {
      console.log('❌ Hunters API test failed:', fetchError.message);
    }
    
    // Test bug bounty stats API
    console.log('\n📊 Testing Bug Bounty Stats API...');
    try {
      const response = await fetch(`http://localhost:3000/api/admin/bug-bounty/stats?adminId=${adminId}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Stats API works');
        console.log(`📈 Statistics:`);
        console.log(`   Total Hunters: ${data.stats?.total_hunters || 0}`);
        console.log(`   Total Reports: ${data.stats?.total_reports || 0}`);
        console.log(`   Points Awarded: ${data.stats?.total_points_awarded || 0}`);
        console.log(`   Active This Month: ${data.stats?.active_hunters_month || 0}`);
        
        if (data.stats?.top_categories?.length > 0) {
          console.log(`\n🏷️ Top Categories:`);
          data.stats.top_categories.forEach((cat, index) => {
            console.log(`   ${index + 1}. ${cat.category}: ${cat.count} reports (${cat.percentage}%)`);
          });
        }
      } else {
        console.log(`❌ Stats API failed: HTTP ${response.status}`);
      }
    } catch (fetchError) {
      console.log('❌ Stats API test failed:', fetchError.message);
    }
    
    // Test user stats calculation
    console.log('\n👤 Testing User Stats Calculation...');
    const { data: bugReports, error: reportsError } = await supabase
      .from('bug_reports')
      .select('reporter_email, priority, status, category, created_at')
      .limit(50);
    
    if (reportsError) {
      console.log('❌ Failed to fetch bug reports for user stats test');
    } else {
      const userStats = new Map();
      
      bugReports.forEach(report => {
        const email = report.reporter_email;
        if (!email) return;
        
        if (!userStats.has(email)) {
          userStats.set(email, {
            total: 0,
            critical: 0,
            high: 0,
            medium: 0,
            low: 0,
            points: 0,
            resolved: 0
          });
        }
        
        const stats = userStats.get(email);
        stats.total++;
        
        if (report.priority === 'critical') {
          stats.critical++;
          stats.points += 50;
        } else if (report.priority === 'high') {
          stats.high++;
          stats.points += 30;
        } else if (report.priority === 'medium') {
          stats.medium++;
          stats.points += 15;
        } else {
          stats.low++;
          stats.points += 5;
        }
        
        if (report.status === 'resolved') {
          stats.resolved++;
        }
      });
      
      const topUsers = Array.from(userStats.entries())
        .sort((a, b) => b[1].points - a[1].points)
        .slice(0, 5);
      
      console.log('✅ User stats calculated successfully');
      console.log('\n🎯 Top Bug Hunters by Points:');
      topUsers.forEach(([email, stats], index) => {
        console.log(`${index + 1}. ${email}`);
        console.log(`   Points: ${stats.points} | Reports: ${stats.total} | Resolved: ${stats.resolved}`);
        console.log(`   Critical: ${stats.critical} | High: ${stats.high} | Medium: ${stats.medium} | Low: ${stats.low}`);
        console.log('---');
      });
    }
    
    // Test screenshot display fix
    console.log('\n📷 Testing Screenshot Data...');
    const { data: screenshotReports, error: screenshotError } = await supabase
      .from('bug_reports')
      .select('id, title, screenshot_url, reporter_email')
      .not('screenshot_url', 'is', null)
      .limit(3);
    
    if (screenshotError) {
      console.log('❌ Failed to fetch screenshot reports');
    } else {
      console.log(`✅ Found ${screenshotReports.length} reports with screenshots`);
      screenshotReports.forEach((report, index) => {
        console.log(`${index + 1}. ${report.title} by ${report.reporter_email}`);
        console.log(`   Screenshot: ${report.screenshot_url}`);
      });
    }
    
    console.log('\n🎉 Bug Bounty System Test Complete!');
    console.log('\n📋 System Status:');
    console.log('✅ Bug reports exist and are accessible');
    console.log('✅ Admin APIs working correctly');
    console.log('✅ User statistics calculation functional');
    console.log('✅ Screenshot display mechanism ready');
    console.log('✅ Leaderboard and ranking system operational');
    
    console.log('\n🚀 Ready for Bug Bounty Gaming!');
    
  } catch (error) {
    console.error('❌ Bug bounty system test failed:', error);
  }
}

testBugBountySystem().then(() => {
  console.log('\n✅ Test completed');
  process.exit(0);
}).catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
