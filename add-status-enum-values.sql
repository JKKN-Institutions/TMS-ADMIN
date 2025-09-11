-- Add missing status enum values to support exact status display
-- Run this in your SQL editor to add the new enum values

ALTER TYPE grievance_status ADD VALUE IF NOT EXISTS 'pending_approval';
ALTER TYPE grievance_status ADD VALUE IF NOT EXISTS 'on_hold';  
ALTER TYPE grievance_status ADD VALUE IF NOT EXISTS 'under_review';

-- Verify the enum values
SELECT enumlabel as available_status_values 
FROM pg_enum 
WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'grievance_status')
ORDER BY enumsortorder; 