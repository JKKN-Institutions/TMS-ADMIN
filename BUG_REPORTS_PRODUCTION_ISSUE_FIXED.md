# Bug Reports Production Issue - FIXED

## Issue Summary
The passenger application was experiencing 500 (Internal Server Error) when submitting bug reports in production. The screenshot capture was working perfectly (confirmed by the logs showing successful file capture), but the API was failing during database insertion.

## Root Cause Analysis
The issue was a **database schema mismatch** between the API code and the actual Supabase database structure:

### Missing Columns in Database
The API was trying to insert data into columns that didn't exist in the `bug_reports` table:
- `steps_to_reproduce` - ❌ Not found in database
- `expected_behavior` - ❌ Not found in database  
- `actual_behavior` - ❌ Not found in database

### Actual Database Schema
```sql
-- Columns that exist in the bug_reports table:
- id
- title
- description
- category
- priority
- status
- reported_by
- reporter_name
- reporter_email
- reporter_type
- screenshot_url
- browser_info
- device_info  -- ✅ Available (was missing from API)
- screen_resolution
- user_agent
- page_url
- tags
- is_duplicate
- duplicate_of
- assigned_to
- resolved_by
- resolved_at
- resolution_notes
- created_at
- updated_at
```

## Fix Applied

### API Code Changes (`TMS-PASSENGER/app/api/bug-reports/route.ts`)

1. **Removed non-existent columns** from the database insertion
2. **Combined structured data into description field** to preserve all information
3. **Added missing columns** that exist in the database

### Before (Causing 500 Error):
```typescript
const dbBugReport = {
  // ... other fields
  steps_to_reproduce: bugReportData.stepsToReproduce || null, // ❌ Column doesn't exist
  expected_behavior: bugReportData.expectedBehavior || null,   // ❌ Column doesn't exist
  actual_behavior: bugReportData.actualBehavior || null,      // ❌ Column doesn't exist
  // Missing device_info, tags, is_duplicate, duplicate_of
};
```

### After (Working Solution):
```typescript
// Combine all structured data into the description field
let fullDescription = bugReportData.description;

if (bugReportData.stepsToReproduce) {
  fullDescription += `\n\n**Steps to Reproduce:**\n${bugReportData.stepsToReproduce}`;
}

if (bugReportData.expectedBehavior) {
  fullDescription += `\n\n**Expected Behavior:**\n${bugReportData.expectedBehavior}`;
}

if (bugReportData.actualBehavior) {
  fullDescription += `\n\n**Actual Behavior:**\n${bugReportData.actualBehavior}`;
}

const dbBugReport = {
  // ... other fields
  description: fullDescription,                    // ✅ Structured data preserved
  device_info: bugReportData.systemInfo?.deviceInfo || null, // ✅ Added missing field
  tags: null,                                      // ✅ Added missing field
  is_duplicate: false,                             // ✅ Added missing field
  duplicate_of: null,                              // ✅ Added missing field
  // Removed non-existent columns
};
```

## Testing Results

### Before Fix:
```
❌ Database insertion failed: {
  code: 'PGRST204',
  message: "Could not find the 'actual_behavior' column of 'bug_reports' in the schema cache"
}
```

### After Fix:
```
✅ Database insertion successful!
📄 Inserted data ID: afe53822-6f76-4af8-a668-336f6ae68c57
```

## Production Impact

### Screenshot Capture ✅
- Native screen capture is working perfectly
- Files are being captured successfully (329KB PNG confirmed)
- No more OKLCH color function errors

### Database Storage ✅
- Bug reports now save successfully to the database
- All form data is preserved in the structured description field
- Reporter information and system info is captured properly

### File Upload 📝
- Storage upload has separate RLS policy issues (already addressed in previous fixes)
- Database insertion works regardless of screenshot upload status

## Files Modified

1. **`TMS-PASSENGER/app/api/bug-reports/route.ts`**
   - Fixed database schema mismatch
   - Combined structured fields into description
   - Added missing required columns

2. **Test Files Created:**
   - `test-bug-api-production.js` - Identified the schema issue
   - `check-bug-reports-schema.js` - Analyzed actual database structure
   - `test-fixed-api.js` - Confirmed the fix works

## Deployment Status

✅ **Build completed successfully** - No compilation errors
✅ **API schema fixed** - Matches actual database structure  
✅ **Screenshot capture working** - Native browser APIs functional
✅ **Ready for production deployment**

## Next Steps

1. Deploy the updated code to production
2. Test bug report submission end-to-end
3. Verify screenshots are uploaded and accessible (separate from database insertion)

The 500 error should now be resolved, and users can successfully submit bug reports with screenshots.
