-- Migration 2: Add payment type support for term vs full-year payments
-- This migration adds the ability to handle both individual term payments and full-year payments

-- Add payment_type column to semester_payments
ALTER TABLE semester_payments ADD COLUMN IF NOT EXISTS payment_type text DEFAULT 'term';
ALTER TABLE semester_payments ADD CONSTRAINT payment_type_check 
CHECK (payment_type IN ('term', 'full_year'));

-- Add term coverage tracking for full-year payments
ALTER TABLE semester_payments ADD COLUMN IF NOT EXISTS covers_terms text[] DEFAULT ARRAY[]::text[];

-- Add full-year payment support to semester_fees
ALTER TABLE semester_fees ADD COLUMN IF NOT EXISTS is_full_year boolean DEFAULT false;
ALTER TABLE semester_fees ADD COLUMN IF NOT EXISTS full_year_discount_percent numeric DEFAULT 5.0;
ALTER TABLE semester_fees ADD CONSTRAINT full_year_discount_check 
CHECK (full_year_discount_percent >= 0 AND full_year_discount_percent <= 50);

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_semester_payments_payment_type ON semester_payments(payment_type);
CREATE INDEX IF NOT EXISTS idx_semester_payments_covers_terms ON semester_payments USING GIN(covers_terms);
CREATE INDEX IF NOT EXISTS idx_semester_fees_is_full_year ON semester_fees(is_full_year);

-- Add helpful comments
COMMENT ON COLUMN semester_payments.payment_type IS 'Type of payment: term (individual term) or full_year (covers all 3 terms with discount)';
COMMENT ON COLUMN semester_payments.covers_terms IS 'Array of terms covered by this payment (e.g., ["1","2","3"] for full year, ["1"] for term 1 only)';
COMMENT ON COLUMN semester_fees.is_full_year IS 'Whether this fee record represents a full-year package deal';
COMMENT ON COLUMN semester_fees.full_year_discount_percent IS 'Percentage discount applied for full-year payments (e.g., 5.0 for 5% discount)';

-- Update existing term payments to have proper covers_terms values
UPDATE semester_payments 
SET covers_terms = ARRAY[semester] 
WHERE payment_type = 'term' AND covers_terms = ARRAY[]::text[];

-- Log migration completion (optional - only if admin_settings table exists)
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'admin_settings') THEN
    INSERT INTO admin_settings (setting_type, settings_data, updated_by)
    VALUES ('migration_log', 
            json_build_object(
              'migration', '02-add-payment-type-support',
              'completed_at', now(),
              'description', 'Added payment type support for term vs full-year payments'
            )::jsonb,
            'system')
    ON CONFLICT (setting_type) DO UPDATE SET 
      settings_data = COALESCE(admin_settings.settings_data, '{}'::jsonb) || excluded.settings_data,
      updated_at = now();
    
    RAISE NOTICE 'Migration 02-add-payment-type-support completed successfully';
  ELSE
    RAISE NOTICE 'Migration 02-add-payment-type-support completed (admin_settings table not found)';
  END IF;
END $$; 