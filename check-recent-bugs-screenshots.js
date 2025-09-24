const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkRecentBugsScreenshots() {
  console.log('🔍 Checking recent bug reports for screenshot storage...');
  
  try {
    // Get recent bug reports, especially looking for "Hdhdh", "trt", "tyui"
    const { data: bugReports, error } = await supabase
      .from('bug_reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Error fetching bug reports:', error);
      return;
    }

    console.log(`📊 Found ${bugReports.length} recent bug reports\n`);

    bugReports.forEach((report, index) => {
      console.log(`${index + 1}. Bug Report: "${report.title}"`);
      console.log(`   ID: ${report.id}`);
      console.log(`   Status: ${report.status}`);
      console.log(`   Reporter: ${report.reporter_email}`);
      console.log(`   Created: ${report.created_at}`);
      console.log(`   Screenshot URL: ${report.screenshot_url || 'NO SCREENSHOT'}`);
      
      if (report.screenshot_url) {
        console.log(`   Screenshot Status: ✅ STORED IN DB`);
        
        // Check if URL is accessible by trying to get storage info
        try {
          const urlParts = report.screenshot_url.split('/');
          const fileName = urlParts[urlParts.length - 1];
          const pathParts = urlParts.slice(-3); // Get last 3 parts: bug-reports/id/filename
          const filePath = pathParts.join('/');
          console.log(`   Storage Path: ${filePath}`);
        } catch (e) {
          console.log(`   Storage Path: Could not parse URL`);
        }
      } else {
        console.log(`   Screenshot Status: ❌ NO URL IN DB`);
      }
      
      console.log('   ---');
    });

    // Specifically check for the mentioned bugs
    const targetTitles = ['Hdhdh', 'trt', 'tyui'];
    console.log('\n🎯 Checking specifically mentioned bugs:');
    
    const { data: specificBugs, error: specificError } = await supabase
      .from('bug_reports')
      .select('*')
      .in('title', targetTitles);

    if (specificError) {
      console.error('Error fetching specific bugs:', specificError);
    } else {
      if (specificBugs.length === 0) {
        console.log('❌ No bugs found with titles "Hdhdh", "trt", "tyui"');
        
        // Check for similar titles (case insensitive)
        const { data: similarBugs, error: similarError } = await supabase
          .from('bug_reports')
          .select('*')
          .or('title.ilike.%hdhdh%,title.ilike.%trt%,title.ilike.%tyui%');
        
        if (!similarError && similarBugs.length > 0) {
          console.log('\n📝 Found similar titles:');
          similarBugs.forEach(bug => {
            console.log(`   - "${bug.title}" (ID: ${bug.id})`);
            console.log(`     Screenshot: ${bug.screenshot_url ? '✅ Yes' : '❌ No'}`);
          });
        }
      } else {
        specificBugs.forEach(bug => {
          console.log(`\n✅ Found: "${bug.title}"`);
          console.log(`   ID: ${bug.id}`);
          console.log(`   Screenshot URL: ${bug.screenshot_url || 'NONE'}`);
          console.log(`   Created: ${bug.created_at}`);
          
          if (bug.screenshot_url) {
            console.log(`   🔗 Screenshot URL accessible for testing:`);
            console.log(`   ${bug.screenshot_url}`);
          }
        });
      }
    }

    // Check storage bucket for recent files
    console.log('\n📁 Checking recent files in bug-screenshots bucket...');
    try {
      const { data: files, error: filesError } = await supabase.storage
        .from('bug-screenshots')
        .list('bug-reports', {
          limit: 20,
          sortBy: { column: 'created_at', order: 'desc' }
        });

      if (filesError) {
        console.error('Error listing storage files:', filesError);
      } else {
        console.log(`📂 Found ${files.length} recent files in storage:`);
        files.forEach((file, index) => {
          console.log(`   ${index + 1}. ${file.name} (${file.metadata?.size || 'unknown size'} bytes)`);
          console.log(`      Created: ${file.created_at}`);
          console.log(`      Updated: ${file.updated_at}`);
        });

        // Look for bug report folders
        const { data: folders, error: foldersError } = await supabase.storage
          .from('bug-screenshots')
          .list('bug-reports');

        if (!foldersError && folders) {
          console.log(`\n📂 Bug report folders: ${folders.length}`);
          // Check a few recent folders for files
          for (let i = 0; i < Math.min(3, folders.length); i++) {
            const folder = folders[i];
            if (folder.name) {
              const { data: folderFiles, error: folderError } = await supabase.storage
                .from('bug-screenshots')
                .list(`bug-reports/${folder.name}`);

              if (!folderError && folderFiles) {
                console.log(`   📁 ${folder.name}: ${folderFiles.length} files`);
                folderFiles.forEach(file => {
                  console.log(`      - ${file.name} (${file.metadata?.size || 'unknown'} bytes)`);
                });
              }
            }
          }
        }
      }
    } catch (storageError) {
      console.error('Storage check failed:', storageError);
    }

  } catch (error) {
    console.error('Check failed:', error);
  }
}

checkRecentBugsScreenshots().then(() => {
  console.log('\n✅ Screenshot check completed');
  process.exit(0);
}).catch(err => {
  console.error('Check failed:', err);
  process.exit(1);
});
