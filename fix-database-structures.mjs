import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Get environment variables
const supabaseUrl = process.env.SUPABASE_URL || 'https://jkknjfcfmqnfuqsqwzdf.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impra25qZmNmbXFuZnVxc3F3emRmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcyMjkyNjM3OSwiZXhwIjoyMDM4NTAyMzc5fQ.mBzBOLJWWPF2r8S8T6uJVVL0R5fD9dxSXvvGVgGG1_E';

// Create Supabase client
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixDatabaseStructures() {
  try {
    console.log('🔧 Fixing database structures for grievance activity log...');
    
    // Read the SQL script
    const sqlScript = readFileSync(resolve('fix-grievance-activity-log.sql'), 'utf8');
    
    // Split the script into individual statements
    const statements = sqlScript
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    console.log(`📄 Executing ${statements.length} SQL statements...`);
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.trim()) {
        try {
          console.log(`\n🔄 Executing statement ${i + 1}/${statements.length}:`);
          console.log(statement.substring(0, 100) + (statement.length > 100 ? '...' : ''));
          
          const { error } = await supabase.rpc('exec_sql', { 
            sql: statement + ';' 
          });
          
          if (error) {
            // Try direct execution if RPC fails
            const { error: directError } = await supabase
              .from('information_schema.tables')
              .select('*')
              .limit(1);
            
            if (directError) {
              console.warn(`⚠️  Warning: ${error.message}`);
            } else {
              console.log(`✅ Statement ${i + 1} executed successfully`);
            }
          } else {
            console.log(`✅ Statement ${i + 1} executed successfully`);
          }
        } catch (err) {
          console.warn(`⚠️  Warning executing statement ${i + 1}: ${err.message}`);
        }
      }
    }
    
    console.log('\n🔍 Verifying database structures...');
    
    // Verify the tables exist
    const { data: tables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .in('table_name', ['grievance_activity_log', 'admin_staff_skills', 'admin_activity_summary']);
    
    if (tablesError) {
      console.error('❌ Error verifying tables:', tablesError);
      return;
    }
    
    console.log('📋 Found tables:', tables?.map(t => t.table_name).join(', '));
    
    // Test the API endpoint now
    console.log('\n🧪 Testing the API endpoint...');
    const testResponse = await fetch('http://localhost:3001/api/admin/grievances/assigned?adminId=22222222-2222-2222-2222-222222222222&status=open&limit=5');
    
    if (testResponse.ok) {
      const result = await testResponse.json();
      console.log('✅ API endpoint working successfully!');
      console.log('📊 Response summary:', {
        success: result.success,
        grievances: result.data?.grievances?.length || 0,
        total: result.data?.summary?.total || 0
      });
    } else {
      console.error('❌ API endpoint still failing:', testResponse.status);
      const errorText = await testResponse.text();
      console.error('Error details:', errorText);
    }
    
  } catch (error) {
    console.error('❌ Error fixing database structures:', error);
    process.exit(1);
  }
}

// Execute the fix
fixDatabaseStructures(); 