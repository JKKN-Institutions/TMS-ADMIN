-- Simple migration to add missing parent mobile columns
-- Run this in your Supabase SQL editor

-- Add father_mobile column
ALTER TABLE students ADD COLUMN IF NOT EXISTS father_mobile VARCHAR(20);

-- Add mother_mobile column  
ALTER TABLE students ADD COLUMN IF NOT EXISTS mother_mobile VARCHAR(20);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_students_father_mobile ON students(father_mobile);
CREATE INDEX IF NOT EXISTS idx_students_mother_mobile ON students(mother_mobile);

-- Add comments
COMMENT ON COLUMN students.father_mobile IS 'Father''s mobile number for emergency contact';
COMMENT ON COLUMN students.mother_mobile IS 'Mother''s mobile number for emergency contact'; 