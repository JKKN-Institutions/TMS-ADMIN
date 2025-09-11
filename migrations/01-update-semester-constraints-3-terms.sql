-- Migration 1: Update semester constraints to support 3 terms
-- This migration updates the existing 2-semester system to support 3 terms

-- Update semester_fees table constraints
ALTER TABLE semester_fees DROP CONSTRAINT IF EXISTS semester_fees_semester_check;
ALTER TABLE semester_fees ADD CONSTRAINT semester_fees_semester_check 
CHECK (semester = ANY (ARRAY['1'::text, '2'::text, '3'::text]));

-- Update semester_payments table constraints  
ALTER TABLE semester_payments DROP CONSTRAINT IF EXISTS semester_payments_semester_check;
ALTER TABLE semester_payments ADD CONSTRAINT semester_payments_semester_check 
CHECK (semester = ANY (ARRAY['1'::text, '2'::text, '3'::text]));

-- Add comment for clarity
COMMENT ON CONSTRAINT semester_fees_semester_check ON semester_fees IS 'Updated to support 3 terms: 1 (Jun-Sep), 2 (Oct-Jan), 3 (Feb-May)';
COMMENT ON CONSTRAINT semester_payments_semester_check ON semester_payments IS 'Updated to support 3 terms: 1 (Jun-Sep), 2 (Oct-Jan), 3 (Feb-May)';

-- Log migration completion (optional - only if admin_settings table exists)
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'admin_settings') THEN
    INSERT INTO admin_settings (setting_type, settings_data, updated_by)
    VALUES ('migration_log', 
            json_build_object(
              'migration', '01-update-semester-constraints-3-terms',
              'completed_at', now(),
              'description', 'Updated semester constraints to support 3 terms'
            )::jsonb,
            'system')
    ON CONFLICT (setting_type) DO UPDATE SET 
      settings_data = COALESCE(admin_settings.settings_data, '{}'::jsonb) || excluded.settings_data,
      updated_at = now();
    
    RAISE NOTICE 'Migration 01-update-semester-constraints-3-terms completed successfully';
  ELSE
    RAISE NOTICE 'Migration 01-update-semester-constraints-3-terms completed (admin_settings table not found)';
  END IF;
END $$; 