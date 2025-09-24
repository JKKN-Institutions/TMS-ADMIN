const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function createMissingAuthTable() {
  console.log('🔧 Creating child_app_user_sessions table using passenger app migration...');
  
  try {
    const { data, error } = await supabase.rpc('apply_migration', {
      name: 'create_child_app_user_sessions',
      query: `
        CREATE TABLE IF NOT EXISTS child_app_user_sessions (
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
        );
        
        CREATE INDEX IF NOT EXISTS idx_child_app_user_sessions_user_app 
        ON child_app_user_sessions(user_id, app_id);
        
        CREATE INDEX IF NOT EXISTS idx_child_app_user_sessions_last_activity 
        ON child_app_user_sessions(last_activity_at DESC);
        
        ALTER TABLE child_app_user_sessions ENABLE ROW LEVEL SECURITY;
        
        GRANT ALL ON child_app_user_sessions TO authenticated, service_role;
      `
    });
    
    if (error) {
      console.error('❌ Migration error:', error);
    } else {
      console.log('✅ Migration successful:', data);
    }
    
    // Test and insert sample data
    console.log('📝 Testing table and inserting sample data...');
    const { data: insertData, error: insertError } = await supabase
      .from('child_app_user_sessions')
      .insert([
        {
          user_id: 'f2362481-2473-4d3b-9689-7f8387aa1255',
          app_id: 'transport_management_system_menrm674',
          session_token: 'sample_session_token_1',
          last_activity_at: new Date(Date.now() - 10 * 60 * 1000).toISOString()
        }
      ])
      .select();
    
    if (insertError) {
      console.log('⚠️ Insert error:', insertError.message);
    } else {
      console.log('✅ Sample data inserted successfully:', insertData);
    }
    
  } catch (error) {
    console.error('❌ Table creation failed:', error);
  }
}

createMissingAuthTable().then(() => {
  console.log('\n✅ Auth table creation process completed');
  process.exit(0);
}).catch(err => {
  console.error('❌ Process failed:', err);
  process.exit(1);
});

