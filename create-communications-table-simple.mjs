import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jkknllpbefpgtgzntgoh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impra25sbHBiZWZwZ3Rnem50Z29oIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczMTkyNDY5MSwiZXhwIjoyMDQ3NTAwNjkxfQ.wXLYsJOCuxtqrR3HcGAHbQkY8CvQfHMVqNw-eK0j8dc';

const supabase = createClient(supabaseUrl, supabaseKey);

async function createCommunicationsTable() {
  console.log('🚀 Creating grievance_communications table...');
  
  try {
    // First, check if the table exists
    const { data: existing, error: checkError } = await supabase
      .from('grievance_communications')
      .select('count(*)', { count: 'exact' })
      .limit(1);

    if (!checkError) {
      console.log('✅ Table already exists!');
      return true;
    }

    console.log('Table does not exist, creating...');

    // Try to create a simple test entry to see if we can use the table
    const { data: testData, error: testError } = await supabase
      .from('grievance_communications')
      .insert({
        grievance_id: '00000000-0000-0000-0000-000000000000', // dummy ID for test
        sender_type: 'system',
        recipient_type: 'admin',
        message: 'Test message',
        communication_type: 'comment'
      })
      .select();

    if (testError) {
      console.error('❌ Table does not exist and cannot be created via client:', testError.message);
      console.log('📝 Please run this SQL directly in your Supabase dashboard:');
      console.log(`
-- Create grievance_communications table
CREATE TABLE IF NOT EXISTS grievance_communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grievance_id UUID NOT NULL REFERENCES grievances(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('student', 'admin', 'system')),
  sender_id UUID NULL,
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('student', 'admin', 'system')),
  recipient_id UUID NULL,
  message TEXT NOT NULL,
  communication_type TEXT NOT NULL DEFAULT 'comment' CHECK (communication_type IN ('comment', 'update', 'status_change', 'assignment', 'resolution', 'escalation', 'notification')),
  is_internal BOOLEAN NOT NULL DEFAULT false,
  attachments JSONB DEFAULT '[]'::jsonb,
  read_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_grievance_communications_grievance ON grievance_communications(grievance_id);
CREATE INDEX IF NOT EXISTS idx_grievance_communications_sender ON grievance_communications(sender_type, sender_id);
CREATE INDEX IF NOT EXISTS idx_grievance_communications_recipient ON grievance_communications(recipient_type, recipient_id);
CREATE INDEX IF NOT EXISTS idx_grievance_communications_created ON grievance_communications(created_at);
CREATE INDEX IF NOT EXISTS idx_grievance_communications_type ON grievance_communications(communication_type);

-- Enable RLS
ALTER TABLE grievance_communications ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Students can view communications for their grievances" 
ON grievance_communications FOR SELECT
USING (
  sender_type = 'student' 
  OR (
    recipient_type = 'student' 
    AND is_internal = false
    AND EXISTS (
      SELECT 1 FROM grievances 
      WHERE grievances.id = grievance_communications.grievance_id 
      AND grievances.student_id = auth.uid()
    )
  )
);

CREATE POLICY "Students can insert communications for their grievances" 
ON grievance_communications FOR INSERT
WITH CHECK (
  sender_type = 'student' 
  AND sender_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM grievances 
    WHERE grievances.id = grievance_communications.grievance_id 
    AND grievances.student_id = auth.uid()
  )
);

CREATE POLICY "Admins can manage all grievance communications" 
ON grievance_communications FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM admin_users 
    WHERE admin_users.id = auth.uid()
  )
);

-- Grant permissions
GRANT ALL ON grievance_communications TO authenticated;
      `);
      return false;
    } else {
      // Clean up the test entry
      if (testData && testData[0]) {
        await supabase
          .from('grievance_communications')
          .delete()
          .eq('id', testData[0].id);
      }
      console.log('✅ Table exists and is working!');
      return true;
    }

  } catch (error) {
    console.error('❌ Error in setup:', error);
    return false;
  }
}

// Run the setup
createCommunicationsTable()
  .then(success => {
    if (success) {
      console.log('🎉 Setup completed successfully!');
      process.exit(0);
    } else {
      console.log('❌ Please create the table manually using the SQL above!');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  }); 