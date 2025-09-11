-- Add aadhar_number column to drivers table
-- Migration: Add Aadhar Number field to Drivers
ALTER TABLE drivers
ADD COLUMN aadhar_number VARCHAR(12) UNIQUE;
-- Add comment to document the column
COMMENT ON COLUMN drivers.aadhar_number IS 'Driver Aadhar card number (12 digits)';
-- Create index on aadhar_number for faster lookups
CREATE INDEX idx_drivers_aadhar_number ON drivers(aadhar_number);