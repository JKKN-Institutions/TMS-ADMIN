const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

// Try with service role key if available, otherwise anon key
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log('🔑 Available keys:');
console.log('   Supabase URL:', supabaseUrl ? 'Set' : 'Missing');
console.log('   Service Role Key:', serviceRoleKey ? 'Set' : 'Missing');
console.log('   Anon Key:', anonKey ? 'Set' : 'Missing');

const supabase = createClient(supabaseUrl, serviceRoleKey || anonKey);

async function fixStoragePolicies() {
  console.log('\n🔧 Attempting to fix storage RLS policies...');
  
  try {
    // First, check current policies
    console.log('📋 Checking current storage policies...');
    
    const { data: policies, error: policiesError } = await supabase
      .from('pg_policies')
      .select('*')
      .eq('tablename', 'objects')
      .eq('schemaname', 'storage');

    if (policiesError) {
      console.log('⚠️ Could not fetch current policies (this might be normal):', policiesError.message);
    } else {
      console.log(`📜 Found ${policies.length} existing storage policies`);
      policies.forEach(policy => {
        console.log(`   - ${policy.policyname}: ${policy.cmd} on ${policy.tablename}`);
      });
    }

    // Try to create the necessary RLS policies
    console.log('\n🛡️ Creating RLS policies for bug-screenshots bucket...');

    const createPoliciesSQL = `
      -- First, enable RLS on storage.objects if not already enabled
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

      -- Drop existing policies if they exist (to avoid conflicts)
      DROP POLICY IF EXISTS "bug_screenshots_public_read" ON storage.objects;
      DROP POLICY IF EXISTS "bug_screenshots_public_upload" ON storage.objects;

      -- Create policy for public read access
      CREATE POLICY "bug_screenshots_public_read" ON storage.objects
        FOR SELECT 
        USING (bucket_id = 'bug-screenshots');

      -- Create policy for public upload access  
      CREATE POLICY "bug_screenshots_public_upload" ON storage.objects
        FOR INSERT 
        WITH CHECK (bucket_id = 'bug-screenshots');

      -- Create policy for public update access (for metadata updates)
      DROP POLICY IF EXISTS "bug_screenshots_public_update" ON storage.objects;
      CREATE POLICY "bug_screenshots_public_update" ON storage.objects
        FOR UPDATE
        USING (bucket_id = 'bug-screenshots')
        WITH CHECK (bucket_id = 'bug-screenshots');
    `;

    console.log('🚀 Executing SQL policies...');
    
    const { data: sqlResult, error: sqlError } = await supabase.rpc('exec_sql', { 
      query: createPoliciesSQL 
    });

    if (sqlError) {
      console.log('❌ SQL execution failed (trying alternative method):', sqlError.message);
      
      // Try individual policy creation
      const policies = [
        {
          name: 'bug_screenshots_public_read',
          sql: `CREATE POLICY "bug_screenshots_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'bug-screenshots');`
        },
        {
          name: 'bug_screenshots_public_upload', 
          sql: `CREATE POLICY "bug_screenshots_public_upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'bug-screenshots');`
        }
      ];

      for (const policy of policies) {
        try {
          const { error } = await supabase.rpc('exec_sql', { query: policy.sql });
          if (error) {
            console.log(`⚠️ Policy ${policy.name} failed:`, error.message);
          } else {
            console.log(`✅ Policy ${policy.name} created successfully`);
          }
        } catch (e) {
          console.log(`❌ Policy ${policy.name} error:`, e.message);
        }
      }
    } else {
      console.log('✅ All policies created successfully!');
    }

    // Test upload after policy creation
    console.log('\n🧪 Testing upload after policy creation...');
    
    const testImageContent = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAGA8QWMAAAAAElFTkSuQmCC';
    const buffer = Buffer.from(testImageContent, 'base64');
    const testFile = new File([buffer], 'policy-test.png', { type: 'image/png' });
    
    const testPath = `bug-reports/policy-test-${Date.now()}/test.png`;
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('bug-screenshots')
      .upload(testPath, testFile);

    if (uploadError) {
      console.log('❌ Upload still failing after policy creation:', uploadError.message);
      console.log('\n📋 Manual steps required:');
      console.log('1. Go to Supabase Dashboard → Storage → Policies');
      console.log('2. Select the "bug-screenshots" bucket');
      console.log('3. Add these policies:');
      console.log('');
      console.log('   Policy 1 - Read Access:');
      console.log('   - Name: Allow public read');
      console.log('   - Policy: FOR SELECT USING (true)');
      console.log('   - Target roles: public');
      console.log('');
      console.log('   Policy 2 - Upload Access:');
      console.log('   - Name: Allow public upload');
      console.log('   - Policy: FOR INSERT WITH CHECK (true)');
      console.log('   - Target roles: public');
      
    } else {
      console.log('✅ Upload successful! RLS policies are now working.');
      console.log('📁 Test file uploaded to:', uploadData.path);
      
      // Clean up test file
      await supabase.storage
        .from('bug-screenshots')
        .remove([testPath]);
      console.log('🧹 Test file cleaned up');
    }

  } catch (error) {
    console.error('💥 Policy fix failed:', error);
    
    console.log('\n🔧 Alternative fix - Manual Supabase Dashboard steps:');
    console.log('1. Go to https://supabase.com/dashboard');
    console.log('2. Select your project');
    console.log('3. Go to Storage → Policies');
    console.log('4. Click on "bug-screenshots" bucket');
    console.log('5. Add new policies:');
    console.log('');
    console.log('   READ Policy:');
    console.log('   - Name: "Public read access"');
    console.log('   - Operation: SELECT');
    console.log('   - Policy definition: bucket_id = \'bug-screenshots\'');
    console.log('');
    console.log('   UPLOAD Policy:');
    console.log('   - Name: "Public upload access"');
    console.log('   - Operation: INSERT');
    console.log('   - Policy definition: bucket_id = \'bug-screenshots\'');
  }
}

fixStoragePolicies().then(() => {
  console.log('\n✅ Storage policy fix completed');
  process.exit(0);
}).catch(err => {
  console.error('Policy fix failed:', err);
  process.exit(1);
});
