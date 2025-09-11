# Scheduling 7 PM Cutoff Implementation

## Overview

This document outlines the complete implementation of the enhanced scheduling system with a 7 PM cutoff for trip bookings. The system ensures that all trip bookings must be completed by 7 PM the day before the scheduled trip, and requires admin approval to enable scheduling for each trip.

## Key Features Implemented

### 1. Enhanced Scheduling Configuration

- **7 PM Cutoff**: All bookings must be completed by 7 PM the day before the trip
- **Admin Approval Required**: Each trip must be individually enabled by admin for student booking
- **No Same-Day Booking**: Students cannot book trips on the same day as departure
- **Strict Enforcement**: System automatically closes booking windows at the specified time

### 2. Admin Controls

- **Schedule Booking Control Modal**: New interface for admins to enable/disable scheduling for specific trips
- **Bulk Operations**: API support for enabling/disabling multiple schedules at once
- **Booking Time Windows**: Configurable start and end times (default: 6 AM - 7 PM)
- **Special Instructions**: Admins can add custom instructions for specific trips

### 3. Database Enhancements

- **Enhanced Columns**: New columns added to `schedules` and `booking_availability` tables
- **Automated Triggers**: Database triggers to automatically set booking deadlines
- **Validation Functions**: New PostgreSQL functions to check booking availability

## Files Modified/Created

### 1. Configuration Files

- `admin/lib/scheduling-config.ts` - Updated default settings for 7 PM cutoff
- `admin/app/(admin)/settings/page.tsx` - Enhanced settings interface with policy explanations

### 2. New Components

- `admin/components/schedule-booking-control-modal.tsx` - Modal for managing individual trip scheduling

### 3. API Endpoints

- `admin/app/api/admin/schedules/booking-controls/route.ts` - API for managing booking controls

### 4. Database Migration

- `admin/supabase/16-enhanced-booking-controls.sql` - Complete database schema enhancements

## Setup Instructions

### 1. Database Migration

Since the automated migration couldn't be executed through the API, you need to manually run the SQL migration:

1. Open your Supabase Dashboard
2. Go to the SQL Editor
3. Copy and paste the contents of `admin/supabase/16-enhanced-booking-controls.sql`
4. Execute the SQL

**Important**: The SQL file contains all necessary:

- New table columns
- Database functions
- Triggers
- Indexes
- Comments

### 2. Environment Configuration

Ensure your `.env.local` file contains the correct Supabase credentials:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 3. Admin Settings Configuration

1. Navigate to Admin Dashboard → Settings → Scheduling
2. Verify the booking window settings:
   - **Booking Window Start Hour**: 6 AM (default)
   - **Booking Window End Hour**: 7 PM (enforced)
   - **Days Before Trip**: 1 day (required)
3. Save the configuration

## How It Works

### 1. Admin Workflow

1. **Schedule Creation**: Admin creates schedules for routes
2. **Enable Scheduling**: Admin must explicitly enable scheduling for each trip using the booking control modal
3. **Set Time Windows**: Admin can customize booking start/end times (default 6 AM - 7 PM)
4. **Add Instructions**: Optional special instructions for specific trips

### 2. Student Workflow

1. **Check Availability**: Students can only see trips that are admin-enabled
2. **Booking Window**: Students can only book during the designated time window (day before trip)
3. **7 PM Cutoff**: All bookings must be completed by 7 PM the day before
4. **Real-time Validation**: System checks booking availability in real-time

### 3. System Validation

- **Time Window Check**: Validates current time is within booking window
- **Admin Approval Check**: Ensures trip is enabled by admin
- **Deadline Enforcement**: Automatically closes booking at 7 PM
- **Seat Availability**: Checks available seats before allowing booking

## API Endpoints

### 1. Get Booking Controls

```
GET /api/admin/schedules/booking-controls?schedule_id={id}
```

### 2. Update Booking Controls

```
PUT /api/admin/schedules/booking-controls
Body: {
  schedule_id: string,
  admin_scheduling_enabled: boolean,
  booking_enabled: boolean,
  scheduling_instructions?: string,
  booking_start_time?: string,
  booking_end_time?: string
}
```

### 3. Bulk Update

```
POST /api/admin/schedules/booking-controls
Body: {
  route_id: string,
  date_range: { start_date: string, end_date: string },
  admin_scheduling_enabled: boolean,
  booking_enabled: boolean,
  ...
}
```

## Database Schema Changes

### New Columns in `schedules` table:

- `booking_enabled` (BOOLEAN) - Whether booking is enabled for this specific schedule
- `booking_deadline` (TIMESTAMP WITH TIME ZONE) - Deadline for booking (7 PM the day before)
- `admin_scheduling_enabled` (BOOLEAN) - Whether admin has enabled scheduling for this trip
- `scheduling_instructions` (TEXT) - Special instructions from admin
- `total_seats` (INTEGER) - Total seats available in the vehicle

### New Columns in `booking_availability` table:

- `admin_enabled` (BOOLEAN) - Whether admin has enabled scheduling for this route/date
- `cutoff_time` (TIME) - Time when booking closes (default 7 PM)
- `booking_start_time` (TIME) - Time when booking opens (default 6 AM)
- `requires_admin_approval` (BOOLEAN) - Whether this route requires admin approval

### New Database Functions:

- `is_admin_scheduling_enabled(route_id, date)` - Checks if admin has enabled scheduling
- `is_within_booking_deadline(route_id, date, current_time)` - Checks 7 PM deadline
- `check_booking_availability(route_id, date, current_time)` - Comprehensive availability check

## Testing the Implementation

### 1. Admin Interface Testing

1. Go to Admin Dashboard → Schedules
2. Find a future schedule
3. Click "Manage Booking Controls" (if integrated)
4. Test enabling/disabling scheduling
5. Verify booking deadline is set to 7 PM the day before

### 2. Student Interface Testing

1. Navigate to Student Dashboard → Schedules
2. Verify only admin-enabled trips are bookable
3. Test booking outside the time window (should be blocked)
4. Test booking after 7 PM cutoff (should be blocked)

### 3. API Testing

```bash
# Test booking availability check
curl -X GET "your_admin_url/api/admin/schedules/booking-controls?schedule_id=test_id"

# Test updating booking controls
curl -X PUT "your_admin_url/api/admin/schedules/booking-controls" \
  -H "Content-Type: application/json" \
  -d '{"schedule_id":"test_id","admin_scheduling_enabled":true}'
```

## Configuration Options

### Scheduling Settings (in Admin Settings)

- **Booking Window Start Hour**: When daily booking window opens (default: 6 AM)
- **Booking Window End Hour**: When daily booking window closes (default: 7 PM)
- **Days Before Trip**: How many days before trip booking is allowed (fixed: 1 day)
- **Enable Booking Time Window**: Master switch for time window restrictions

### Per-Schedule Settings (in Booking Control Modal)

- **Admin Scheduling Enabled**: Whether admin has approved this trip for booking
- **Booking Enabled**: Whether booking is immediately available
- **Special Instructions**: Custom message for students
- **Custom Time Window**: Override default booking hours for specific trips

## Benefits

1. **Policy Compliance**: Enforces the 7 PM cutoff requirement
2. **Admin Control**: Full control over which trips are available for booking
3. **Automated Enforcement**: No manual checking required
4. **Flexible Configuration**: Per-trip and system-wide settings
5. **Clear Communication**: Students see clear messages about booking availability
6. **Audit Trail**: All scheduling decisions are logged with timestamps

## Troubleshooting

### Common Issues

1. **Migration Errors**: Run the SQL migration manually in Supabase Dashboard
2. **Environment Variables**: Ensure all Supabase credentials are set correctly
3. **Time Zone Issues**: All times are stored in UTC, displayed in local time
4. **Permission Issues**: Ensure admin users have proper roles

### Verification Steps

1. Check database columns exist: `SELECT column_name FROM information_schema.columns WHERE table_name = 'schedules';`
2. Test database functions: `SELECT check_booking_availability('route_id', '2024-01-30');`
3. Verify triggers are active: Check `pg_trigger` table
4. Test API endpoints with proper authentication

## Next Steps

1. **Run Database Migration**: Execute the SQL file in Supabase Dashboard
2. **Test Admin Interface**: Verify booking control modal works
3. **Configure Settings**: Set up default booking window preferences
4. **Train Admins**: Ensure admins understand the new workflow
5. **Monitor Usage**: Check that the 7 PM cutoff is being enforced

## Support

For any issues with this implementation:

1. Check the database migration was executed successfully
2. Verify environment variables are set correctly
3. Test API endpoints individually
4. Check admin user permissions
5. Review browser console for any JavaScript errors

This implementation provides a robust, policy-compliant scheduling system with the required 7 PM cutoff and admin controls.
