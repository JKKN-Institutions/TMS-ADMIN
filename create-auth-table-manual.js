const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function createAuthTableManually() {
  console.log('🔧 Creating child_app_user_sessions table manually...');
  
  try {
    // Use apply_migration to create the table
    const { data, error } = await supabase.rpc('apply_migration', {
      name: 'create_child_app_user_sessions',
      query: `
        -- Create child_app_user_sessions table
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

        -- Create indexes
        CREATE INDEX IF NOT EXISTS idx_child_app_user_sessions_user_app 
        ON child_app_user_sessions(user_id, app_id);
        
        CREATE INDEX IF NOT EXISTS idx_child_app_user_sessions_last_activity 
        ON child_app_user_sessions(last_activity_at DESC);
        
        CREATE INDEX IF NOT EXISTS idx_child_app_user_sessions_active 
        ON child_app_user_sessions(is_active) WHERE is_active = true;

        -- Enable RLS
        ALTER TABLE child_app_user_sessions ENABLE ROW LEVEL SECURITY;

        -- Grant permissions
        GRANT ALL ON child_app_user_sessions TO authenticated, service_role;
      `
    });

    if (error) {
      console.error('❌ Migration error:', error);
    } else {
      console.log('✅ Table created successfully via migration');
    }

    // Insert sample data
    console.log('📝 Inserting sample session data...');
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
      console.log('✅ Sample data inserted:', insertData);
    }

    // Test the table
    console.log('🧪 Testing table access...');
    const { data: testData, error: testError } = await supabase
      .from('child_app_user_sessions')
      .select('*')
      .limit(5);

    if (testError) {
      console.log('❌ Table access test failed:', testError.message);
    } else {
      console.log(`✅ Table access successful - found ${testData.length} records`);
      testData.forEach((record, index) => {
        console.log(`${index + 1}. User: ${record.user_id}, App: ${record.app_id}, Last Activity: ${record.last_activity_at}`);
      });
    }

  } catch (error) {
    console.error('❌ Manual table creation failed:', error);
  }
}

createAuthTableManually().then(() => {
  console.log('\n✅ Manual table creation completed');
  process.exit(0);
}).catch(err => {
  console.error('❌ Failed:', err);
  process.exit(1);
});
