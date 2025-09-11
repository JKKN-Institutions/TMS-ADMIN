# Route Allocation Synchronization Fix

## Issue Description

There was a data discrepancy between the admin and passenger modules regarding student route assignments. Specifically:

- **Admin module** shows the correct route assignment (e.g., Valarmathi assigned to Route 6)
- **Passenger module** shows a different route assignment (e.g., showing Route 5 instead of Route 6)

## Root Cause

The issue stems from having **two different systems** for managing student route allocations:

1. **Legacy System** (in `students` table):

   - Uses columns: `allocated_route_id`, `boarding_point`
   - Updated by the admin module when assigning routes

2. **New System** (in `student_route_allocations` table):
   - Uses proper foreign key relationships
   - Checked by the passenger module for route information

**The Problem**: The admin module was only updating the legacy system, while the passenger module was primarily checking the new system, causing a data mismatch.

## Solution

### 1. Database Sync Script

Run the SQL script to sync existing data:

```bash
# Connect to your Supabase database and run:
# admin/fix-route-allocation-sync.sql
```

### 2. JavaScript Fix Script

Run the JavaScript script to fix the data programmatically:

```bash
cd admin
node fix-valarmathi-route-allocation.js
```

This script will:

- Check the current state of all students with route allocations
- Sync data from the legacy system to the new system
- Verify the synchronization worked correctly

### 3. Updated Admin Module

The admin module has been updated to maintain both systems:

- When assigning routes via `DatabaseService.updateStudentTransport()`
- The function now updates both the legacy and new systems simultaneously

## Files Modified

1. **`admin/fix-route-allocation-sync.sql`** - Database migration script
2. **`admin/fix-valarmathi-route-allocation.js`** - JavaScript fix script
3. **`admin/lib/route-allocation-sync.ts`** - TypeScript helper service
4. **`admin/lib/database.ts`** - Updated to sync both systems

## How to Use

### Immediate Fix

1. Run the JavaScript script to fix existing data:

   ```bash
   cd admin
   node fix-valarmathi-route-allocation.js
   ```

2. The script will:
   - Show current state of route allocations
   - Sync all students with route assignments
   - Verify the sync worked correctly

### Long-term Solution

The admin module has been updated to automatically maintain synchronization between both systems. When you assign routes to students in the future, both systems will be updated automatically.

## Verification

After running the fix:

1. **Check Admin Module**: Student details should still show the correct route assignment
2. **Check Passenger Module**: Routes and schedules should now show the same route assignment
3. **Verify in Database**: Both `students.allocated_route_id` and `student_route_allocations.route_id` should match

## Prevention

To prevent this issue in the future:

1. Always use the updated `DatabaseService.updateStudentTransport()` method
2. The method now automatically syncs both systems
3. Consider using the `RouteAllocationSyncService` for advanced scenarios

## Technical Details

### Legacy System (students table)

```sql
SELECT
    allocated_route_id,
    boarding_point
FROM students
WHERE student_name LIKE '%valarmathi%';
```

### New System (student_route_allocations table)

```sql
SELECT
    route_id,
    is_active,
    boarding_stop_id
FROM student_route_allocations
WHERE student_id = '...' AND is_active = true;
```

### Sync Process

1. Update legacy system (students table)
2. Deactivate existing allocations in new system
3. Insert new allocation in new system
4. Map boarding point to boarding stop ID

## Support

If you encounter issues:

1. Check the console logs for error messages
2. Verify environment variables are set correctly
3. Ensure database permissions are configured properly
4. Run the verification queries manually to check data state
