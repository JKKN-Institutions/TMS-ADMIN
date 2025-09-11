-- Migration 4: Add payment verification functions for booking eligibility
-- This migration adds functions to check if students have paid for specific dates/terms

-- Create function to check if student has paid for a specific date
CREATE OR REPLACE FUNCTION check_student_payment_for_date(
  student_uuid UUID,
  check_date DATE,
  route_uuid UUID DEFAULT NULL
) RETURNS TABLE(
  has_paid BOOLEAN,
  payment_type TEXT,
  term_number TEXT,
  payment_id UUID,
  valid_until DATE,
  receipt_color TEXT
) AS $$
DECLARE
  target_term TEXT;
  academic_yr TEXT;
BEGIN
  -- Determine which term the date falls into
  target_term := get_term_for_date(check_date);
  
  -- Determine academic year (June to May cycle)
  IF EXTRACT(MONTH FROM check_date) >= 6 THEN
    academic_yr := EXTRACT(YEAR FROM check_date)::TEXT || '-' || (EXTRACT(YEAR FROM check_date) + 1)::TEXT;
  ELSE
    academic_yr := (EXTRACT(YEAR FROM check_date) - 1)::TEXT || '-' || EXTRACT(YEAR FROM check_date)::TEXT;
  END IF;
  
  -- Check for full-year payment first
  RETURN QUERY
  SELECT 
    TRUE as has_paid,
    sp.payment_type,
    'full_year' as term_number,
    sp.id as payment_id,
    sp.valid_until,
    'green' as receipt_color
  FROM semester_payments sp
  WHERE sp.student_id = student_uuid
    AND sp.payment_type = 'full_year'
    AND sp.academic_year = academic_yr
    AND sp.payment_status = 'confirmed'
    AND check_date BETWEEN sp.valid_from AND sp.valid_until
    AND (route_uuid IS NULL OR sp.allocated_route_id = route_uuid)
    AND target_term = ANY(sp.covers_terms)
  LIMIT 1;
  
  -- If no full-year payment found, check for term-specific payment
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT 
      TRUE as has_paid,
      sp.payment_type,
      target_term as term_number,
      sp.id as payment_id,
      sp.valid_until,
      get_receipt_color(sp.payment_type, target_term) as receipt_color
    FROM semester_payments sp
    WHERE sp.student_id = student_uuid
      AND sp.semester = target_term
      AND sp.academic_year = academic_yr
      AND sp.payment_status = 'confirmed'
      AND check_date BETWEEN sp.valid_from AND sp.valid_until
      AND (route_uuid IS NULL OR sp.allocated_route_id = route_uuid)
    LIMIT 1;
  END IF;
  
  -- If no payment found, return false
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT 
      FALSE as has_paid,
      NULL::TEXT as payment_type,
      target_term as term_number,
      NULL::UUID as payment_id,
      NULL::DATE as valid_until,
      NULL::TEXT as receipt_color;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Create function to get fee structure for a route/stop combination
CREATE OR REPLACE FUNCTION get_fee_structure_for_route(
  route_uuid UUID,
  stop_name_param TEXT,
  academic_year_param TEXT
) RETURNS TABLE(
  term_1_fee NUMERIC,
  term_2_fee NUMERIC, 
  term_3_fee NUMERIC,
  full_year_fee NUMERIC,
  full_year_discount_percent NUMERIC,
  total_term_fees NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH term_fees AS (
    SELECT 
      CASE WHEN semester = '1' THEN semester_fee ELSE 0 END as t1_fee,
      CASE WHEN semester = '2' THEN semester_fee ELSE 0 END as t2_fee,
      CASE WHEN semester = '3' THEN semester_fee ELSE 0 END as t3_fee,
      full_year_discount_percent as discount_pct
    FROM semester_fees sf
    WHERE sf.allocated_route_id = route_uuid
      AND sf.stop_name = stop_name_param
      AND sf.academic_year = academic_year_param
      AND sf.is_active = true
  ),
  aggregated AS (
    SELECT 
      SUM(t1_fee) as term_1_fee,
      SUM(t2_fee) as term_2_fee,
      SUM(t3_fee) as term_3_fee,
      AVG(discount_pct) as avg_discount
    FROM term_fees
  )
  SELECT 
    a.term_1_fee,
    a.term_2_fee,
    a.term_3_fee,
    ROUND((a.term_1_fee + a.term_2_fee + a.term_3_fee) * (1 - a.avg_discount/100), 2) as full_year_fee,
    a.avg_discount as full_year_discount_percent,
    (a.term_1_fee + a.term_2_fee + a.term_3_fee) as total_term_fees
  FROM aggregated a;
END;
$$ LANGUAGE plpgsql;

-- Create function to check booking eligibility
CREATE OR REPLACE FUNCTION check_booking_eligibility(
  student_uuid UUID,
  booking_date DATE,
  route_uuid UUID
) RETURNS TABLE(
  can_book BOOLEAN,
  reason TEXT,
  payment_required BOOLEAN,
  required_term TEXT,
  fee_amount NUMERIC
) AS $$
DECLARE
  payment_check RECORD;
  fee_info RECORD;
  target_term TEXT;
  academic_yr TEXT;
BEGIN
  -- Get payment status for the date
  SELECT * INTO payment_check 
  FROM check_student_payment_for_date(student_uuid, booking_date, route_uuid);
  
  target_term := get_term_for_date(booking_date);
  
  -- If student has paid, they can book
  IF payment_check.has_paid THEN
    RETURN QUERY SELECT TRUE, 'Payment verified', FALSE, target_term, 0::NUMERIC;
    RETURN;
  END IF;
  
  -- Get fee information for this route
  IF EXTRACT(MONTH FROM booking_date) >= 6 THEN
    academic_yr := EXTRACT(YEAR FROM booking_date)::TEXT || '-' || (EXTRACT(YEAR FROM booking_date) + 1)::TEXT;
  ELSE
    academic_yr := (EXTRACT(YEAR FROM booking_date) - 1)::TEXT || '-' || EXTRACT(YEAR FROM booking_date)::TEXT;
  END IF;
  
  -- Get student's stop name
  SELECT sf.semester_fee INTO fee_info
  FROM semester_fees sf
  JOIN students s ON s.allocated_route_id = sf.allocated_route_id
  WHERE s.id = student_uuid
    AND sf.allocated_route_id = route_uuid
    AND sf.semester = target_term
    AND sf.academic_year = academic_yr
    AND sf.is_active = true
  LIMIT 1;
  
  -- Return booking not allowed with payment required
  RETURN QUERY SELECT 
    FALSE as can_book,
    'Fee payment required for Term ' || target_term as reason,
    TRUE as payment_required,
    target_term as required_term,
    COALESCE(fee_info.semester_fee, 0) as fee_amount;
END;
$$ LANGUAGE plpgsql;

-- Add helpful comments
COMMENT ON FUNCTION check_student_payment_for_date IS 'Checks if student has paid for transport on a specific date, considering both term and full-year payments';
COMMENT ON FUNCTION get_fee_structure_for_route IS 'Returns complete fee structure (all terms + full year) for a route/stop combination';
COMMENT ON FUNCTION check_booking_eligibility IS 'Determines if student can book transport for a date, returns payment requirements if needed';

-- Log migration completion (optional - only if admin_settings table exists)
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'admin_settings') THEN
    INSERT INTO admin_settings (setting_type, settings_data, updated_by)
    VALUES ('migration_log', 
            json_build_object(
              'migration', '04-add-payment-verification-functions',
              'completed_at', now(),
              'description', 'Added payment verification functions for booking eligibility'
            )::jsonb,
            'system')
    ON CONFLICT (setting_type) DO UPDATE SET 
      settings_data = COALESCE(admin_settings.settings_data, '{}'::jsonb) || excluded.settings_data,
      updated_at = now();
    
    RAISE NOTICE 'Migration 04-add-payment-verification-functions completed successfully';
  ELSE
    RAISE NOTICE 'Migration 04-add-payment-verification-functions completed (admin_settings table not found)';
  END IF;
END $$; 