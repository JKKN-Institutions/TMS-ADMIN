import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jkknllpbefpgtgzntgoh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impra25sbHBiZWZwZ3Rnem50Z29oIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczMTkyNDY5MSwiZXhwIjoyMDQ3NTAwNjkxfQ.wXLYsJOCuxtqrR3HcGAHbQkY8CvQfHMVqNw-eK0j8dc';

const supabase = createClient(supabaseUrl, supabaseKey);

async function createCommunicationsTable() {
  console.log('🚀 Creating grievance_communications table...');
  
  try {
    // Create the table
    const { error: tableError } = await supabase.rpc('exec_sql', {
      sql: `
        -- Create grievance_communications table if it doesn't exist
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
      `
    });

    if (tableError) {
      console.error('❌ Error creating table:', tableError);
      return false;
    }

    console.log('✅ Table created successfully');

    // Create indexes
    const { error: indexError } = await supabase.rpc('exec_sql', {
      sql: `
        -- Create indexes for better performance
        CREATE INDEX IF NOT EXISTS idx_grievance_communications_grievance ON grievance_communications(grievance_id);
        CREATE INDEX IF NOT EXISTS idx_grievance_communications_sender ON grievance_communications(sender_type, sender_id);
        CREATE INDEX IF NOT EXISTS idx_grievance_communications_recipient ON grievance_communications(recipient_type, recipient_id);
        CREATE INDEX IF NOT EXISTS idx_grievance_communications_created ON grievance_communications(created_at);
        CREATE INDEX IF NOT EXISTS idx_grievance_communications_type ON grievance_communications(communication_type);
      `
    });

    if (indexError) {
      console.error('❌ Error creating indexes:', indexError);
    } else {
      console.log('✅ Indexes created successfully');
    }

    // Enable RLS and create policies
    const { error: rlsError } = await supabase.rpc('exec_sql', {
      sql: `
        -- Enable RLS
        ALTER TABLE grievance_communications ENABLE ROW LEVEL SECURITY;

        -- Create RLS policies
        DROP POLICY IF EXISTS "Students can view communications for their grievances" ON grievance_communications;
        DROP POLICY IF EXISTS "Students can insert communications for their grievances" ON grievance_communications;
        DROP POLICY IF EXISTS "Admins can manage all grievance communications" ON grievance_communications;

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
      `
    });

    if (rlsError) {
      console.error('❌ Error setting up RLS:', rlsError);
    } else {
      console.log('✅ RLS policies created successfully');
    }

    // Create triggers
    const { error: triggerError } = await supabase.rpc('exec_sql', {
      sql: `
        -- Create trigger for updated_at
        CREATE OR REPLACE FUNCTION update_grievance_communications_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = CURRENT_TIMESTAMP;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        DROP TRIGGER IF EXISTS trigger_update_grievance_communications_updated_at ON grievance_communications;
        CREATE TRIGGER trigger_update_grievance_communications_updated_at
            BEFORE UPDATE ON grievance_communications
            FOR EACH ROW
            EXECUTE FUNCTION update_grievance_communications_updated_at();

        -- Create trigger to log communication activity
        CREATE OR REPLACE FUNCTION log_communication_activity()
        RETURNS TRIGGER AS $$
        BEGIN
            -- Log the communication as an activity
            IF TG_OP = 'INSERT' THEN
                INSERT INTO grievance_activity_log (
                    grievance_id,
                    activity_type,
                    visibility,
                    actor_type,
                    actor_id,
                    actor_name,
                    action_description,
                    action_details,
                    is_milestone
                ) VALUES (
                    NEW.grievance_id,
                    CASE 
                        WHEN NEW.communication_type = 'comment' THEN 'comment_added'
                        WHEN NEW.communication_type = 'update' THEN 'admin_action_taken'
                        WHEN NEW.communication_type = 'notification' THEN 'notification_sent'
                        ELSE 'communication_added'
                    END,
                    CASE WHEN NEW.is_internal THEN 'private' ELSE 'public' END,
                    NEW.sender_type,
                    NEW.sender_id,
                    COALESCE(
                        (SELECT name FROM admin_users WHERE id = NEW.sender_id),
                        (SELECT student_name FROM students WHERE id = NEW.sender_id),
                        'System'
                    ),
                    CASE 
                        WHEN NEW.communication_type = 'comment' THEN 'Comment added to grievance'
                        WHEN NEW.communication_type = 'update' THEN 'Update sent to grievance'
                        WHEN NEW.communication_type = 'notification' THEN 'Notification sent'
                        ELSE 'Communication added'
                    END,
                    jsonb_build_object(
                        'communication_type', NEW.communication_type,
                        'is_internal', NEW.is_internal,
                        'message_preview', LEFT(NEW.message, 100)
                    ),
                    false
                );
            END IF;
            
            RETURN COALESCE(NEW, OLD);
        END;
        $$ LANGUAGE plpgsql;

        DROP TRIGGER IF EXISTS trigger_log_communication_activity ON grievance_communications;
        CREATE TRIGGER trigger_log_communication_activity
        AFTER INSERT ON grievance_communications
        FOR EACH ROW
        EXECUTE FUNCTION log_communication_activity();
      `
    });

    if (triggerError) {
      console.error('❌ Error creating triggers:', triggerError);
    } else {
      console.log('✅ Triggers created successfully');
    }

    // Verify table exists
    const { data: tableCheck, error: checkError } = await supabase
      .from('grievance_communications')
      .select('count(*)', { count: 'exact' });

    if (checkError) {
      console.error('❌ Error verifying table:', checkError);
      return false;
    }

    console.log('✅ Table verification successful');
    console.log('🎉 grievance_communications table setup complete!');
    return true;

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
      console.log('❌ Setup failed!');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  }); 