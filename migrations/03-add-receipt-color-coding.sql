-- Migration 3: Add receipt color coding system
-- This migration adds color coding to receipts based on payment type and term

-- Add receipt color column to payment_receipts
ALTER TABLE payment_receipts ADD COLUMN IF NOT EXISTS receipt_color text;
ALTER TABLE payment_receipts ADD CONSTRAINT receipt_color_check 
CHECK (receipt_color IN ('white', 'blue', 'yellow', 'green'));

-- Add payment type to receipts for easier tracking
ALTER TABLE payment_receipts ADD COLUMN IF NOT EXISTS payment_type text DEFAULT 'term';
ALTER TABLE payment_receipts ADD CONSTRAINT receipt_payment_type_check 
CHECK (payment_type IN ('term', 'full_year'));

-- Add term coverage info to receipts
ALTER TABLE payment_receipts ADD COLUMN IF NOT EXISTS covers_terms text[] DEFAULT ARRAY[]::text[];

-- Create function to determine receipt color based on payment
CREATE OR REPLACE FUNCTION get_receipt_color(
  p_payment_type text,
  p_semester text,
  p_covers_terms text[] DEFAULT ARRAY[]::text[]
) RETURNS text AS $$
BEGIN
  -- Full year payments get green color
  IF p_payment_type = 'full_year' THEN
    RETURN 'green';
  END IF;
  
  -- Individual term payments get color based on term
  CASE p_semester
    WHEN '1' THEN RETURN 'white';   -- Term 1: June-September
    WHEN '2' THEN RETURN 'blue';    -- Term 2: October-January
    WHEN '3' THEN RETURN 'yellow';  -- Term 3: February-May
    ELSE RETURN 'white'; -- Default fallback
  END CASE;
END;
$$ LANGUAGE plpgsql;

-- Create function to determine which term a date falls into
CREATE OR REPLACE FUNCTION get_term_for_date(check_date date) RETURNS text AS $$
DECLARE
  month_num integer;
BEGIN
  month_num := EXTRACT(MONTH FROM check_date);
  
  -- Term 1: June(6) - September(9)
  IF month_num >= 6 AND month_num <= 9 THEN
    RETURN '1';
  -- Term 2: October(10) - January(1)  
  ELSIF month_num >= 10 OR month_num <= 1 THEN
    RETURN '2';
  -- Term 3: February(2) - May(5)
  ELSE
    RETURN '3';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Update existing receipts with appropriate colors
UPDATE payment_receipts 
SET receipt_color = get_receipt_color('term', semester),
    payment_type = 'term',
    covers_terms = ARRAY[semester]
WHERE receipt_color IS NULL;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_payment_receipts_color ON payment_receipts(receipt_color);
CREATE INDEX IF NOT EXISTS idx_payment_receipts_payment_type ON payment_receipts(payment_type);

-- Add helpful comments
COMMENT ON COLUMN payment_receipts.receipt_color IS 'Color coding: white=term1, blue=term2, yellow=term3, green=full_year';
COMMENT ON COLUMN payment_receipts.payment_type IS 'Type of payment this receipt represents';
COMMENT ON COLUMN payment_receipts.covers_terms IS 'Array of terms this receipt covers';
COMMENT ON FUNCTION get_receipt_color IS 'Determines receipt color based on payment type and term';
COMMENT ON FUNCTION get_term_for_date IS 'Returns which term (1,2,3) a given date falls into';

-- Log migration completion (optional - only if admin_settings table exists)
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'admin_settings') THEN
    INSERT INTO admin_settings (setting_type, settings_data, updated_by)
    VALUES ('migration_log', 
            json_build_object(
              'migration', '03-add-receipt-color-coding',
              'completed_at', now(),
              'description', 'Added receipt color coding system'
            )::jsonb,
            'system')
    ON CONFLICT (setting_type) DO UPDATE SET 
      settings_data = COALESCE(admin_settings.settings_data, '{}'::jsonb) || excluded.settings_data,
      updated_at = now();
    
    RAISE NOTICE 'Migration 03-add-receipt-color-coding completed successfully';
  ELSE
    RAISE NOTICE 'Migration 03-add-receipt-color-coding completed (admin_settings table not found)';
  END IF;
END $$; 