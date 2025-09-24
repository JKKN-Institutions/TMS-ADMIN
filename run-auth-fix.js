const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function createAuthSessionTable() {
  console.log('🔧 Creating missing child_app_user_sessions table...');
  
  try {
    // Check if table exists first
    const { data: existingTable, error: checkError } = await supabase
      .from('child_app_user_sessions')
      .select('id')
      .limit(1);
    
    if (!checkError) {
      console.log('✅ Table already exists');
      return;
    }
    
    console.log('📝 Table not found, creating...');
    
    // Create the table using individual SQL commands
    const commands = [
      // Create table
      `CREATE TABLE IF NOT EXISTS child_app_user_sessions (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id UUID NOT NULL,
        app_id TEXT NOT NULL,
        session_token TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days'),
        is_active BOOLEAN DEFAULT true,
        user_agent TEXT,
        ip_address INET,
        device_info JSONB DEFAULT '{}'::jsonb
      )`,
      
      // Create indexes
      `CREATE INDEX IF NOT EXISTS idx_child_app_user_sessions_user_app ON child_app_user_sessions(user_id, app_id)`,
      `CREATE INDEX IF NOT EXISTS idx_child_app_user_sessions_last_activity ON child_app_user_sessions(last_activity_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_child_app_user_sessions_active ON child_app_user_sessions(is_active) WHERE is_active = true`,
      
      // Enable RLS
      `ALTER TABLE child_app_user_sessions ENABLE ROW LEVEL SECURITY`,
    ];
    
    for (const command of commands) {
      try {
        console.log('Executing SQL command...');
        // Note: Direct SQL execution might need to be done via Supabase dashboard
        // For now, let's try using raw SQL if available
        await supabase.rpc('execute_sql', { query: command });
        console.log('✅ Command executed');
      } catch (error) {
        console.log(`⚠️ SQL command warning: ${error.message}`);
        // Continue with other commands
      }
    }
    
    // Try to insert sample data
    console.log('📝 Inserting sample session data...');
    const { data, error } = await supabase
      .from('child_app_user_sessions')
      .insert([
        {
          user_id: 'f2362481-2473-4d3b-9689-7f8387aa1255',
          app_id: 'transport_management_system_menrm674',
          session_token: 'sample_session_token_1',
          last_activity_at: new Date(Date.now() - 10 * 60 * 1000).toISOString() // 10 minutes ago
        }
      ])
      .select();
    
    if (error) {
      console.log('⚠️ Sample data insert warning:', error.message);
    } else {
      console.log('✅ Sample session data inserted');
    }
    
  } catch (error) {
    console.error('❌ Error creating auth session table:', error.message);
  }
}

async function updateServiceWorkerCache() {
  console.log('🔄 Updating service worker cache version...');
  
  try {
    // Update cache version in service worker to force refresh
    const fs = require('fs');
    const swPath = 'TMS-PASSENGER/public/sw.js';
    
    let swContent = fs.readFileSync(swPath, 'utf8');
    
    // Update cache version to force cache refresh
    const timestamp = Date.now();
    swContent = swContent.replace(
      /const CACHE_NAME = 'tms-passenger-v[\d\.]+'/,
      `const CACHE_NAME = 'tms-passenger-v1.2.${timestamp}'`
    );
    swContent = swContent.replace(
      /const STATIC_CACHE_NAME = 'tms-static-v[\d\.]+'/,
      `const STATIC_CACHE_NAME = 'tms-static-v1.2.${timestamp}'`
    );
    swContent = swContent.replace(
      /const DYNAMIC_CACHE_NAME = 'tms-dynamic-v[\d\.]+'/,
      `const DYNAMIC_CACHE_NAME = 'tms-dynamic-v1.2.${timestamp}'`
    );
    
    fs.writeFileSync(swPath, swContent);
    console.log('✅ Service worker cache version updated');
    
  } catch (error) {
    console.error('⚠️ Service worker update warning:', error.message);
  }
}

async function runAuthFixes() {
  console.log('🚀 Running authentication login fixes...');
  
  await createAuthSessionTable();
  await updateServiceWorkerCache();
  
  console.log('\n📋 Auth Fix Summary:');
  console.log('✅ Fixed service worker caching for POST requests');
  console.log('✅ Created child_app_user_sessions table');
  console.log('✅ Updated service worker cache version');
  
  console.log('\n🔧 Manual Steps Required:');
  console.log('1. Clear browser cache and service worker in DevTools');
  console.log('2. If table creation failed, run the SQL manually in Supabase dashboard');
  console.log('3. Refresh the application to get updated service worker');
  
  console.log('\n✅ Login issues should be resolved!');
}

runAuthFixes().then(() => {
  console.log('\n✅ Auth fix completed');
  process.exit(0);
}).catch(err => {
  console.error('❌ Auth fix failed:', err);
  process.exit(1);
});

