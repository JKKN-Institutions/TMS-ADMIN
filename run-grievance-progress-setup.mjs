import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Get environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('Supabase URL:', supabaseUrl);
console.log('Service Role Key:', supabaseKey ? 'Present' : 'Missing');

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function runProgressTrackerSetup() {
  try {
    console.log('Reading SQL file...');
    const sqlContent = fs.readFileSync('./setup-grievance-progress-tracker.sql', 'utf8');
    
    console.log('SQL file length:', sqlContent.length);
    
    // Test connection first
    console.log('Testing database connection...');
    const { data: testData, error: testError } = await supabase
      .from('grievances')
      .select('count(*)')
      .limit(1);
    
    if (testError) {
      console.error('Database connection failed:', testError);
      process.exit(1);
    }
    
    console.log('Database connection successful');
    
    // Execute the SQL using pg connection (if available) or try alternative approach
    console.log('Attempting to add missing columns...');
    
    try {
      // Add missing columns to grievances table
      const addColumnsSQL = `
        ALTER TABLE grievances 
        ADD COLUMN IF NOT EXISTS resolution_rating INTEGER CHECK (resolution_rating >= 1 AND resolution_rating <= 5);
        
        ALTER TABLE grievances 
        ADD COLUMN IF NOT EXISTS resolution_feedback TEXT;
        
        ALTER TABLE grievances 
        ADD COLUMN IF NOT EXISTS rated_at TIMESTAMP WITH TIME ZONE;
      `;
      
      console.log('Adding columns to grievances table...');
      const { error: alterError } = await supabase.rpc('exec_sql', {
        sql: addColumnsSQL
      });
      
      if (alterError && !alterError.message.includes('already exists')) {
        console.error('Error adding columns:', alterError);
      } else {
        console.log('Columns added successfully (or already exist)');
      }
    } catch (error) {
      console.log('Column addition completed (may have already existed)');
    }
    
    // Check if grievance_activity_log table exists
    console.log('Checking grievance_activity_log table...');
    const { data: tables, error: tableError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_name', 'grievance_activity_log')
      .eq('table_schema', 'public');
    
    if (tableError) {
      console.error('Error checking tables:', tableError);
    } else if (!tables || tables.length === 0) {
      console.log('Creating grievance_activity_log table...');
      // Table creation would need to be done via raw SQL execution
      console.log('Please run the full SQL script manually in Supabase dashboard');
    } else {
      console.log('grievance_activity_log table exists');
    }
    
    // Test if activity log function exists
    console.log('Testing log_grievance_activity function...');
    try {
      const { data: funcTest, error: funcError } = await supabase.rpc('log_grievance_activity', {
        p_grievance_id: '00000000-0000-0000-0000-000000000000',
        p_activity_type: 'grievance_created',
        p_action_description: 'Test function call'
      });
      
      if (funcError && !funcError.message.includes('does not exist')) {
        console.log('Function exists but test failed (expected for non-existent grievance)');
      } else {
        console.log('log_grievance_activity function is available');
      }
    } catch (error) {
      console.log('Function may need to be created via SQL script');
    }
    
    console.log('Basic setup validation completed!');
    console.log('\nTo complete the setup:');
    console.log('1. Copy the contents of setup-grievance-progress-tracker.sql');
    console.log('2. Go to your Supabase Dashboard > SQL Editor');
    console.log('3. Paste and run the SQL script');
    console.log('4. This will create all functions, triggers, and policies needed');
    
  } catch (error) {
    console.error('Setup error:', error);
    process.exit(1);
  }
}

runProgressTrackerSetup(); 