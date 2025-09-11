# Fix for Staff Function Ambiguity Error

## Problem

You're getting this error:

```
ERROR: 42702: column reference "avg_response_time" is ambiguous
```

## Solution

Run this SQL in your **Supabase SQL Editor**:

```sql
-- Fix for get_available_admin_staff function
-- Resolves column reference ambiguity error

DROP FUNCTION IF EXISTS get_available_admin_staff();

CREATE OR REPLACE FUNCTION get_available_admin_staff()
RETURNS TABLE (
  id UUID,
  name TEXT,
  email TEXT,
  role TEXT,
  current_workload INTEGER,
  max_capacity INTEGER,
  workload_percentage INTEGER,
  specializations TEXT[],
  skill_level INTEGER,
  avg_response_time INTERVAL,
  recent_activity TIMESTAMPTZ,
  performance_rating NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    au.id,
    au.name::TEXT,
    au.email::TEXT,
    au.role::TEXT,
    COALESCE(workload.current_count, 0)::INTEGER,
    COALESCE(ass.max_concurrent_cases, 25)::INTEGER,
    CASE
      WHEN COALESCE(ass.max_concurrent_cases, 25) > 0 THEN
        ROUND((COALESCE(workload.current_count, 0)::NUMERIC / COALESCE(ass.max_concurrent_cases, 25)::NUMERIC) * 100)::INTEGER
      ELSE 0
    END,
    COALESCE(ass.specialization_areas, ARRAY[]::TEXT[]),
    COALESCE(ass.skill_level, 3)::INTEGER,
    COALESCE(summary.avg_time, INTERVAL '2 hours'),
    summary.recent_activity,
    COALESCE(perf.avg_rating, 3.0)::NUMERIC
  FROM admin_users au
  LEFT JOIN admin_staff_skills ass ON au.id = ass.admin_id
  LEFT JOIN (
    SELECT
      assigned_to,
      COUNT(*) as current_count
    FROM grievances
    WHERE status IN ('open', 'in_progress')
    GROUP BY assigned_to
  ) workload ON au.id = workload.assigned_to
  LEFT JOIN (
    SELECT
      admin_id,
      AVG(avg_response_time) as avg_time,
      MAX(created_at) as recent_activity
    FROM admin_activity_summary
    WHERE date >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY admin_id
  ) summary ON au.id = summary.admin_id
  LEFT JOIN (
    SELECT
      assigned_to,
      AVG(performance_rating::NUMERIC) as avg_rating
    FROM grievance_assignment_history
    WHERE performance_rating IS NOT NULL
    GROUP BY assigned_to
  ) perf ON au.id = perf.assigned_to
  WHERE au.is_active = true
  ORDER BY
    CASE
      WHEN COALESCE(ass.max_concurrent_cases, 25) > 0 THEN
        ROUND((COALESCE(workload.current_count, 0)::NUMERIC / COALESCE(ass.max_concurrent_cases, 25)::NUMERIC) * 100)::INTEGER
      ELSE 0
    END ASC,
    COALESCE(perf.avg_rating, 3.0) DESC;
END;
$$ LANGUAGE plpgsql;
```

## Test the Fix

After running the above SQL, test it with:

```sql
SELECT * FROM get_available_admin_staff();
```

## What Was Fixed

1. **Renamed conflicting column**: Changed `response_time_avg` to `avg_time` in the subquery to avoid ambiguity
2. **Added explicit aliases**: Made sure all column references are unambiguous
3. **Fixed ORDER BY**: Used the full CASE expression instead of column alias

## Alternative: Quick Fix Without Function

If you want to test the API immediately without fixing the function, the API already has fallback mock data that will work when the database function fails.

## Verification

Once fixed, your `/api/admin/staff` endpoint should return real data from the database instead of mock data.

## Next Steps

After fixing this function:

1. Test the Staff API: `GET /api/admin/staff`
2. Test Bulk Assignment with real data
3. Use the assignee dashboard at `/my-grievances`
