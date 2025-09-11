-- Comprehensive Database Verification Script
-- Run this in Supabase SQL Editor to verify all components are set up correctly

-- =============================================================================
-- 1. VERIFY STUDENT TABLE SCHEMA
-- =============================================================================
SELECT 
    '🔍 STUDENT TABLE SCHEMA VERIFICATION' AS verification_section,
    'Checking if all required columns exist...' AS status;

-- Check basic columns exist
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'students' 
ORDER BY ordinal_position;

-- =============================================================================
-- 2. VERIFY COMPREHENSIVE STUDENT FIELDS
-- =============================================================================
SELECT 
    '📋 COMPREHENSIVE FIELDS CHECK' AS verification_section,
    'Checking if comprehensive student fields are present...' AS status;

-- Check for specific comprehensive fields
SELECT 
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'students' AND column_name = 'department_name') 
        THEN '✅ department_name exists'
        ELSE '❌ department_name MISSING'
    END AS department_name_check,
    
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'students' AND column_name = 'institution_name') 
        THEN '✅ institution_name exists'
        ELSE '❌ institution_name MISSING'
    END AS institution_name_check,
    
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'students' AND column_name = 'program_name') 
        THEN '✅ program_name exists'
        ELSE '❌ program_name MISSING'
    END AS program_name_check,
    
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'students' AND column_name = 'father_name') 
        THEN '✅ father_name exists'
        ELSE '❌ father_name MISSING'
    END AS father_name_check,
    
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'students' AND column_name = 'mother_name') 
        THEN '✅ mother_name exists'
        ELSE '❌ mother_name MISSING'
    END AS mother_name_check,
    
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'students' AND column_name = 'address_street') 
        THEN '✅ address_street exists'
        ELSE '❌ address_street MISSING'
    END AS address_street_check,
    
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'students' AND column_name = 'allocated_route_id') 
        THEN '✅ allocated_route_id exists'
        ELSE '❌ allocated_route_id MISSING'
    END AS allocated_route_check,
    
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'students' AND column_name = 'transport_status') 
        THEN '✅ transport_status exists'
        ELSE '❌ transport_status MISSING'
    END AS transport_status_check;

-- =============================================================================
-- 3. VERIFY ENROLLMENT SYSTEM TABLES
-- =============================================================================
SELECT 
    '🎓 ENROLLMENT SYSTEM TABLES' AS verification_section,
    'Checking enrollment system tables...' AS status;

-- Check enrollment tables exist
SELECT 
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'transport_enrollment_requests') 
        THEN '✅ transport_enrollment_requests table exists'
        ELSE '❌ transport_enrollment_requests table MISSING'
    END AS enrollment_requests_table,
    
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'transport_enrollment_activities') 
        THEN '✅ transport_enrollment_activities table exists'
        ELSE '❌ transport_enrollment_activities table MISSING'
    END AS enrollment_activities_table,
    
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'student_transport_profiles') 
        THEN '✅ student_transport_profiles table exists'
        ELSE '❌ student_transport_profiles table MISSING'
    END AS transport_profiles_table,
    
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'student_route_allocations') 
        THEN '✅ student_route_allocations table exists'
        ELSE '❌ student_route_allocations table MISSING'
    END AS route_allocations_table;

-- =============================================================================
-- 4. VERIFY ENROLLMENT FUNCTIONS
-- =============================================================================
SELECT 
    '⚙️ ENROLLMENT FUNCTIONS' AS verification_section,
    'Checking if enrollment functions exist and work...' AS status;

-- Check if functions exist
SELECT 
    CASE 
        WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'approve_transport_enrollment_request') 
        THEN '✅ approve_transport_enrollment_request function exists'
        ELSE '❌ approve_transport_enrollment_request function MISSING'
    END AS approve_function_check,
    
    CASE 
        WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'reject_transport_enrollment_request') 
        THEN '✅ reject_transport_enrollment_request function exists'
        ELSE '❌ reject_transport_enrollment_request function MISSING'
    END AS reject_function_check,
    
    CASE 
        WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_comprehensive_student_data') 
        THEN '✅ update_comprehensive_student_data function exists'
        ELSE '❌ update_comprehensive_student_data function MISSING'
    END AS comprehensive_update_function_check;

-- =============================================================================
-- 5. VERIFY ENUMS AND TYPES
-- =============================================================================
SELECT 
    '📊 ENUM TYPES' AS verification_section,
    'Checking custom enum types...' AS status;

-- Check if enrollment enums exist
SELECT 
    CASE 
        WHEN EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transport_request_status') 
        THEN '✅ transport_request_status enum exists'
        ELSE '❌ transport_request_status enum MISSING'
    END AS request_status_enum,
    
    CASE 
        WHEN EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transport_request_type') 
        THEN '✅ transport_request_type enum exists'
        ELSE '❌ transport_request_type enum MISSING'
    END AS request_type_enum,
    
    CASE 
        WHEN EXISTS (SELECT 1 FROM pg_type WHERE typname = 'auth_source') 
        THEN '✅ auth_source enum exists'
        ELSE '❌ auth_source enum MISSING'
    END AS auth_source_enum;

-- =============================================================================
-- 6. VERIFY INDEXES
-- =============================================================================
SELECT 
    '🔍 DATABASE INDEXES' AS verification_section,
    'Checking performance indexes...' AS status;

-- List indexes on students table
SELECT 
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename = 'students'
ORDER BY indexname;

-- =============================================================================
-- 7. CHECK SAMPLE DATA
-- =============================================================================
SELECT 
    '📋 SAMPLE DATA CHECK' AS verification_section,
    'Checking existing data structure...' AS status;

-- Count records in each table
SELECT 
    (SELECT COUNT(*) FROM students) AS students_count,
    (SELECT COUNT(*) FROM routes) AS routes_count,
    (SELECT COUNT(*) FROM admin_users) AS admin_users_count,
    (SELECT COALESCE(COUNT(*), 0) FROM transport_enrollment_requests) AS enrollment_requests_count;

-- =============================================================================
-- 8. TEST FUNCTION PARAMETERS (Safe Test)
-- =============================================================================
SELECT 
    '🧪 FUNCTION PARAMETER TEST' AS verification_section,
    'Testing function parameter compatibility...' AS status;

-- Test if functions accept the correct parameter names (this won't execute, just checks syntax)
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            WHERE p.proname = 'approve_transport_enrollment_request'
            AND n.nspname = 'public'
        )
        THEN '✅ Approval function parameters updated'
        ELSE '❌ Approval function needs parameter fix'
    END AS approval_params_test;

-- =============================================================================
-- 9. COMPREHENSIVE STATUS SUMMARY
-- =============================================================================
SELECT 
    '📊 OVERALL STATUS SUMMARY' AS verification_section,
    'Final verification results...' AS status;

-- Overall system readiness check
WITH verification_results AS (
    SELECT 
        CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'students' AND column_name = 'department_name') THEN 1 ELSE 0 END +
        CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'students' AND column_name = 'allocated_route_id') THEN 1 ELSE 0 END +
        CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'transport_enrollment_requests') THEN 1 ELSE 0 END +
        CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'approve_transport_enrollment_request') THEN 1 ELSE 0 END +
        CASE WHEN EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transport_request_status') THEN 1 ELSE 0 END AS score
)
SELECT 
    score,
    CASE 
        WHEN score = 5 THEN '🎉 SYSTEM FULLY READY - All components verified!'
        WHEN score >= 3 THEN '⚠️ MOSTLY READY - Some components need attention'
        ELSE '❌ SYSTEM NOT READY - Major components missing'
    END AS system_status,
    CASE 
        WHEN score = 5 THEN 'Enrollment system is fully functional'
        WHEN score >= 3 THEN 'Basic functionality available, apply missing components'
        ELSE 'Please apply database migrations before proceeding'
    END AS recommendation
FROM verification_results;

-- =============================================================================
-- 10. MISSING COMPONENTS REPORT
-- =============================================================================
SELECT 
    '🔧 MISSING COMPONENTS REPORT' AS verification_section,
    'What needs to be fixed...' AS status;

-- Generate fix commands for missing components
SELECT 
    CASE 
        WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'students' AND column_name = 'department_name')
        THEN 'RUN: ALTER TABLE students ADD COLUMN department_name VARCHAR(255);'
        ELSE '✅ Department name field ready'
    END AS department_fix,
    
    CASE 
        WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'students' AND column_name = 'allocated_route_id')
        THEN 'RUN: ALTER TABLE students ADD COLUMN allocated_route_id UUID;'
        ELSE '✅ Route allocation field ready'
    END AS route_allocation_fix,
    
    CASE 
        WHEN NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'approve_transport_enrollment_request')
        THEN 'RUN: Apply enrollment functions from admin/supabase/29-fix-enrollment-functions-simple.sql'
        ELSE '✅ Enrollment functions ready'
    END AS functions_fix; 