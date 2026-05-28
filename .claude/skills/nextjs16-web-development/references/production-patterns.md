# Production Patterns from MyJKKN

Real-world caching patterns extracted from a production Next.js 16 application managing 10,000+ students across multiple institutions.

---

## Overview

MyJKKN is an educational institution management system built with Next.js 16, Supabase, and Cache Components. This document showcases battle-tested patterns for:

- Cache profile systems
- Hierarchical cache tags
- The "extract and pass" pattern for dynamic APIs
- Cache invalidation strategies
- Module-based data layer organization

---

## Architecture Principles

### 1. Standardized Cache Profiles

Instead of hardcoding cache durations everywhere, create reusable profiles based on data volatility:

```typescript
// lib/cache/cache-profiles.ts
/**
 * HOT DATA - 1 minute TTL
 *
 * Use for:
 * - Real-time payment status
 * - Live attendance tracking
 * - Active session data
 * - Current user state
 */
export const cacheProfileHot = {
  stale: 60,        // 1 minute - Data considered stale after 60 seconds
  revalidate: 300,  // 5 minutes - Revalidate in background
  expire: 600       // 10 minutes - Hard expiration
}

/**
 * WARM DATA - 5 minutes TTL
 *
 * Use for:
 * - Billing invoices
 * - Student bills
 * - Receipts
 * - Student profiles (frequently accessed)
 * - Staff records
 * - Active timetables
 */
export const cacheProfileWarm = {
  stale: 300,       // 5 minutes
  revalidate: 900,  // 15 minutes
  expire: 1800      // 30 minutes
}

/**
 * COLD DATA - 1 hour TTL
 *
 * Use for:
 * - Institutions
 * - Departments
 * - Programs
 * - Degrees
 * - Courses (master data)
 * - Resource categories
 */
export const cacheProfileCold = {
  stale: 3600,      // 1 hour
  revalidate: 7200, // 2 hours
  expire: 14400     // 4 hours
}

/**
 * STATIC DATA - 1 day TTL
 *
 * Use for:
 * - Academic periods (rarely change)
 * - Semesters
 * - Academic years
 * - Leave types
 * - Regulations
 * - System configurations
 */
export const cacheProfileStatic = {
  stale: 86400,     // 1 day
  revalidate: 172800, // 2 days
  expire: 604800    // 7 days
}

export const cacheProfiles = {
  hot: cacheProfileHot,
  warm: cacheProfileWarm,
  cold: cacheProfileCold,
  static: cacheProfileStatic
} as const

export function getCacheProfile(profile: keyof typeof cacheProfiles) {
  return cacheProfiles[profile]
}
```

**Benefits:**
- Consistent caching strategy across the team
- Self-documenting code (profile name indicates data volatility)
- Easy to tune performance globally
- Type-safe profile selection

---

## 2. Hierarchical Cache Tag System

Organize cache tags by module with builder functions for consistency:

```typescript
// lib/cache/cache-tags.ts
export const CACHE_TAG_PREFIXES = {
  // Academic Module
  ACADEMIC_YEARS: 'academic-years',
  TIMETABLES: 'timetables',
  ATTENDANCE: 'attendance',
  LEAVES: 'leaves',

  // Billing Module
  INVOICES: 'invoices',
  RECEIPTS: 'receipts',
  REFUNDS: 'refunds',
  BILLS: 'bills',

  // Learners Module
  LEARNER_PROFILES: 'learner-profiles',
  ENQUIRIES: 'enquiries',
  ALUMNI: 'alumni',

  // Organizations Module
  INSTITUTIONS: 'institutions',
  DEPARTMENTS: 'departments',
  PROGRAMS: 'programs',
  DEGREES: 'degrees',
  SEMESTERS: 'semesters',
  SECTIONS: 'sections',
  COURSES: 'courses',
} as const

export const cacheTags = {
  billing: {
    invoices: {
      list: () => 'invoices',
      byId: (id: string) => `invoices-${id}`,
      byStudent: (studentId: string) => `invoices-student-${studentId}`,
      byInstitution: (institutionId: string) => `invoices-institution-${institutionId}`
    },
    receipts: {
      list: () => 'receipts',
      byId: (id: string) => `receipts-${id}`,
      byStudent: (studentId: string) => `receipts-student-${studentId}`
    },
    refunds: {
      list: () => 'refunds',
      byId: (id: string) => `refunds-${id}`,
      byStudent: (studentId: string) => `refunds-student-${studentId}`
    }
  },

  learners: {
    profiles: {
      list: () => 'learner-profiles',
      byId: (id: string) => `learner-profiles-${id}`,
      bySection: (sectionId: string) => `learner-profiles-section-${sectionId}`,
      byInstitution: (institutionId: string) => `learner-profiles-institution-${institutionId}`,
      byStatus: (status: string) => `learner-profiles-status-${status}`
    },
    enquiries: {
      list: () => 'enquiries',
      byId: (id: string) => `enquiries-${id}`,
      byStatus: (status: string) => `enquiries-status-${status}`
    }
  },

  academic: {
    timetables: {
      list: () => 'timetables',
      byId: (id: string) => `timetables-${id}`,
      bySection: (sectionId: string) => `timetables-section-${sectionId}`,
      byFaculty: (staffId: string) => `timetables-faculty-${staffId}`,
      conflicts: () => 'timetables-conflicts'
    },
    attendance: {
      list: () => 'attendance',
      bySection: (sectionId: string) => `attendance-section-${sectionId}`,
      byDate: (date: string) => `attendance-date-${date}`,
      dashboard: () => 'attendance-dashboard'
    }
  },

  organizations: {
    institutions: {
      list: () => 'institutions',
      byId: (id: string) => `institutions-${id}`,
      hierarchy: () => 'institutions-hierarchy'
    },
    sections: {
      list: () => 'sections',
      byId: (id: string) => `sections-${id}`,
      byProgram: (programId: string) => `sections-program-${programId}`,
      students: (sectionId: string) => `sections-${sectionId}-students`
    },
    degrees: {
      list: () => 'degrees',
      byId: (id: string) => `degrees-${id}`,
      byInstitution: (institutionId: string) => `degrees-institution-${institutionId}`,
      byType: (degreeType: string) => `degrees-type-${degreeType}`
    }
  },

  users: {
    list: () => 'users',
    byId: (id: string) => `users-${id}`,
    roles: () => 'roles',
    roleById: (roleId: string) => `roles-${roleId}`
  },

  dashboard: {
    widgets: () => 'widgets',
    configurations: () => 'dashboard-configurations',
    userConfig: (userId: string) => `dashboard-user-${userId}`
  }
}
```

**Benefits:**
- Type-safe tag generation
- Standardized naming conventions
- Easy to find all tags for a module
- Prevents typos and inconsistencies

---

## 3. Cache Invalidation Helpers

Create helpers to invalidate related caches together:

```typescript
// lib/cache/cache-tags.ts (continued)
export const cacheInvalidation = {
  /**
   * Invalidate all caches related to a student
   */
  student: (studentId: string) => [
    cacheTags.learners.profiles.byId(studentId),
    cacheTags.billing.invoices.byStudent(studentId),
    cacheTags.billing.bills.byStudent(studentId),
    cacheTags.billing.receipts.byStudent(studentId)
  ],

  /**
   * Invalidate all caches related to a section
   */
  section: (sectionId: string) => [
    cacheTags.organizations.sections.byId(sectionId),
    cacheTags.organizations.sections.students(sectionId),
    cacheTags.learners.profiles.bySection(sectionId),
    cacheTags.academic.timetables.bySection(sectionId),
    cacheTags.academic.attendance.bySection(sectionId),
    cacheTags.organizations.courses.mappingBySection(sectionId)
  ],

  /**
   * Invalidate all caches related to an institution
   */
  institution: (institutionId: string) => [
    cacheTags.organizations.institutions.byId(institutionId),
    cacheTags.organizations.departments.byInstitution(institutionId),
    cacheTags.learners.profiles.byInstitution(institutionId),
    cacheTags.staff.byInstitution(institutionId),
    cacheTags.billing.invoices.byInstitution(institutionId),
    cacheTags.academic.years.byInstitution(institutionId)
  ],

  /**
   * Invalidate all caches related to a timetable
   */
  timetable: (timetableId: string, sectionId: string, facultyIds: string[]) => [
    cacheTags.academic.timetables.byId(timetableId),
    cacheTags.academic.timetables.bySection(sectionId),
    ...facultyIds.map(id => cacheTags.academic.timetables.byFaculty(id)),
    cacheTags.academic.timetables.conflicts(),
    cacheTags.academic.attendance.bySection(sectionId)
  ]
}
```

**Usage in Server Actions:**

```typescript
'use server'

import { updateTag } from 'next/cache'
import { cacheInvalidation } from '@/lib/cache'

export async function updateStudent(studentId: string, data) {
  await db.students.update({ where: { id: studentId }, data })

  // Invalidate all related caches instantly
  cacheInvalidation.student(studentId).forEach(tag => updateTag(tag))
}

export async function deleteSection(sectionId: string) {
  await db.sections.delete({ where: { id: sectionId } })

  // Invalidate section and all dependent caches
  cacheInvalidation.section(sectionId).forEach(tag => updateTag(tag))
}
```

---

## 4. The "Extract and Pass" Pattern

**Problem**: Can't access cookies/headers inside cached functions.

**Solution**: Extract values outside cached scope, pass as arguments.

### Example 1: Dashboard with User Data

```typescript
// app/(routes)/dashboard/_data/get-dashboard-data.ts
'use server'

import { cookies } from 'next/headers'
import { cacheLife, cacheTag } from 'next/cache'
import { getCacheProfile, cacheTags } from '@/lib/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'

/**
 * Get current user ID - NOT cached
 * This must run outside of cache scope to access cookies()
 */
async function getUserId(): Promise<string | null> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id || null
}

/**
 * Get current user data - Cached version
 * Uses hot cache profile (1 minute) since user data changes frequently
 * Note: userId must be passed in, cannot use cookies() inside cache
 */
async function getCurrentUserCached(userId: string) {
  'use cache'
  cacheLife(getCacheProfile('hot'))
  cacheTag(cacheTags.users.byId(userId))

  const supabase = await createServerSupabaseClient()

  const { data: profileData } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', userId)
    .single()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return null

  return {
    id: user.id,
    email: user.email,
    fullName: profileData?.full_name || user.email?.split('@')[0] || 'User'
  }
}

/**
 * Public API - Wrapper function
 * Handles cookies outside of cache scope
 */
export async function getCurrentUser() {
  const userId = await getUserId() // Extract userId from cookies
  if (!userId) return null
  return getCurrentUserCached(userId) // Pass to cached function
}
```

### Example 2: Dashboard Configurations

```typescript
/**
 * Get dashboard configurations for current user - Cached version
 * Uses warm cache profile (5 minutes)
 */
async function getDashboardConfigurationsCached(userId: string) {
  'use cache'
  cacheLife(getCacheProfile('warm'))
  cacheTag(cacheTags.dashboard.userConfig(userId))
  cacheTag(cacheTags.dashboard.configurations())

  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('dashboard_configurations')
    .select(`
      *,
      dashboard_widgets (
        *,
        widget_type:dashboard_widget_types (*)
      )
    `)
    .eq('user_id', userId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[dashboard] Error fetching configurations:', error)
    return []
  }

  return data || []
}

/**
 * Public API - Wrapper function
 */
export async function getDashboardConfigurations() {
  const userId = await getUserId() // Extract from cookies
  if (!userId) return []
  return getDashboardConfigurationsCached(userId) // Pass to cache
}
```

**Pattern Summary:**
1. Create `getUserId()` helper that accesses cookies (no cache)
2. Create `*Cached(userId)` function with `'use cache'` directive
3. Create public wrapper that extracts userId and calls cached version
4. userId becomes part of cache key automatically

---

## 5. Module-Based Data Layer

Organize data fetching functions by feature module:

```
app/
└── (routes)/
    ├── billing/
    │   ├── invoices/
    │   │   ├── _data/
    │   │   │   ├── get-invoices.ts      # Cached list function
    │   │   │   └── get-invoice.ts       # Cached detail function
    │   │   ├── _components/
    │   │   │   ├── invoices-table-server.tsx
    │   │   │   ├── invoices-filters-client.tsx
    │   │   │   └── invoices-pagination-client.tsx
    │   │   └── page.tsx
    │   └── receipts/
    │       └── _data/
    │           ├── get-receipts.ts
    │           └── get-receipt.ts
    └── learners/
        └── profiles/
            ├── _data/
            │   ├── get-learner-profiles.ts
            │   └── get-learner-profile.ts
            └── page.tsx
```

### Example: Billing Invoices Data Layer

```typescript
// app/(routes)/billing/invoices/_data/get-invoices.ts
'use cache'

import { createClient } from '@/lib/supabase/server'
import { cacheLife, cacheTag } from 'next/cache'
import { getCacheProfile, cacheTags } from '@/lib/cache'
import type { BillingInvoice, InvoiceFilters } from '@/types/billing-schedule'

interface GetInvoicesResult {
  data: BillingInvoice[]
  metadata: {
    total: number
    page: number
    limit: number
    totalPages: number
  }
}

/**
 * Get invoices with server-side caching
 *
 * Cache Strategy: WARM (5 minutes TTL)
 * - Financial data needs to be fairly fresh
 * - Cache tags allow targeted invalidation when invoices are created/updated
 */
export async function getInvoices(
  filters: InvoiceFilters = {}
): Promise<GetInvoicesResult> {
  // Apply cache profile for warm data (5 minutes)
  cacheLife(getCacheProfile('warm'))

  // Add cache tags for invalidation
  cacheTag(cacheTags.billing.invoices.list())
  if (filters.institution_id) {
    cacheTag(cacheTags.billing.invoices.byInstitution(filters.institution_id))
  }
  if (filters.student_id) {
    cacheTag(cacheTags.billing.invoices.byStudent(filters.student_id))
  }

  const supabase = await createClient()

  // Build query with relations
  let query = supabase.from('billing_invoices').select(
    `
      *,
      student:students(
        id,
        first_name,
        last_name,
        roll_number,
        college_email
      ),
      institution:institutions(
        id,
        name,
        counselling_code
      ),
      invoice_items:billing_invoice_items(
        id,
        receipt_id,
        amount,
        receipt:billing_receipts(
          id,
          receipt_number,
          payment_amount
        )
      )
    `,
    { count: 'exact' }
  )

  // Apply filters (search, student_id, institution_id, etc.)
  if (filters.search) {
    query = query.or(
      `invoice_number.ilike.%${filters.search}%,invoice_description.ilike.%${filters.search}%`
    )
  }

  if (filters.student_id) {
    query = query.eq('student_id', filters.student_id)
  }

  if (filters.institution_id) {
    query = query.eq('institution_id', filters.institution_id)
  }

  // Apply sorting
  const sortBy = filters.sortBy || 'created_at'
  const sortDirection = filters.sortDirection || 'desc'
  query = query.order(sortBy, { ascending: sortDirection === 'asc' })

  // Apply pagination
  const page = filters.page || 1
  const limit = filters.limit || 10
  const from = (page - 1) * limit
  const to = from + limit - 1

  query = query.range(from, to)

  // Execute query
  const { data, count, error } = await query

  if (error) {
    console.error('[getInvoices] Error fetching invoices:', error)
    throw new Error(`Failed to fetch invoices: ${error.message}`)
  }

  return {
    data: (data as BillingInvoice[]) || [],
    metadata: {
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit)
    }
  }
}
```

**Key Features:**
- File-level `'use cache'` directive
- Documented cache strategy in comments
- Granular cache tags based on filters
- Type-safe filters and return types
- Error handling with module prefix in logs
- Pagination metadata included

---

## 6. Complete Module Example

Here's how all patterns come together:

### Data Layer
```typescript
// app/(routes)/learners/profiles/_data/get-learner-profiles.ts
'use cache'

import { createClient } from '@/lib/supabase/server'
import { cacheLife, cacheTag } from 'next/cache'
import { getCacheProfile, cacheTags } from '@/lib/cache'

export async function getLearnerProfiles(params = {}) {
  cacheLife(getCacheProfile('warm'))

  // Granular cache tags
  cacheTag(cacheTags.learners.profiles.list())
  if (params.lifecycle_status) {
    cacheTag(cacheTags.learners.profiles.byStatus(params.lifecycle_status))
  }
  if (params.section_id) {
    cacheTag(cacheTags.learners.profiles.bySection(params.section_id))
  }

  // ... data fetching logic
}
```

### Server Component (Page)
```typescript
// app/(routes)/learners/profiles/page.tsx
import { Suspense } from 'react'
import { getLearnerProfiles } from './_data/get-learner-profiles'
import { ProfilesTableServer } from './_components/profiles-table-server'

export default async function ProfilesPage({ searchParams }) {
  const params = await searchParams

  return (
    <div>
      <h1>Learner Profiles</h1>

      <Suspense fallback={<TableSkeleton />}>
        <ProfilesList searchParams={params} />
      </Suspense>
    </div>
  )
}

async function ProfilesList({ searchParams }) {
  const data = await getLearnerProfiles(searchParams)

  return <ProfilesTableServer data={data} />
}
```

### Server Actions
```typescript
// app/_actions/learners.ts
'use server'

import { updateTag } from 'next/cache'
import { cacheInvalidation, cacheTags } from '@/lib/cache'
import { revalidatePath } from 'next/cache'

export async function updateLearnerProfile(profileId: string, data) {
  // Update database
  const updated = await db.learnerProfiles.update({
    where: { id: profileId },
    data
  })

  // Invalidate related caches
  updateTag(cacheTags.learners.profiles.byId(profileId))
  updateTag(cacheTags.learners.profiles.list())

  if (updated.section_id) {
    updateTag(cacheTags.learners.profiles.bySection(updated.section_id))
  }

  // Revalidate the page
  revalidatePath('/learners/profiles')

  return { success: true }
}
```

---

## Summary

These production patterns from MyJKKN demonstrate:

1. **Standardization**: Cache profiles ensure consistent caching across modules
2. **Organization**: Hierarchical cache tags group related caches
3. **Type Safety**: Builder functions prevent typos and provide autocomplete
4. **Maintainability**: Clear separation between cached and uncached logic
5. **Performance**: Granular invalidation only updates necessary caches
6. **Developer Experience**: Self-documenting code with inline comments

Apply these patterns to build scalable, performant Next.js 16 applications! 🚀
