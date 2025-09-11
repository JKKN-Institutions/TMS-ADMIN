# Student API Setup Guide

## Current Status ✅ CONNECTED TO REAL API

The student fetching functionality is now integrated and connected to your real API at:
**`https://my.jkkn.ac.in/api/api-management/`**

## API Integration Files Created

1. **`/app/api/api-management/students/route.ts`** - Handles student search/list API calls
2. **`/app/api/api-management/students/[id]/route.ts`** - Handles individual student details API calls
3. **UI Components** - Badge, Select, and Separator components for the student interface

## Real API Connection ✅

The system is now connected to your real API:

- **Base URL**: `https://my.jkkn.ac.in/api/api-management/`
- **API Key**: `jk_21372a6d0f4ca05d02139a0fb714a2e5_mcejx5qz`
- **Endpoints Used**:
  - `GET /students?search={email}` - Search students by email
  - `GET /students/{id}` - Get detailed student information

## How to Test

1. **Navigate to the Students page** in your admin panel
2. **Click "Add Student"** button
3. **Enter a real student email** from your institution's database
4. **Click "Fetch Details"** to retrieve student information
5. **Review and confirm** the student details
6. **Assign transport** (optional) and save

## Email-Based Search Process

1. User enters email address
2. System searches: `GET /students?search=email@example.com`
3. Finds exact email match from results (checks both `student_email` and `college_email`)
4. Fetches detailed info: `GET /students/{student_id}`
5. Displays comprehensive student profile

## API Response Format Expected

The integration expects the following response format:

### Students List (`GET /students`)

```json
{
  "data": [
    {
      "id": "student_id",
      "student_name": "Name",
      "student_email": "email@example.com",
      "college_email": "email@college.edu",
      "student_mobile": "+1234567890",
      "institution": { "id": "inst_id", "name": "Institution Name" },
      "department": { "id": "dept_id", "department_name": "Department" },
      "program": { "id": "prog_id", "program_name": "Program" },
      "is_profile_complete": true
    }
  ],
  "metadata": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "totalPages": 10
  }
}
```

### Student Details (`GET /students/{id}`)

```json
{
  "data": {
    "id": "student_id",
    "student_name": "Full Name",
    "roll_number": "ROLL123",
    "student_email": "email@example.com",
    "college_email": "email@college.edu",
    "student_mobile": "+1234567890",
    "father_name": "Father Name",
    "mother_name": "Mother Name",
    "date_of_birth": "2000-01-15",
    "gender": "Male/Female",
    "institution": { "id": "inst_id", "name": "Institution Name" },
    "department": { "id": "dept_id", "department_name": "Department" },
    "program": { "id": "prog_id", "program_name": "Program" },
    "degree": { "id": "deg_id", "degree_name": "Degree" },
    "permanent_address_street": "Street Address",
    "permanent_address_district": "District",
    "permanent_address_state": "State",
    "permanent_address_pin_code": "PIN",
    "is_profile_complete": true
  }
}
```

## Features Implemented

✅ **Email-based student lookup** - Search students by email address  
✅ **Comprehensive student details** - Display full profile information  
✅ **Profile completion status** - Visual indicators for complete/incomplete profiles  
✅ **Academic information** - Institution, department, program, degree details  
✅ **Family information** - Father's and mother's names  
✅ **Address information** - Complete permanent address details  
✅ **Transport assignment** - Integration with existing route assignment system  
✅ **Error handling** - Network errors, student not found, API failures  
✅ **Real API integration** - Connected to live student database

## Ready to Use! 🚀

The student API integration is now **fully functional** and connected to your real database:

✅ **API Connected**: `https://my.jkkn.ac.in/api/api-management/`  
✅ **Email Search**: Enter any real student email to fetch details  
✅ **Full Profile**: Displays complete student information  
✅ **Transport Integration**: Assign routes and manage transport  
✅ **Error Handling**: Graceful handling of API errors and not-found cases

**Start using it now** by navigating to the Students page and adding students with their real email addresses!
