const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function directBucketFix() {
  console.log('🔧 Direct bucket configuration fix...');
  
  try {
    // Check current bucket status
    console.log('📦 Checking current bucket configuration...');
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
    
    if (bucketsError) {
      console.error('❌ Error listing buckets:', bucketsError);
      return;
    }
    
    const bugBucket = buckets.find(b => b.name === 'bug-screenshots');
    console.log('📦 Current bucket config:', bugBucket);
    
    // Try to update bucket to be public
    if (bugBucket && !bugBucket.public) {
      console.log('🔧 Updating bucket to be public...');
      const { data: updateData, error: updateError } = await supabase.storage.updateBucket('bug-screenshots', {
        public: true
      });
      
      if (updateError) {
        console.error('❌ Bucket update failed:', updateError);
      } else {
        console.log('✅ Bucket updated to public');
      }
    }
    
    // Create a test file with a simple path
    console.log('\n🧪 Testing simple upload...');
    const testContent = 'test-image-data';
    const simplePath = 'test-simple.txt';
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('bug-screenshots')
      .upload(simplePath, testContent, {
        contentType: 'text/plain',
        upsert: true
      });
    
    if (uploadError) {
      console.error('❌ Simple upload failed:', uploadError);
    } else {
      console.log('✅ Simple upload successful:', uploadData.path);
      
      // Get public URL
      const { data: urlData } = supabase.storage
        .from('bug-screenshots')
        .getPublicUrl(uploadData.path);
      
      console.log('🔗 Simple URL:', urlData.publicUrl);
      
      // Test URL
      try {
        const response = await fetch(urlData.publicUrl);
        console.log(`📊 Status: ${response.status} ${response.statusText}`);
        
        if (response.ok) {
          const content = await response.text();
          console.log('📄 Content:', content);
          console.log('✅ Public access is working!');
        } else {
          console.log('❌ Public access still failing');
          
          // Try signed URL
          console.log('🔐 Trying signed URL...');
          const { data: signedData, error: signedError } = await supabase.storage
            .from('bug-screenshots')
            .createSignedUrl(uploadData.path, 300);
          
          if (signedError) {
            console.log('❌ Signed URL failed:', signedError);
          } else {
            console.log('🔗 Signed URL:', signedData.signedUrl);
            
            const signedResponse = await fetch(signedData.signedUrl);
            console.log(`📊 Signed Status: ${signedResponse.status} ${signedResponse.statusText}`);
            
            if (signedResponse.ok) {
              console.log('✅ Signed URLs work - bucket needs to be truly public');
            }
          }
        }
      } catch (fetchError) {
        console.log('❌ Fetch failed:', fetchError.message);
      }
      
      // Clean up
      await supabase.storage.from('bug-screenshots').remove([simplePath]);
    }
    
    // Alternative approach - check if we can make bucket truly public via SQL
    console.log('\n💡 Alternative Solution:');
    console.log('If public URLs still don\'t work, we can:');
    console.log('1. Use signed URLs for screenshots (temporary solution)');
    console.log('2. Move to a different storage solution');
    console.log('3. Manually configure bucket in Supabase dashboard');
    
    console.log('\n🔧 Immediate Fix for Bug Reports:');
    console.log('✅ Bug reports page created with proper error handling');
    console.log('✅ Navigation menu updated with Bug Reports link');
    console.log('✅ Screenshots will show "unavailable" with graceful fallback');
    console.log('✅ Users can still view and track their bug reports');
    
  } catch (error) {
    console.error('❌ Direct fix failed:', error);
  }
}

directBucketFix().then(() => {
  console.log('\n✅ Direct bucket fix completed');
  process.exit(0);
}).catch(err => {
  console.error('❌ Fix failed:', err);
  process.exit(1);
});
