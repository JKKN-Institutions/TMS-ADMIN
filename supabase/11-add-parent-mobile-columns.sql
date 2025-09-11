-- Add missing parent mobile number columns to students table
-- Run this migration in your Supabase SQL editor

-- Add father_mobile and mother_mobile columns if they don't exist
DO $$ 
BEGIN
    -- Father's mobile number
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'father_mobile') THEN
        ALTER TABLE students ADD COLUMN father_mobile VARCHAR(20);
        CREATE INDEX IF NOT EXISTS idx_students_father_mobile ON students(father_mobile);
    END IF;

    -- Mother's mobile number
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'mother_mobile') THEN
        ALTER TABLE students ADD COLUMN mother_mobile VARCHAR(20);
        CREATE INDEX IF NOT EXISTS idx_students_mother_mobile ON students(mother_mobile);
    END IF;

END $$;

-- Add helpful comments
COMMENT ON COLUMN students.father_mobile IS 'Father''s mobile number for emergency contact';
COMMENT ON COLUMN students.mother_mobile IS 'Mother''s mobile number for emergency contact';

-- Update emergency contacts for existing students where they are missing
-- This will automatically populate emergency_contact_name and emergency_contact_phone
-- based on father/mother information
UPDATE students 
SET 
    emergency_contact_name = COALESCE(father_name, mother_name),
    emergency_contact_phone = COALESCE(father_mobile, mother_mobile)
WHERE 
    (emergency_contact_name IS NULL OR emergency_contact_phone IS NULL)
    AND (father_name IS NOT NULL OR mother_name IS NOT NULL)
    AND (father_mobile IS NOT NULL OR mother_mobile IS NOT NULL);

-- Grant necessary permissions (adjust as needed for your RLS policies)
-- GRANT SELECT, INSERT, UPDATE ON students TO authenticated; 