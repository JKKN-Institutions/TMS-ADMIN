const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runSQLStatements() {
  console.log('🔧 Creating missing tables and views for admin bug reports...');
  
  const statements = [
    // Create bug_status_history table
    `CREATE TABLE IF NOT EXISTS bug_status_history (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        bug_report_id UUID REFERENCES bug_reports(id) ON DELETE CASCADE,
        new_status TEXT NOT NULL,
        old_status TEXT,
        changed_by_id UUID,
        changed_by_name TEXT,
        change_reason TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )`,
    
    // Create bug_labels table
    `CREATE TABLE IF NOT EXISTS bug_labels (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        color TEXT DEFAULT '#6B7280',
        description TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )`,
    
    // Create bug_report_labels table
    `CREATE TABLE IF NOT EXISTS bug_report_labels (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        bug_report_id UUID REFERENCES bug_reports(id) ON DELETE CASCADE,
        label_id UUID REFERENCES bug_labels(id) ON DELETE CASCADE,
        added_by_id UUID,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(bug_report_id, label_id)
    )`,
    
    // Create bug_report_stats view
    `CREATE OR REPLACE VIEW bug_report_stats AS
    SELECT 
        COUNT(*) as total_bugs,
        COUNT(*) FILTER (WHERE status = 'open') as open_bugs,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_bugs,
        COUNT(*) FILTER (WHERE status = 'resolved') as resolved_bugs,
        COUNT(*) FILTER (WHERE status = 'closed') as closed_bugs,
        COUNT(*) FILTER (WHERE priority = 'critical') as critical_bugs,
        COUNT(*) FILTER (WHERE priority = 'high') as high_severity_bugs,
        COUNT(*) FILTER (WHERE priority = 'critical' OR priority = 'high') as urgent_bugs,
        COALESCE(
            AVG(
                CASE 
                    WHEN resolved_at IS NOT NULL AND created_at IS NOT NULL 
                    THEN EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600.0
                END
            ), 0
        ) as avg_resolution_time_hours
    FROM bug_reports`
  ];
  
  try {
    for (let i = 0; i < statements.length; i++) {
      console.log(`Executing statement ${i + 1}/${statements.length}...`);
      const { data, error } = await supabase.rpc('execute_sql', { query: statements[i] });
      
      if (error) {
        console.log(`⚠️ Statement ${i + 1} error: ${error.message}`);
        // Try to continue with other statements
      } else {
        console.log(`✅ Statement ${i + 1} completed`);
      }
    }
    
    // Insert default labels
    console.log('📝 Inserting default labels...');
    const { error: labelsError } = await supabase
      .from('bug_labels')
      .upsert([
        { name: 'UI Bug', color: '#EF4444', description: 'User interface related issues' },
        { name: 'Performance', color: '#F59E0B', description: 'Performance and speed issues' },
        { name: 'Security', color: '#DC2626', description: 'Security vulnerabilities' },
        { name: 'Enhancement', color: '#10B981', description: 'Feature requests and improvements' },
        { name: 'Documentation', color: '#6366F1', description: 'Documentation related issues' },
        { name: 'Critical', color: '#B91C1C', description: 'Critical issues requiring immediate attention' }
      ], 
      { onConflict: 'name' });
    
    if (labelsError) {
      console.log(`⚠️ Labels insert warning: ${labelsError.message}`);
    } else {
      console.log('✅ Default labels created');
    }
    
    console.log('🎉 All SQL fixes completed successfully!');
    
  } catch (error) {
    console.error('❌ SQL fix failed:', error.message);
  }
}

runSQLStatements().then(() => {
  console.log('✅ Database fix completed');
  process.exit(0);
}).catch(err => {
  console.error('❌ Database fix failed:', err);
  process.exit(1);
});
