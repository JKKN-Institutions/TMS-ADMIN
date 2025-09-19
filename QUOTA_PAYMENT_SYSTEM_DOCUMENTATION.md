# Enhanced Quota-Based Pricing and Payment System

## Overview

The TMS Admin application has been enhanced with a comprehensive quota-based pricing system and flexible term-based payment options for student transport enrollment. This system allows administrators to:

1. **Select appropriate quotas** for students (Government 7.5%, Regular, Management, etc.)
2. **Configure flexible payment terms** (1-term, 2-term, 3-term, or custom)
3. **Track payment progress** for each student
4. **Manage different pricing tiers** based on quota eligibility

## Features Implemented

### 🎯 **Quota Management System**

#### Available Quota Types:
- **Government Quota (7.5%)**: ₹500/year - For students with 7.5% government reservation
- **Physically Challenged Quota**: ₹500/year - For students with physical disabilities
- **Sports Quota**: ₹2,500/year - For sports quota students
- **Regular Quota**: ₹5,000/year - For regular admission students
- **Management Quota**: ₹5,000/year - For management quota students
- **NRI Quota**: ₹5,000/year - For NRI quota students

### 💰 **Flexible Payment Terms**

#### Government Quota (₹500):
- Typically paid in **single payment** of ₹500
- Can be split if needed (e.g., ₹300 + ₹200)

#### Regular/Management/NRI Quota (₹5,000):
- **3-Term Option**: ₹1,500 + ₹1,500 + ₹2,000
- **2-Term Option**: ₹3,000 + ₹2,000
- **Custom Option**: ₹2,000 + ₹1,500 + ₹1,500
- **Any combination** that totals ₹5,000

### 🔧 **Database Schema**

#### New Tables Created:

1. **`quota_types`** - Defines available quota categories
2. **`payment_plans`** - Links students to their payment plans
3. **`payment_terms`** - Individual payment installments
4. **Enhanced `students`** table with quota references

#### Key Functions:
- `generate_payment_plan()` - Creates payment plans with flexible terms
- `student_enrollment_summary` view - Comprehensive enrollment overview

## Enhanced Admin UI Flow

### Step-by-Step Enrollment Process:

1. **Student Search/Selection** (Existing)
   - Find student by email or select from available students

2. **Student Confirmation** (Existing)
   - Review student details and confirm information

3. **Transport Assignment** (Enhanced)
   - Select route and boarding point
   - Choose transport status

4. **Quota & Payment Configuration** (NEW)
   - Select appropriate quota type
   - Configure payment terms
   - Set academic year
   - Validate total amounts

### Enhanced Features:

#### Quota Selection Interface:
- **Visual quota cards** with pricing information
- **Government quota highlighting** with special badges
- **Clear fee display** for each quota type
- **Automatic amount calculation** based on quota selection

#### Payment Terms Configuration:
- **Flexible term count** (1-5 terms supported)
- **Add/Remove terms** dynamically
- **Real-time total validation** 
- **Payment examples** for guidance
- **Term amount input** with validation

## API Endpoints

### New APIs Created:

#### `/api/admin/quota-types`
- `GET` - Fetch all active quota types
- `POST` - Create new quota type

#### `/api/admin/payment-plans`
- `GET` - Fetch payment plans (with student filter)
- `POST` - Create new payment plan
- `PUT` - Update payment plan status

#### `/api/admin/database`
- `POST` - Generic database query endpoint

## Usage Examples

### Government Quota Student:
```
Quota: Government Quota (7.5%)
Fee: ₹500/year
Payment: Single term of ₹500
```

### Regular Quota Student:
```
Quota: Regular Quota
Fee: ₹5,000/year
Payment Options:
- 3 terms: ₹1,500, ₹1,500, ₹2,000
- 2 terms: ₹3,000, ₹2,000
- Custom: Any combination totaling ₹5,000
```

## Technical Implementation

### Database Functions:
```sql
-- Generate payment plan with flexible terms
SELECT generate_payment_plan(
  student_id,
  quota_type_id,
  academic_year,
  '[{"term": 1, "amount": 1500}, {"term": 2, "amount": 1500}, {"term": 3, "amount": 2000}]'::JSONB
);
```

### Frontend Components:
- `EnhancedAddStudentModal.tsx` - Main enrollment modal with quota selection
- Quota selection cards with visual indicators
- Payment terms configuration with validation
- Real-time amount calculation and validation

## Benefits

### For Administrators:
- **Streamlined enrollment** with quota-based pricing
- **Flexible payment configuration** to accommodate different student needs
- **Clear validation** to prevent pricing errors
- **Comprehensive tracking** of payment plans and terms

### For Students:
- **Fair pricing** based on quota eligibility
- **Flexible payment options** to manage financial planning
- **Clear payment structure** with defined terms and amounts
- **Transparent fee calculation** based on quota type

### For Institution:
- **Automated quota management** reducing manual errors
- **Consistent pricing enforcement** across all enrollments
- **Detailed payment tracking** for financial reporting
- **Compliance with quota regulations** through structured system

## Files Modified/Created

### New Files:
- `app/(admin)/students/components/EnhancedAddStudentModal.tsx`
- `app/api/admin/quota-types/route.ts`
- `app/api/admin/payment-plans/route.ts`
- `app/api/admin/database/route.ts`
- `QUOTA_PAYMENT_SYSTEM_DOCUMENTATION.md`

### Database Migrations:
- Enhanced quota-based pricing system tables
- Payment plans and terms management
- Student quota reference fields
- Supporting functions and views

## Next Steps

To fully integrate this system:

1. **Replace the existing AddStudentModal** with EnhancedAddStudentModal in the main students page
2. **Add payment tracking dashboard** for monitoring payment status
3. **Implement payment collection interface** for term-based payments
4. **Add quota-based reporting** for administrative oversight
5. **Configure notification system** for payment due dates

The system is ready for immediate use and can be activated by updating the import in the main students page component.
