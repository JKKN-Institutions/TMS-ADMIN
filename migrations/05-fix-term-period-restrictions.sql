-- Migration 5: Fix term period restrictions
-- Only restrict users when term period is completely over, not during active terms

-- Enhanced function to check if student has valid payment considering current term periods
CREATE OR REPLACE FUNCTION check_student_payment_with_term_grace(
  student_uuid UUID,
  check_date DATE,
  route_uuid UUID DEFAULT NULL
) RETURNS TABLE(
  has_paid BOOLEAN,
  payment_type TEXT,
  term_number TEXT,
  payment_id UUID,
  valid_until DATE,
  receipt_color TEXT,
  is_current_term BOOLEAN
) AS $$
DECLARE
  target_term TEXT;
  current_term TEXT;
  academic_yr TEXT;
  grace_days INTEGER := 7; -- Grace period after term ends
BEGIN
  -- Determine which term the date falls into
  target_term := get_term_for_date(check_date);
  current_term := get_term_for_date(CURRENT_DATE);
  
  -- Determine academic year (June to May cycle)
  IF EXTRACT(MONTH FROM check_date) >= 6 THEN
    academic_yr := EXTRACT(YEAR FROM check_date)::TEXT || '-' || (EXTRACT(YEAR FROM check_date) + 1)::TEXT;
  ELSE
    academic_yr := (EXTRACT(YEAR FROM check_date) - 1)::TEXT || '-' || EXTRACT(YEAR FROM check_date)::TEXT;
  END IF;
  
  -- Check for full-year payment first (always valid within academic year)
  RETURN QUERY
  SELECT 
    TRUE as has_paid,
    sp.payment_type,
    'full_year' as term_number,
    sp.id as payment_id,
    sp.valid_until,
    'green' as receipt_color,
    TRUE as is_current_term
  FROM semester_payments sp
  WHERE sp.student_id = student_uuid
    AND sp.payment_type = 'full_year'
    AND sp.academic_year = academic_yr
    AND sp.payment_status IN ('confirmed', 'pending')
    AND (route_uuid IS NULL OR sp.allocated_route_id = route_uuid)
    AND target_term = ANY(sp.covers_terms)
  LIMIT 1;
  
  -- If full-year payment found, exit
  IF FOUND THEN
    RETURN;
  END IF;
  
  -- Check for term-specific payment with enhanced logic
  RETURN QUERY
  SELECT 
    TRUE as has_paid,
    sp.payment_type,
    target_term as term_number,
    sp.id as payment_id,
    sp.valid_until,
    get_receipt_color(sp.payment_type, target_term) as receipt_color,
    (target_term = current_term) as is_current_term
  FROM semester_payments sp
  WHERE sp.student_id = student_uuid
    AND sp.semester = target_term
    AND sp.academic_year = academic_yr
    AND sp.payment_status IN ('confirmed', 'pending')
    AND (route_uuid IS NULL OR sp.allocated_route_id = route_uuid)
    AND (
      -- Allow if currently in the same term (no restriction during active term)
      target_term = current_term OR
      -- Allow with grace period after term ends
      check_date <= (sp.valid_until + INTERVAL '1 day' * grace_days)
    )
  LIMIT 1;
  
  -- If no payment found, return false but indicate if it's current term
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT 
      FALSE as has_paid,
      NULL::TEXT as payment_type,
      target_term as term_number,
      NULL::UUID as payment_id,
      NULL::DATE as valid_until,
      NULL::TEXT as receipt_color,
      (target_term = current_term) as is_current_term;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Enhanced booking eligibility function that respects term periods
CREATE OR REPLACE FUNCTION check_booking_eligibility_with_term_grace(
  student_uuid UUID,
  booking_date DATE,
  route_uuid UUID
) RETURNS TABLE(
  can_book BOOLEAN,
  reason TEXT,
  payment_required BOOLEAN,
  required_term TEXT,
  fee_amount NUMERIC,
  is_current_term BOOLEAN
) AS $$
DECLARE
  payment_check RECORD;
  fee_info RECORD;
  target_term TEXT;
  current_term TEXT;
  academic_yr TEXT;
BEGIN
  -- Get payment status for the date with term grace
  SELECT * INTO payment_check 
  FROM check_student_payment_with_term_grace(student_uuid, booking_date, route_uuid);
  
  target_term := get_term_for_date(booking_date);
  current_term := get_term_for_date(CURRENT_DATE);
  
  -- If student has paid, they can book
  IF payment_check.has_paid THEN
    RETURN QUERY SELECT 
      TRUE, 
      'Payment verified', 
      FALSE, 
      target_term, 
      0::NUMERIC,
      payment_check.is_current_term;
    RETURN;
  END IF;
  
  -- Special case: If booking for current term but no payment, require payment
  -- But if booking for future terms, be more lenient
  IF target_term = current_term THEN
    -- Get fee information for current term
    IF EXTRACT(MONTH FROM booking_date) >= 6 THEN
      academic_yr := EXTRACT(YEAR FROM booking_date)::TEXT || '-' || (EXTRACT(YEAR FROM booking_date) + 1)::TEXT;
    ELSE
      academic_yr := (EXTRACT(YEAR FROM booking_date) - 1)::TEXT || '-' || EXTRACT(YEAR FROM booking_date)::TEXT;
    END IF;
    
    -- Get student's stop name and fee
    SELECT sf.semester_fee INTO fee_info
    FROM semester_fees sf
    JOIN students s ON s.allocated_route_id = sf.allocated_route_id
    WHERE s.id = student_uuid
      AND sf.allocated_route_id = route_uuid
      AND sf.semester = target_term
      AND sf.academic_year = academic_yr
      AND sf.is_active = true
    LIMIT 1;
    
    -- Return booking not allowed with payment required for current term
    RETURN QUERY SELECT 
      FALSE as can_book,
      'Fee payment required for current Term ' || target_term as reason,
      TRUE as payment_required,
      target_term as required_term,
      COALESCE(fee_info.semester_fee, 0) as fee_amount,
      TRUE as is_current_term;
  ELSE
    -- For future terms, allow booking but warn about payment
    RETURN QUERY SELECT 
      TRUE as can_book,
      'Booking allowed for future term, payment may be required closer to the date' as reason,
      FALSE as payment_required,
      target_term as required_term,
      0::NUMERIC as fee_amount,
      FALSE as is_current_term;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Add helpful comments
COMMENT ON FUNCTION check_student_payment_with_term_grace IS 'Enhanced payment check that considers current term periods and grace periods';
COMMENT ON FUNCTION check_booking_eligibility_with_term_grace IS 'Enhanced booking eligibility that only restricts during current term, not future terms';

-- Create index for better performance on term-based queries
CREATE INDEX IF NOT EXISTS idx_semester_payments_covers_terms ON semester_payments USING GIN(covers_terms);
CREATE INDEX IF NOT EXISTS idx_semester_payments_academic_year_semester ON semester_payments(academic_year, semester);
CREATE INDEX IF NOT EXISTS idx_semester_payments_status_valid_until ON semester_payments(payment_status, valid_until); 