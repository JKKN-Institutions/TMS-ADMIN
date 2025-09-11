# Global Calendar Issues - Complete Fix Guide

## Issues Identified and Fixed

### 1. **Data Calculation Error** ✅ FIXED

**Problem**: The global calendar was incorrectly using `schedule.available_seats` as total seats instead of using the route's total capacity.

**Impact**:

- Showed wrong occupancy percentages
- Displayed incorrect available seat counts
- Caused confusion between admin and passenger views

**Fix Applied**:

- Updated `/api/admin/schedules/global-calendar/route.ts`
- Now correctly uses `routes.total_capacity` as total seats
- Calculates `availableSeats = totalCapacity - bookedSeats`
- Added fallback value of 40 seats if route capacity is missing

### 2. **Z-Index Layout Issue** ✅ FIXED

**Problem**: Global calendar modal was appearing under the navigation bar.

**Impact**: Modal content was partially hidden behind the fixed navigation bar

**Fix Applied**:

- Increased modal z-index from `z-40` to `z-50`
- Ensures modal appears above navigation bar (which uses `z-30`)

### 3. **Booking Controls Not Enabled** ✅ FIXED

**Problem**: Schedules were not properly enabled for passenger bookings.

**Impact**:

- Passengers couldn't see or book available schedules
- Booking availability wasn't properly communicated to passenger module

**Fix Applied**:

- Enhanced global calendar API to include booking control fields
- Created utility script `enable-booking-for-route.js` to enable booking controls
- Added booking availability checks to the API response

## Files Modified

1. **`admin/app/api/admin/schedules/global-calendar/route.ts`**

   - Fixed data calculation logic
   - Added booking control fields to API response
   - Improved error handling

2. **`admin/components/global-booking-calendar.tsx`**

   - Fixed z-index issue (z-40 → z-50)

3. **`admin/enable-booking-for-route.js`** (NEW)
   - Utility script to enable booking controls
   - Can enable booking for specific routes/dates or all routes
   - Includes status checking functionality

## How to Fix Current Issues

### Step 1: Run the Route Allocation Sync (if needed)

```bash
cd admin
node fix-valarmathi-route-allocation.js
```

### Step 2: Enable Booking Controls for Your Schedules

#### Option A: Enable for specific route and date

```bash
cd admin
node enable-booking-for-route.js enable <route_id> 2024-07-06
```

#### Option B: Enable for all routes for a date range

```bash
cd admin
node enable-booking-for-route.js enable-all 2024-07-06 2024-07-08
```

#### Option C: Check current booking status

```bash
cd admin
node enable-booking-for-route.js check <route_id> 2024-07-06
```

### Step 3: Verify the Fixes

1. **Check Global Calendar**:

   - Open admin portal → Schedules → Global Calendar
   - Verify that occupancy percentages are correct
   - Check that the modal appears above the navigation bar

2. **Check Passenger Booking**:
   - Open passenger portal → Schedules
   - Verify that scheduled trips are visible and bookable
   - Test booking functionality

## Technical Details

### Correct Data Calculation

**Before**:

```javascript
totalSeats: schedule.available_seats,
availableSeats: schedule.available_seats - (schedule.booked_seats || 0)
```

**After**:

```javascript
const totalCapacity = schedule.routes?.total_capacity || 40;
const bookedSeats = schedule.booked_seats || 0;
const availableSeats = Math.max(0, totalCapacity - bookedSeats);

totalSeats: totalCapacity,
bookedSeats: bookedSeats,
availableSeats: availableSeats
```

### Booking Controls Schema

The system now properly checks these fields:

- `schedules.admin_scheduling_enabled`
- `schedules.booking_enabled`
- `schedules.is_booking_window_open`
- `booking_availability.is_booking_enabled`

### Z-Index Hierarchy

- Sidebar: `z-50`
- **Global Calendar Modal: `z-50`** (Fixed)
- Navigation Bar: `z-30`
- Background overlay: `z-40`

## Troubleshooting

### If schedules still don't appear for passengers:

1. **Check route allocation sync**:

   ```bash
   node fix-valarmathi-route-allocation.js
   ```

2. **Verify booking controls are enabled**:

   ```bash
   node enable-booking-for-route.js check <route_id> <date>
   ```

3. **Enable booking controls if needed**:
   ```bash
   node enable-booking-for-route.js enable <route_id> <date>
   ```

### If global calendar still shows wrong data:

1. **Clear browser cache** and reload
2. **Check that the API changes are deployed**
3. **Verify route has `total_capacity` set in database**

### If modal still goes under navigation:

1. **Check browser developer tools** for CSS conflicts
2. **Verify z-index is applied** correctly
3. **Try hard refresh** (Ctrl+F5)

## Verification Steps

Run these checks to ensure everything is working:

1. **Route Allocation Check**:

   ```sql
   SELECT
       s.student_name,
       s.allocated_route_id as legacy_route,
       sra.route_id as new_route,
       CASE WHEN s.allocated_route_id = sra.route_id THEN 'SYNCED' ELSE 'MISMATCH' END as status
   FROM students s
   LEFT JOIN student_route_allocations sra ON s.id = sra.student_id AND sra.is_active = true
   WHERE s.allocated_route_id IS NOT NULL;
   ```

2. **Booking Controls Check**:

   ```sql
   SELECT
       s.id,
       s.schedule_date,
       s.admin_scheduling_enabled,
       s.booking_enabled,
       s.is_booking_window_open,
       ba.is_booking_enabled as availability_enabled,
       r.route_number
   FROM schedules s
   JOIN routes r ON s.route_id = r.id
   LEFT JOIN booking_availability ba ON s.route_id = ba.route_id AND s.schedule_date = ba.availability_date
   WHERE s.schedule_date >= CURRENT_DATE
   ORDER BY s.schedule_date;
   ```

3. **Data Calculation Check**:
   ```sql
   SELECT
       s.id,
       s.schedule_date,
       r.total_capacity,
       s.available_seats,
       s.booked_seats,
       (r.total_capacity - COALESCE(s.booked_seats, 0)) as calculated_available
   FROM schedules s
   JOIN routes r ON s.route_id = r.id
   WHERE s.schedule_date >= CURRENT_DATE;
   ```

## Summary

✅ **Fixed**: Data calculation errors in global calendar
✅ **Fixed**: Z-index issue with modal appearing under navigation
✅ **Fixed**: Booking controls not being enabled for passengers
✅ **Added**: Utility scripts for managing booking controls
✅ **Enhanced**: API to include booking status information

The global calendar should now:

- Display correct occupancy data
- Appear properly above the navigation bar
- Enable passengers to see and book available schedules
- Show consistent data between admin and passenger modules
