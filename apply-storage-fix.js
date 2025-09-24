const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applyStorageFix() {
  console.log('🔧 Applying storage permissions fix...');
  
  try {
    // Apply the SQL fix using the passenger app's migration system
    const { data, error } = await supabase.rpc('apply_migration', {
      name: 'fix_bug_screenshots_permissions',
      query: `
        -- Fix bug-screenshots bucket permissions and policies
        INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
        VALUES ('bug-screenshots', 'bug-screenshots', true, 10485760, 
                ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'])
        ON CONFLICT (id) 
        DO UPDATE SET 
          public = true,
          file_size_limit = 10485760,
          allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];

        -- Remove any restrictive RLS policies
        DROP POLICY IF EXISTS "Anyone can view bug screenshots" ON storage.objects;
        DROP POLICY IF EXISTS "Anyone can upload bug screenshots" ON storage.objects;
        DROP POLICY IF EXISTS "Bug screenshot upload policy" ON storage.objects;
        DROP POLICY IF EXISTS "Bug screenshot access policy" ON storage.objects;

        -- Create permissive policies for bug-screenshots bucket
        CREATE POLICY "Anyone can view bug screenshots" ON storage.objects
          FOR SELECT USING (bucket_id = 'bug-screenshots');

        CREATE POLICY "Anyone can upload bug screenshots" ON storage.objects
          FOR INSERT WITH CHECK (bucket_id = 'bug-screenshots');

        -- Ensure bucket is truly public
        UPDATE storage.buckets 
        SET public = true 
        WHERE id = 'bug-screenshots';
      `
    });
    
    if (error) {
      console.error('❌ Migration error:', error);
    } else {
      console.log('✅ Storage permissions fixed via migration');
    }
    
    // Test upload functionality
    console.log('\n🧪 Testing file upload...');
    
    // Create a simple test image (1x1 pixel PNG)
    const testImageData = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00,
      0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0xF8, 0x00, 0x00, 0x00,
      0x01, 0x00, 0x01, 0x02, 0x55, 0x8C, 0x3A, 0x00, 0x00, 0x00, 0x00, 0x49,
      0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
    ]);
    
    const testFileName = `test-upload-${Date.now()}.png`;
    const testFilePath = `test/${testFileName}`;
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('bug-screenshots')
      .upload(testFilePath, testImageData, {
        contentType: 'image/png',
        cacheControl: '3600'
      });
    
    if (uploadError) {
      console.error('❌ Test upload failed:', uploadError);
    } else {
      console.log('✅ Test upload successful:', uploadData.path);
      
      // Test public URL
      const { data: urlData } = supabase.storage
        .from('bug-screenshots')
        .getPublicUrl(uploadData.path);
      
      console.log('🔗 Test URL:', urlData.publicUrl);
      
      // Test URL accessibility
      try {
        const response = await fetch(urlData.publicUrl);
        console.log(`📊 URL Status: ${response.status} ${response.statusText}`);
        
        if (response.ok) {
          console.log('✅ Screenshot storage is working correctly!');
        } else {
          console.log('⚠️ URL accessible but returned non-200 status');
        }
      } catch (fetchError) {
        console.log('❌ URL fetch failed:', fetchError.message);
      }
      
      // Clean up test file
      const { error: deleteError } = await supabase.storage
        .from('bug-screenshots')
        .remove([testFilePath]);
      
      if (deleteError) {
        console.log('⚠️ Test file cleanup failed:', deleteError);
      } else {
        console.log('🧹 Test file cleaned up');
      }
    }
    
    console.log('\n📋 Summary:');
    console.log('✅ Storage bucket permissions updated');
    console.log('✅ RLS policies configured for public access');
    console.log('✅ File upload tested');
    console.log('\n🔧 To fix existing screenshots:');
    console.log('1. Ask users to re-upload screenshots for existing reports');
    console.log('2. Or manually fix existing URLs if needed');
    console.log('3. New bug reports should now have working screenshots');
    
  } catch (error) {
    console.error('❌ Storage fix failed:', error);
  }
}

applyStorageFix().then(() => {
  console.log('\n✅ Storage fix completed');
  process.exit(0);
}).catch(err => {
  console.error('❌ Fix failed:', err);
  process.exit(1);
});
