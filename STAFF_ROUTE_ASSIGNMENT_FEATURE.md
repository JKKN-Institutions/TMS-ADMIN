# Staff Route Assignment Feature

## Overview
This feature enables administrators to assign staff members to routes for monitoring and management purposes. Staff members can then view their assigned routes and see all passengers boarding on those routes through the passenger app.

## Features

### Admin Side (TMS-ADMIN)
1. **Staff Route Assignment Module** - Full-featured admin interface to:
   - Assign staff members to routes by searching their email
   - View all current assignments
   - Remove assignments when needed
   - Add notes to assignments
   - View statistics (total assignments, routes, staff members)

2. **Staff Search API** - Search for staff members by email or name

### Passenger App Side (TMS-PASSENGER)
1. **Staff Assigned Routes View** - Staff members can:
   - View all routes assigned to them
   - See complete route details (timings, locations, driver, vehicle)
   - View all passengers on each route
   - See passenger details organized by boarding stops
   - View passenger contact information and academic details

## Database Schema

### New Table: `staff_route_assignments`

```sql
CREATE TABLE staff_route_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  staff_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  assigned_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(staff_id, route_id, is_active)
);
```

**Indexes:**
- `idx_staff_route_assignments_staff_id` - For quick lookup by staff
- `idx_staff_route_assignments_route_id` - For quick lookup by route
- `idx_staff_route_assignments_is_active` - For filtering active assignments
- `idx_staff_route_assignments_assigned_by` - For tracking who assigned

## API Endpoints

### Admin APIs (TMS-ADMIN)

#### 1. Staff Route Assignments API
**Path:** `/api/admin/staff-route-assignments`

**GET** - Fetch all staff route assignments
- Query Params:
  - `staffEmail` (optional) - Filter by staff email
  - `routeId` (optional) - Filter by route ID
- Response:
  ```json
  {
    "success": true,
    "assignments": [...],
    "count": 10
  }
  ```

**POST** - Create new assignment
- Body:
  ```json
  {
    "staffEmail": "staff@example.com",
    "routeId": "uuid",
    "assignedBy": "uuid",
    "notes": "Optional notes"
  }
  ```
- Response:
  ```json
  {
    "success": true,
    "message": "Staff route assignment created successfully",
    "assignment": {...}
  }
  ```

**DELETE** - Remove assignment (sets is_active to false)
- Query Params:
  - `assignmentId` (required)
- Response:
  ```json
  {
    "success": true,
    "message": "Staff route assignment removed successfully",
    "assignment": {...}
  }
  ```

#### 2. Staff Search API
**Path:** `/api/admin/staff/search`

**GET** - Search for staff by email or name
- Query Params:
  - `q` (required, min 2 characters) - Search query
- Response:
  ```json
  {
    "success": true,
    "staff": [...],
    "count": 5
  }
  ```

### Passenger App APIs (TMS-PASSENGER)

#### Staff Assigned Routes API
**Path:** `/api/staff/assigned-routes`

**GET** - Fetch assigned routes for a staff member with passengers
- Query Params:
  - `email` (required if no staffId) - Staff email
  - `staffId` (required if no email) - Staff ID
- Response:
  ```json
  {
    "success": true,
    "assignments": [...],
    "routesWithPassengers": [
      {
        "assignmentId": "uuid",
        "assignedAt": "timestamp",
        "notes": "...",
        "route": {
          "id": "uuid",
          "route_number": "R01",
          "route_name": "Route Name",
          "start_location": "Location A",
          "end_location": "Location B",
          "departure_time": "08:00:00",
          "arrival_time": "09:00:00",
          "driver": {...},
          "vehicle": {...}
        },
        "passengers": [
          {
            "allocationId": "uuid",
            "student": {
              "id": "uuid",
              "student_name": "Student Name",
              "roll_number": "123456",
              "email": "student@example.com",
              "mobile": "1234567890",
              "departments": {...},
              "programs": {...}
            },
            "boardingStop": {
              "id": "uuid",
              "stop_name": "Stop Name",
              "stop_time": "08:15:00",
              "sequence_order": 1
            },
            "allocatedAt": "timestamp"
          }
        ],
        "passengerCount": 25
      }
    ],
    "totalRoutes": 3,
    "totalPassengers": 75
  }
  ```

## File Structure

### Admin App (TMS-ADMIN)
```
TMS-ADMIN/
├── app/
│   ├── (admin)/
│   │   └── staff-route-assignments/
│   │       └── page.tsx                    # Admin UI for assignments
│   └── api/
│       └── admin/
│           ├── staff-route-assignments/
│           │   └── route.ts               # Assignment CRUD API
│           └── staff/
│               └── search/
│                   └── route.ts           # Staff search API
├── supabase/
│   └── migrations/
│       └── 34-staff-route-assignments.sql  # Database migration
└── STAFF_ROUTE_ASSIGNMENT_FEATURE.md      # This documentation
```

### Passenger App (TMS-PASSENGER)
```
TMS-PASSENGER/
└── app/
    ├── api/
    │   └── staff/
    │       └── assigned-routes/
    │           └── route.ts               # Fetch assigned routes API
    └── staff/
        └── assigned-routes/
            └── page.tsx                   # Staff UI to view routes
```

## Installation & Setup

### 1. Run Database Migration

Connect to your Supabase database and run the migration:

```bash
# Navigate to the migrations directory
cd supabase/migrations

# Execute the migration file
psql $DATABASE_URL -f 34-staff-route-assignments.sql
```

Or use Supabase CLI:

```bash
supabase db push
```

### 2. Verify Database Setup

Run this query to verify the table was created:

```sql
SELECT
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name = 'staff_route_assignments'
ORDER BY ordinal_position;
```

### 3. Admin App Setup

The admin module is ready to use. Navigate to:

```
http://localhost:3001/(admin)/staff-route-assignments
```

### 4. Passenger App Setup

Staff members can access their assigned routes at:

```
http://localhost:3003/staff/assigned-routes
```

**Note:** Staff must be logged in through the staff login system.

## Usage Guide

### For Administrators

#### Assigning a Route to Staff:

1. Navigate to the Staff Route Assignments page
2. Click "Assign Route" button
3. Search for staff by email or name
4. Select the staff member from search results
5. Choose a route from the dropdown
6. Optionally add notes about the assignment
7. Click "Assign Route"

#### Viewing Assignments:

- The main page shows all active assignments
- View statistics: total assignments, assigned routes, staff members
- Each assignment card shows:
  - Staff details (name, email, role)
  - Route details (name, number, locations, timings)
  - Passenger count
  - Assignment date
  - Notes (if any)

#### Removing an Assignment:

1. Find the assignment you want to remove
2. Click the trash icon on the right side
3. Confirm the removal

### For Staff Members

#### Viewing Assigned Routes:

1. Log in to the passenger app as staff
2. Navigate to "Assigned Routes" (or `/staff/assigned-routes`)
3. View all routes assigned to you

#### Route Details:

- See route name, number, and status
- View start and end locations
- Check departure and arrival times
- See driver and vehicle information
- View passenger count and capacity

#### Viewing Passengers:

1. Click on any route card to expand it
2. Passengers are grouped by boarding stop
3. Each stop shows:
   - Stop name and time
   - Number of passengers
4. Each passenger card shows:
   - Student name and roll number
   - Email and mobile number
   - Department and program
   - Academic year and semester

## Security Considerations

1. **Access Control:**
   - Only authenticated admin users can assign routes
   - Staff can only view their own assigned routes
   - Assignment removal requires confirmation

2. **Data Validation:**
   - Email validation for staff search
   - Route existence verification
   - Duplicate assignment prevention
   - Active status checks

3. **Database Constraints:**
   - Foreign key constraints ensure data integrity
   - Unique constraint prevents duplicate active assignments
   - Cascade delete for data consistency

## API Error Handling

All APIs return consistent error responses:

```json
{
  "success": false,
  "error": "Error message here"
}
```

Common error codes:
- `400` - Bad request (missing required fields)
- `404` - Resource not found (staff/route doesn't exist)
- `409` - Conflict (duplicate assignment)
- `500` - Internal server error

## Future Enhancements

Potential improvements for this feature:

1. **Notifications:**
   - Notify staff when assigned to a route
   - Alert staff of passenger changes

2. **Analytics:**
   - Track assignment history
   - Generate reports on staff assignments
   - Monitor route coverage

3. **Bulk Operations:**
   - Assign multiple routes to a staff member
   - Assign a route to multiple staff members
   - Bulk import assignments from CSV

4. **Advanced Filtering:**
   - Filter passengers by department, year, semester
   - Search passengers by name or roll number
   - Export passenger lists to CSV/PDF

5. **Real-time Updates:**
   - Live passenger count updates
   - Real-time route status changes
   - Push notifications for important events

6. **Mobile Optimization:**
   - Dedicated mobile app views
   - Offline support for route data
   - Quick actions for common tasks

## Testing

### Manual Testing Checklist

#### Admin Side:
- [ ] Can search for staff by email
- [ ] Can search for staff by name
- [ ] Can select staff from search results
- [ ] Can select a route from dropdown
- [ ] Can add assignment notes
- [ ] Can create a new assignment
- [ ] Cannot create duplicate assignments
- [ ] Can view all assignments
- [ ] Can remove an assignment
- [ ] Stats update correctly after operations

#### Staff Side:
- [ ] Staff can log in successfully
- [ ] Assigned routes are displayed
- [ ] Route details are accurate
- [ ] Can expand/collapse route cards
- [ ] Passengers are grouped by stop correctly
- [ ] Passenger details are complete
- [ ] No routes shown for staff with no assignments
- [ ] Stats are calculated correctly

### API Testing

Use tools like Postman or curl to test APIs:

```bash
# Test staff search
curl -X GET "http://localhost:3001/api/admin/staff/search?q=test@example.com"

# Test create assignment
curl -X POST "http://localhost:3001/api/admin/staff-route-assignments" \
  -H "Content-Type: application/json" \
  -d '{
    "staffEmail": "staff@example.com",
    "routeId": "route-uuid-here",
    "notes": "Test assignment"
  }'

# Test fetch assigned routes
curl -X GET "http://localhost:3003/api/staff/assigned-routes?email=staff@example.com"
```

## Troubleshooting

### Common Issues:

1. **Migration fails:**
   - Ensure uuid-ossp extension is enabled
   - Check if admin_users and routes tables exist
   - Verify database connection

2. **Staff search returns no results:**
   - Check if admin_users table has data
   - Verify email/name search query
   - Check is_active flag

3. **Passengers not showing:**
   - Verify student_route_allocations table has data
   - Check if is_active is true
   - Ensure route_id matches

4. **Permission errors:**
   - Verify user is logged in as staff
   - Check staff authentication in passenger app
   - Ensure correct role assignments

## Support

For issues or questions:
1. Check this documentation
2. Review the code comments
3. Check database constraints
4. Review API error messages
5. Contact the development team

## Version History

- **v1.0.0** (2025-10-25)
  - Initial release
  - Basic assignment functionality
  - Staff and admin interfaces
  - Passenger viewing grouped by stops
