-- =====================================================
-- Semester-based Payment System
-- Students pay once per semester (6 months) for transport
-- Admin sets fees manually for each stop in each route
-- =====================================================

-- Create semester_fees table for admin to set fees per route and stop
CREATE TABLE IF NOT EXISTS semester_fees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  stop_name TEXT NOT NULL,
  semester_fee DECIMAL(10, 2) NOT NULL CHECK (semester_fee > 0),
  academic_year TEXT NOT NULL, -- e.g., "2024-25"
  semester TEXT NOT NULL CHECK (semester IN ('1', '2')), -- 1st or 2nd semester
  effective_from DATE NOT NULL,
  effective_until DATE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES admin_users(id),
  
  -- Ensure unique fee per route-stop-semester combination
  UNIQUE(route_id, stop_name, academic_year, semester)
);

-- Create semester_payments table to track student payments
CREATE TABLE IF NOT EXISTS semester_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  stop_name TEXT NOT NULL,
  academic_year TEXT NOT NULL,
  semester TEXT NOT NULL CHECK (semester IN ('1', '2')),
  semester_fee_id UUID NOT NULL REFERENCES semester_fees(id),
  
  -- Payment details
  amount_paid DECIMAL(10, 2) NOT NULL CHECK (amount_paid > 0),
  payment_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'upi', 'card', 'net_banking', 'cheque', 'dd')),
  transaction_id TEXT,
  receipt_number TEXT UNIQUE,
  
  -- Payment status
  payment_status TEXT DEFAULT 'confirmed' CHECK (payment_status IN ('pending', 'confirmed', 'refunded', 'cancelled')),
  
  -- Validity period
  valid_from DATE NOT NULL,
  valid_until DATE NOT NULL,
  
  -- Additional fields
  late_fee DECIMAL(10, 2) DEFAULT 0,
  discount_amount DECIMAL(10, 2) DEFAULT 0,
  discount_reason TEXT,
  remarks TEXT,
  
  -- Audit fields
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_by UUID REFERENCES admin_users(id),
  
  -- Ensure student can only pay once per semester
  UNIQUE(student_id, route_id, stop_name, academic_year, semester)
);

-- Create payment_receipts table for detailed receipt management
CREATE TABLE IF NOT EXISTS payment_receipts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  semester_payment_id UUID NOT NULL REFERENCES semester_payments(id) ON DELETE CASCADE,
  receipt_number TEXT NOT NULL UNIQUE,
  receipt_date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- Student and route details (denormalized for receipt)
  student_name TEXT NOT NULL,
  student_roll_number TEXT NOT NULL,
  student_email TEXT NOT NULL,
  route_name TEXT NOT NULL,
  route_number TEXT NOT NULL,
  stop_name TEXT NOT NULL,
  
  -- Payment details
  semester_fee DECIMAL(10, 2) NOT NULL,
  late_fee DECIMAL(10, 2) DEFAULT 0,
  discount_amount DECIMAL(10, 2) DEFAULT 0,
  total_amount DECIMAL(10, 2) NOT NULL,
  
  -- Academic details
  academic_year TEXT NOT NULL,
  semester TEXT NOT NULL,
  valid_from DATE NOT NULL,
  valid_until DATE NOT NULL,
  
  -- Receipt metadata
  issued_by UUID REFERENCES admin_users(id),
  issued_by_name TEXT NOT NULL,
  is_duplicate BOOLEAN DEFAULT false,
  original_receipt_id UUID REFERENCES payment_receipts(id),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_semester_fees_route_semester ON semester_fees(route_id, academic_year, semester);
CREATE INDEX IF NOT EXISTS idx_semester_fees_active ON semester_fees(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_semester_payments_student ON semester_payments(student_id);
CREATE INDEX IF NOT EXISTS idx_semester_payments_route_semester ON semester_payments(route_id, academic_year, semester);
CREATE INDEX IF NOT EXISTS idx_semester_payments_status ON semester_payments(payment_status);
CREATE INDEX IF NOT EXISTS idx_semester_payments_validity ON semester_payments(valid_from, valid_until);
CREATE INDEX IF NOT EXISTS idx_payment_receipts_number ON payment_receipts(receipt_number);
CREATE INDEX IF NOT EXISTS idx_payment_receipts_student ON payment_receipts(student_roll_number);

-- Create triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_semester_fees_updated_at 
    BEFORE UPDATE ON semester_fees 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_semester_payments_updated_at 
    BEFORE UPDATE ON semester_payments 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function to generate receipt numbers
CREATE OR REPLACE FUNCTION generate_receipt_number()
RETURNS TEXT AS $$
DECLARE
    receipt_num TEXT;
    year_month TEXT;
    sequence_num INTEGER;
BEGIN
    -- Format: RCP-YYYYMM-NNNN
    year_month := TO_CHAR(NOW(), 'YYYYMM');
    
    -- Get next sequence number for this month
    SELECT COALESCE(
        MAX(CAST(SUBSTRING(receipt_number FROM '\d{4}$') AS INTEGER)), 0
    ) + 1 
    INTO sequence_num
    FROM payment_receipts 
    WHERE receipt_number ~ ('^RCP-' || year_month || '-\d{4}$');
    
    receipt_num := 'RCP-' || year_month || '-' || LPAD(sequence_num::TEXT, 4, '0');
    
    RETURN receipt_num;
END;
$$ LANGUAGE plpgsql;

-- Create function to check if student has valid semester payment
CREATE OR REPLACE FUNCTION has_valid_semester_payment(
    p_student_id UUID,
    p_route_id UUID,
    p_stop_name TEXT,
    p_date DATE DEFAULT CURRENT_DATE
) RETURNS BOOLEAN AS $$
DECLARE
    payment_exists BOOLEAN := FALSE;
BEGIN
    SELECT EXISTS(
        SELECT 1 
        FROM semester_payments sp
        WHERE sp.student_id = p_student_id
        AND sp.route_id = p_route_id
        AND sp.stop_name = p_stop_name
        AND sp.payment_status = 'confirmed'
        AND p_date BETWEEN sp.valid_from AND sp.valid_until
    ) INTO payment_exists;
    
    RETURN payment_exists;
END;
$$ LANGUAGE plpgsql;

-- Create function to get current semester info
CREATE OR REPLACE FUNCTION get_current_semester()
RETURNS TABLE(academic_year TEXT, semester TEXT, start_date DATE, end_date DATE) AS $$
DECLARE
    current_month INTEGER;
    current_year INTEGER;
    academic_start_year INTEGER;
    semester_num TEXT;
    start_dt DATE;
    end_dt DATE;
    academic_yr TEXT;
BEGIN
    current_month := EXTRACT(MONTH FROM CURRENT_DATE);
    current_year := EXTRACT(YEAR FROM CURRENT_DATE);
    
    -- Academic year typically runs from June to May
    -- First semester: June to November
    -- Second semester: December to May
    
    IF current_month >= 6 THEN
        -- First semester (June-November)
        academic_start_year := current_year;
        semester_num := '1';
        start_dt := DATE(current_year || '-06-01');
        end_dt := DATE(current_year || '-11-30');
    ELSE
        -- Second semester (December-May)
        academic_start_year := current_year - 1;
        semester_num := '2';
        start_dt := DATE((current_year - 1) || '-12-01');
        end_dt := DATE(current_year || '-05-31');
    END IF;
    
    academic_yr := academic_start_year || '-' || RIGHT((academic_start_year + 1)::TEXT, 2);
    
    RETURN QUERY SELECT academic_yr, semester_num, start_dt, end_dt;
END;
$$ LANGUAGE plpgsql;

-- Create view for easy payment status checking
CREATE OR REPLACE VIEW student_payment_status AS
SELECT 
    s.id as student_id,
    s.full_name as student_name,
    s.roll_number,
    s.email,
    r.id as route_id,
    r.route_name,
    r.route_number,
    sp.stop_name,
    sp.academic_year,
    sp.semester,
    sp.amount_paid,
    sp.payment_date,
    sp.payment_status,
    sp.valid_from,
    sp.valid_until,
    sp.receipt_number,
    CASE 
        WHEN sp.id IS NULL THEN 'Not Paid'
        WHEN CURRENT_DATE BETWEEN sp.valid_from AND sp.valid_until AND sp.payment_status = 'confirmed' THEN 'Active'
        WHEN CURRENT_DATE > sp.valid_until THEN 'Expired'
        ELSE 'Inactive'
    END as status
FROM students s
CROSS JOIN routes r
LEFT JOIN semester_payments sp ON s.id = sp.student_id AND r.id = sp.route_id
WHERE r.status = 'active';

-- Add RLS policies
ALTER TABLE semester_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE semester_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_receipts ENABLE ROW LEVEL SECURITY;

-- Policies for semester_fees
CREATE POLICY "Admin can manage semester fees" ON semester_fees
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM admin_users au
            WHERE au.id = auth.uid()
            AND au.is_active = true
        )
    );

-- Policies for semester_payments
CREATE POLICY "Admin can manage semester payments" ON semester_payments
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM admin_users au
            WHERE au.id = auth.uid()
            AND au.is_active = true
        )
    );

CREATE POLICY "Students can view their semester payments" ON semester_payments
    FOR SELECT USING (
        student_id = auth.uid()
    );

-- Policies for payment_receipts
CREATE POLICY "Admin can manage payment receipts" ON payment_receipts
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM admin_users au
            WHERE au.id = auth.uid()
            AND au.is_active = true
        )
    );

CREATE POLICY "Students can view their payment receipts" ON payment_receipts
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM semester_payments sp
            WHERE sp.id = semester_payment_id
            AND sp.student_id = auth.uid()
        )
    );

-- Insert sample semester fees for testing
DO $$
DECLARE
    current_semester RECORD;
    route_record RECORD;
BEGIN
    -- Get current semester info
    SELECT * INTO current_semester FROM get_current_semester();
    
    -- Insert sample fees for existing routes
    FOR route_record IN SELECT id, route_name FROM routes WHERE status = 'active' LIMIT 3
    LOOP
        -- Sample stops with different fees
        INSERT INTO semester_fees (route_id, stop_name, semester_fee, academic_year, semester, effective_from, effective_until, created_by)
        VALUES 
            (route_record.id, 'Main Gate', 3000.00, current_semester.academic_year, current_semester.semester, current_semester.start_date, current_semester.end_date, (SELECT id FROM admin_users LIMIT 1)),
            (route_record.id, 'College Stop', 2800.00, current_semester.academic_year, current_semester.semester, current_semester.start_date, current_semester.end_date, (SELECT id FROM admin_users LIMIT 1)),
            (route_record.id, 'City Center', 3200.00, current_semester.academic_year, current_semester.semester, current_semester.start_date, current_semester.end_date, (SELECT id FROM admin_users LIMIT 1)),
            (route_record.id, 'Bus Stand', 2900.00, current_semester.academic_year, current_semester.semester, current_semester.start_date, current_semester.end_date, (SELECT id FROM admin_users LIMIT 1))
        ON CONFLICT (route_id, stop_name, academic_year, semester) DO NOTHING;
    END LOOP;
    
    RAISE NOTICE 'Sample semester fees created for current semester: % - Semester %', current_semester.academic_year, current_semester.semester;
END $$;

COMMENT ON TABLE semester_fees IS 'Semester fee structure set by admin for each route and stop';
COMMENT ON TABLE semester_payments IS 'Student semester payments tracking - students pay once per semester (6 months)';
COMMENT ON TABLE payment_receipts IS 'Detailed payment receipts for record keeping';
COMMENT ON FUNCTION has_valid_semester_payment IS 'Check if student has valid payment for route and stop';
COMMENT ON FUNCTION get_current_semester IS 'Get current academic year and semester information';
COMMENT ON VIEW student_payment_status IS 'Comprehensive view of student payment status across all routes';
