const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkScreenshots() {
  console.log('🔍 Checking screenshot data in bug reports...');
  
  const { data, error } = await supabase
    .from('bug_reports')
    .select('id, title, screenshot_url, reporter_email, created_at')
    .order('created_at', { ascending: false })
    .limit(10);
  
  if (error) {
    console.error('Error:', error.message);
    return;
  }
  
  console.log('📋 Bug reports with screenshot info:');
  let screenshotCount = 0;
  
  data.forEach((bug, index) => {
    const hasScreenshot = !!bug.screenshot_url;
    if (hasScreenshot) screenshotCount++;
    
    console.log(`${index + 1}. ${bug.title}`);
    console.log(`   Reporter: ${bug.reporter_email}`);
    console.log(`   Screenshot: ${hasScreenshot ? 'YES' : 'NO'}`);
    if (hasScreenshot) {
      console.log(`   URL: ${bug.screenshot_url}`);
    }
    console.log('---');
  });
  
  console.log(`\n📊 Summary: ${screenshotCount}/${data.length} bug reports have screenshots`);
  
  // Test screenshot URL accessibility
  if (screenshotCount > 0) {
    const bugWithScreenshot = data.find(b => b.screenshot_url);
    console.log(`\n🧪 Testing screenshot URL accessibility...`);
    console.log(`Test URL: ${bugWithScreenshot.screenshot_url}`);
    
    try {
      const response = await fetch(bugWithScreenshot.screenshot_url);
      console.log(`✅ Screenshot URL accessible: HTTP ${response.status}`);
      console.log(`Content-Type: ${response.headers.get('content-type')}`);
    } catch (error) {
      console.log(`❌ Screenshot URL test failed: ${error.message}`);
    }
  }
}

checkScreenshots().then(() => {
  console.log('\n✅ Screenshot check completed');
  process.exit(0);
}).catch(err => {
  console.error('❌ Check failed:', err);
  process.exit(1);
});

