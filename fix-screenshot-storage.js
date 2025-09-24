const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixScreenshotStorage() {
  console.log('🔧 Fixing screenshot storage issues...');
  
  try {
    // Check if bug-screenshots bucket exists
    console.log('📦 Checking storage buckets...');
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
    
    if (bucketsError) {
      console.error('❌ Error listing buckets:', bucketsError);
      return;
    }
    
    console.log('📦 Available buckets:', buckets.map(b => b.name));
    
    const bugScreenshotsBucket = buckets.find(b => b.name === 'bug-screenshots');
    
    if (!bugScreenshotsBucket) {
      console.log('🆕 Creating bug-screenshots bucket...');
      
      const { data: newBucket, error: createError } = await supabase.storage.createBucket('bug-screenshots', {
        public: true,
        allowedMimeTypes: ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'],
        fileSizeLimit: 10485760 // 10MB
      });
      
      if (createError) {
        console.error('❌ Error creating bucket:', createError);
      } else {
        console.log('✅ Bug-screenshots bucket created successfully');
      }
    } else {
      console.log('✅ Bug-screenshots bucket already exists');
    }
    
    // Test screenshot URL accessibility
    console.log('\n🧪 Testing existing screenshot URLs...');
    const { data: bugReports, error: reportsError } = await supabase
      .from('bug_reports')
      .select('id, title, screenshot_url')
      .not('screenshot_url', 'is', null)
      .limit(5);
    
    if (reportsError) {
      console.error('❌ Error fetching bug reports:', reportsError);
    } else {
      console.log(`📊 Found ${bugReports.length} reports with screenshots:`);
      
      for (const report of bugReports) {
        console.log(`\n📋 Report: ${report.title}`);
        console.log(`🔗 URL: ${report.screenshot_url}`);
        
        try {
          const response = await fetch(report.screenshot_url);
          console.log(`📊 Status: ${response.status} ${response.statusText}`);
          
          if (response.status === 400) {
            console.log('⚠️ Storage URL returning 400 - checking bucket permissions...');
            
            // Try to get file from storage directly
            const urlParts = report.screenshot_url.split('/');
            const fileName = urlParts.slice(-2).join('/'); // Get last two parts as file path
            
            console.log(`🔍 Checking file: ${fileName}`);
            
            const { data: fileData, error: fileError } = await supabase.storage
              .from('bug-screenshots')
              .list(fileName.split('/')[0], {
                limit: 10
              });
            
            if (fileError) {
              console.log(`❌ File list error: ${fileError.message}`);
            } else {
              console.log(`📁 Files in directory: ${fileData.length}`);
              fileData.forEach(f => console.log(`  - ${f.name}`));
            }
          }
        } catch (fetchError) {
          console.log(`❌ Fetch error: ${fetchError.message}`);
        }
      }
    }
    
    // Check bucket policies
    console.log('\n🔐 Checking bucket policies...');
    try {
      const { data: policies, error: policiesError } = await supabase.storage
        .from('bug-screenshots')
        .createSignedUrl('test-path', 60);
      
      if (policiesError) {
        console.log('⚠️ Signed URL test failed:', policiesError.message);
      } else {
        console.log('✅ Bucket is accessible for signed URLs');
      }
    } catch (policyError) {
      console.log('⚠️ Policy check failed:', policyError.message);
    }
    
    // Recommendations
    console.log('\n💡 Recommendations:');
    console.log('1. ✅ Ensure bug-screenshots bucket exists and is public');
    console.log('2. 🔧 Check RLS policies allow public read access');
    console.log('3. 🔄 Clear browser cache to get fresh URLs');
    console.log('4. 📱 Test screenshot upload with fresh bug report');
    
    console.log('\n🎯 Next Steps:');
    console.log('1. Try submitting a new bug report with screenshot');
    console.log('2. Check if new screenshots load properly');
    console.log('3. Update old screenshot URLs if needed');
    
  } catch (error) {
    console.error('❌ Storage fix failed:', error);
  }
}

fixScreenshotStorage().then(() => {
  console.log('\n✅ Screenshot storage fix completed');
  process.exit(0);
}).catch(err => {
  console.error('❌ Fix failed:', err);
  process.exit(1);
});
