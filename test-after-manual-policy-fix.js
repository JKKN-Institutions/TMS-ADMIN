const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

// Use ONLY the anon key (like the frontend does)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function testAfterPolicyFix() {
  console.log('🧪 Testing upload with ANON KEY (same as frontend)...');
  
  try {
    const testImageContent = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAGA8QWMAAAAAElFTkSuQmCC';
    const buffer = Buffer.from(testImageContent, 'base64');
    const testFile = new File([buffer], 'manual-policy-test.png', { type: 'image/png' });
    
    const testPath = `bug-reports/manual-test-${Date.now()}/test.png`;
    
    console.log('📤 Uploading with anon key to:', testPath);
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('bug-screenshots')
      .upload(testPath, testFile);

    if (uploadError) {
      console.log('❌ Upload FAILED - Policies still need to be created manually');
      console.log('Error:', uploadError.message);
      console.log('\n📋 Please follow the manual steps in Supabase Dashboard');
      return false;
    }

    console.log('✅ Upload SUCCESSFUL with anon key!');
    console.log('📁 Uploaded to:', uploadData.path);
    
    // Get public URL
    const { data: urlData } = supabase.storage
      .from('bug-screenshots')
      .getPublicUrl(uploadData.path);
    
    console.log('🔗 Public URL:', urlData.publicUrl);
    
    // Test URL accessibility
    try {
      const response = await fetch(urlData.publicUrl);
      console.log('🌐 URL test:', response.status, response.statusText);
    } catch (e) {
      console.log('🌐 URL test failed:', e.message);
    }
    
    // Clean up
    await supabase.storage
      .from('bug-screenshots')
      .remove([testPath]);
    console.log('🧹 Test file cleaned up');
    
    return true;
    
  } catch (error) {
    console.error('💥 Test failed:', error);
    return false;
  }
}

async function testFullBugReportFlow() {
  console.log('\n🔄 Testing complete bug report flow...');
  
  try {
    // Create a bug report with screenshot using the API logic
    const testImageContent = 'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH3QwNEgkTGm7MwAAAABl0RVh0Q29tbWVudABDcmVhdGVkIHdpdGggR0lNUFeBDhcAAABHSURBVBjTY/z//z8DKYAx+P//P8aQBXgYSAS9vb2HDYoQBv/+/Rv9DwUYIhcaBhIBVZpLmgLaLYRZ8J9hCAJUCiRSAAABCgATGp8NAAAAAElFTkSuQmCC';
    const buffer = Buffer.from(testImageContent, 'base64');
    const testFile = new File([buffer], 'full-flow-test.png', { type: 'image/png' });

    const bugReportId = crypto.randomUUID();
    const fileName = `${crypto.randomUUID()}.png`;
    const filePath = `bug-reports/${bugReportId}/${fileName}`;

    console.log('📤 Step 1: Upload screenshot');
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('bug-screenshots')
      .upload(filePath, testFile, {
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      console.log('❌ Screenshot upload failed:', uploadError.message);
      return;
    }

    console.log('✅ Screenshot uploaded:', uploadData.path);

    const { data: urlData } = supabase.storage
      .from('bug-screenshots')
      .getPublicUrl(uploadData.path);

    const screenshotUrl = urlData.publicUrl;
    console.log('🔗 Screenshot URL:', screenshotUrl);

    console.log('💾 Step 2: Create bug report in database');
    const bugReport = {
      id: bugReportId,
      title: 'Manual Policy Fix Test - ' + new Date().toLocaleTimeString(),
      description: 'Testing bug report creation after manual policy fix.\n\n**Steps to Reproduce:**\n1. Fixed RLS policies manually\n2. Testing upload flow\n\n**Expected Behavior:**\nScreenshot should appear in admin panel\n\n**Actual Behavior:**\nTesting...',
      category: 'functionality',
      priority: 'medium',
      status: 'open',
      reported_by: crypto.randomUUID(),
      reporter_name: 'Policy Fix Test',
      reporter_email: 'test@policy-fix.com',
      reporter_type: 'student',
      screenshot_url: screenshotUrl,
      browser_info: 'Test Browser',
      device_info: 'Test Device',
      screen_resolution: '1920x1080',
      user_agent: 'Test User Agent',
      page_url: 'http://localhost:3000/test',
      tags: null,
      is_duplicate: false,
      duplicate_of: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: bugData, error: bugError } = await supabase
      .from('bug_reports')
      .insert([bugReport])
      .select()
      .single();

    if (bugError) {
      console.log('❌ Bug report creation failed:', bugError.message);
      return;
    }

    console.log('✅ Bug report created successfully!');
    console.log('📋 Bug details:');
    console.log('   ID:', bugData.id);
    console.log('   Title:', bugData.title);
    console.log('   Screenshot URL:', bugData.screenshot_url);
    
    console.log('\n🎉 SUCCESS! Bug report with screenshot created.');
    console.log('📸 This bug should now appear in the admin panel WITH a screenshot.');
    
  } catch (error) {
    console.error('💥 Full flow test failed:', error);
  }
}

testAfterPolicyFix().then(async (success) => {
  if (success) {
    await testFullBugReportFlow();
  }
  console.log('\n✅ Test completed');
  process.exit(0);
}).catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
