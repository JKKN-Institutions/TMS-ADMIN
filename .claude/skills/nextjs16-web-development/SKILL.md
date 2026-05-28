---
name: nextjs16-web-development
description: Comprehensive Next.js 16 web development skill covering Cache Components, Server Actions, Turbopack, PPR, and React 19.2 patterns. Use when building full-stack Next.js 16 applications, implementing CRUD features with optimal caching strategies, creating forms with Server Actions, setting up new projects with standardized architecture, or migrating from Next.js 15. Covers complete workflow from database design with Supabase RLS to production deployment with TypeScript, Zod validation, and modern React patterns. Automatically triggers for Next.js 16 project setup, module development, caching optimization, or team workflow standardization.
---

# Next.js 16 Web Development

Complete production-ready workflow for building modern Next.js 16 applications with optimal performance, security, and developer experience.

## 🎯 Two-Module Architecture

This skill is organized into **two integrated modules** that work together in a unified workflow:

### 📱 Frontend Module (`modules/01-frontend/`)
Production-ready admin dashboard patterns and UI components:
- **Layout System**: AppSidebar, Header, PageContainer with RBAC navigation
- **Form Components**: 12 standardized form types with React Hook Form + Zod
- **Data Tables**: TanStack Table v8 with URL state management (Nuqs)
- **Authentication**: Supabase Auth integration with SSR
- **Theme System**: Dark/light mode with next-themes
- **Command Palette**: Global search with kbar (Cmd+K)
- **Charts & Analytics**: Recharts wrappers for dashboards
- **Drag & Drop**: dnd-kit for Kanban boards and sortable lists
- **File Upload**: React Dropzone with validation

### ⚙️ Backend Module (`modules/02-backend/`)
Server-side data patterns with optimal caching:
- **Cache Components**: 10 production patterns for `use cache` directive
- **Server Actions**: Form handling, mutations, and cache invalidation
- **Database Layer**: Supabase integration with Row Level Security
- **Cache Strategies**: Hot/Warm/Cold/Static profiles from production (MyJKKN)
- **Cache Invalidation**: Hierarchical tag system with `updateTag()`
- **Type Safety**: Zod schemas and TypeScript strict mode

### 🔄 Unified Workflow

**Complete Development Flow:**
1. **Dashboard Setup** (Frontend) → Initialize layout, auth, navigation
2. **Module Development** (Frontend + Backend) → Build CRUD features with both UI and data layers
3. **Deployment** → Production-ready Next.js 16 application

Each feature module uses **both** Frontend patterns (forms, tables, layouts) and Backend patterns (cached data, server actions, database).

## 🚨 CRITICAL: Read Error Prevention Guide First

**BEFORE implementing ANY features**, read the [Error Prevention Guide](references/error-prevention-guide.md) to avoid the THREE MOST COMMON ERRORS that occur repeatedly in Next.js 16:

1. **Uncached data accessed outside of <Suspense>** - Blocks entire page render
2. **cookies()/headers() inside 'use cache'** - Architectural violation
3. **searchParams accessed without await** - Promise must be unwrapped

These are NOT bugs - they're architectural requirements. The Error Prevention Guide shows exactly what NOT to do and the correct patterns to use.

## Core Paradigm Shift

**Next.js 15**: Static by default → opt into dynamic
**Next.js 16**: Dynamic by default → opt into caching with `use cache`

This fundamental shift provides fine-grained control over caching at the function level rather than page level.

## When to Use This Skill

Use this skill when:

- **Setting up admin dashboards** with production-ready layout, navigation, and auth
- **Starting a new Next.js 16 project** with proper configuration and structure
- **Building CRUD modules** with optimal caching and Server Actions
- **Implementing forms** with validation, error handling, and optimistic updates
- **Creating data tables** with server-side search, filtering, and pagination
- **Integrating Supabase Auth** with SSR and role-based access control
- **Optimizing performance** with Cache Components and PPR
- **Designing database schemas** with Supabase and Row Level Security
- **Migrating from Next.js 15** to Next.js 16 architecture
- **Standardizing team workflows** for consistent Next.js 16 development
- **Creating real-time features** with appropriate cache strategies

### Quick Start Paths

**Path 1: Admin Dashboard** → Use Frontend Module to set up layout, auth, and navigation first
**Path 2: Feature Module** → Use Backend Module for data patterns, then Frontend Module for UI
**Path 3: Full Project** → Start with `workflows/complete-workflow.md` for end-to-end guidance

## Quick Decision Framework

### Caching Strategy

```
Is the data user-specific?
├─ YES → Is it personalized but cacheable?
│  ├─ YES → 'use cache: private' + appropriate cacheLife
│  └─ NO → Don't cache (use runtime APIs like cookies)
└─ NO → How often does it change?
   ├─ Real-time → No cache
   ├─ Seconds → 'use cache' + cacheLife('realtime' or 'seconds')
   ├─ Minutes → 'use cache' + cacheLife('frequent' or 'minutes')
   ├─ Hours → 'use cache' + cacheLife('moderate' or 'hours')
   ├─ Days → 'use cache' + cacheLife('days')
   └─ Rarely → 'use cache' + cacheLife('weeks' or 'static')
```

### Cache Invalidation Strategy

```
User expects instant update?
├─ YES → updateTag() - Instant invalidation
└─ NO → revalidateTag() - Background refresh
```

- **updateTag**: Use for INSTANT updates when users expect immediate feedback (save, delete, update)
- **revalidateTag**: Use for BACKGROUND updates where slight delays are acceptable (periodic syncs)

### Server Actions vs Route Handlers

```
Need to handle form submission?
├─ YES → Server Action
└─ NO → Building API for external use?
   ├─ YES → Route Handler
   └─ NO → Server Action
```

**Use Server Actions for:**

- Form submissions
- CRUD operations (create/update/delete)
- Mutations with CSRF protection
- Progressive enhancement

**Use Route Handlers for:**

- External webhooks
- REST/GraphQL APIs for external consumers
- File downloads
- Specific HTTP method requirements

## Project Initialization Workflow

### 1. Create Next.js 16 Project

```bash
# Initialize with Turbopack
npx create-next-app@latest project-name --typescript --tailwind --app --turbopack

# Install core dependencies
npm install @supabase/supabase-js @supabase/ssr
npm install zod react-hook-form @hookform/resolvers
npm install date-fns clsx tailwind-merge lucide-react
```

### 2. Configure Next.js 16 (Critical)

Enable Cache Components in `next.config.ts`:

```typescript
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true, // Enable PPR and use cache

  cacheLife: {
    // Predefined profiles with stale, revalidate, expire
    default: {
      stale: 300,       // 5 minutes - Client considers data stale
      revalidate: 900,  // 15 minutes - Server background refresh
      expire: 3600      // 1 hour - Hard expiration
    },

    // Production-grade cache profiles (based on MyJKKN patterns)
    hot: {
      stale: 60,        // 1 minute - Real-time data (payments, sessions)
      revalidate: 300,  // 5 minutes - Background refresh
      expire: 600       // 10 minutes - Hard expiration
    },
    warm: {
      stale: 300,       // 5 minutes - Moderate freshness (invoices, profiles)
      revalidate: 900,  // 15 minutes - Background refresh
      expire: 1800      // 30 minutes - Hard expiration
    },
    cold: {
      stale: 3600,      // 1 hour - Master data (institutions, departments)
      revalidate: 7200, // 2 hours - Background refresh
      expire: 14400     // 4 hours - Hard expiration
    },
    static: {
      stale: 86400,     // 1 day - Configuration data
      revalidate: 172800, // 2 days - Background refresh
      expire: 604800    // 7 days - Hard expiration
    },

    // Short-hand profiles (for simple cases)
    seconds: { stale: 5, revalidate: 15, expire: 30 },
    minutes: { stale: 60, revalidate: 180, expire: 300 },
    hours: { stale: 3600, revalidate: 7200, expire: 14400 },
    days: { stale: 86400, revalidate: 172800, expire: 604800 },
    weeks: { stale: 604800, revalidate: 1209600, expire: 2592000 },
    max: {
      stale: Number.MAX_SAFE_INTEGER,
      revalidate: Number.MAX_SAFE_INTEGER,
      expire: Number.MAX_SAFE_INTEGER
    },
  },
}

export default nextConfig
```

**Understanding cacheLife parameters:**
- **stale**: Client-side cache duration (minimum 30s enforced by Next.js)
- **revalidate**: Server-side background refresh interval
- **expire**: Hard expiration - data MUST be refetched after this time

### 3. Standard Project Structure

```
app/
├── (auth)/              # Auth routes group
├── (dashboard)/         # Protected routes group
├── actions/             # Server Actions by module
├── api/                 # API routes (webhooks only)
lib/
├── supabase/           # Supabase clients (server.ts, client.ts)
├── data/               # Cached data fetching functions
├── validations/        # Zod schemas
├── utils/              # Utilities (cn.ts, format.ts)
components/
├── ui/                 # Shadcn/UI components
├── shared/             # Shared components
├── forms/              # Form components
types/                  # TypeScript types
config/                 # App configuration
```

## Core Patterns

### Pattern 0: Deferring to Request Time with connection()

For non-deterministic operations that should NOT be cached (random values, timestamps, UUIDs):

```typescript
import { connection } from 'next/server'

export default async function Page() {
  // Explicitly defer to request time
  await connection()

  // Now safe to use non-deterministic operations
  const random = Math.random()
  const timestamp = Date.now()
  const uuid = crypto.randomUUID()
  const randomBytes = crypto.getRandomValues(new Uint8Array(16))

  return (
    <div>
      <p>Random: {random}</p>
      <p>Time: {timestamp}</p>
      <p>UUID: {uuid}</p>
    </div>
  )
}
```

**When to use connection():**
- Math.random() or crypto.getRandomValues()
- Date.now() or new Date()
- crypto.randomUUID()
- Any operation that should produce different results per request
- When you need dynamic rendering without accessing cookies/headers

**Note**: `connection()` replaces `unstable_noStore` from Next.js 14/15.

### Pattern 1: Cached Data Fetching

```typescript
// lib/data/products.ts
import { cacheTag, cacheLife } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function getProducts(filters?: ProductFilters) {
  'use cache'
  cacheLife('hours')  // or 'minutes', 'days', 'weeks'
  cacheTag('products') // for invalidation

  const supabase = await createServerSupabaseClient()

  let query = supabase
    .from('products')
    .select('*, category:categories(name)', { count: 'exact' })

  // Apply filters
  if (filters?.search) {
    query = query.textSearch('name', filters.search)
  }

  const { data, error, count } = await query
  if (error) throw error

  return { data: data || [], total: count || 0 }
}
```

### Pattern 2: Server Actions for Mutations

```typescript
// app/actions/products.ts
'use server'

import { updateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { CreateProductSchema } from '@/types/product'

export async function createProduct(
  prevState: FormState,
  formData: FormData
): Promise<FormState> {
  // Validate input
  const validation = CreateProductSchema.safeParse({
    name: formData.get('name'),
    price: formData.get('price'),
    stock_quantity: formData.get('stock_quantity'),
  })

  if (!validation.success) {
    return {
      errors: validation.error.flatten().fieldErrors,
      message: 'Invalid fields. Please check the form.',
    }
  }

  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('products')
    .insert([validation.data])
    .select()
    .single()

  if (error) {
    return { message: 'Database error: Failed to create product.' }
  }

  // Instant cache invalidation
  updateTag('products')

  redirect(`/products/${data.id}`)
}
```

### Pattern 3: Streaming with Suspense

```tsx
// app/(dashboard)/dashboard/page.tsx
import { Suspense } from 'react'

export default async function DashboardPage() {
  return (
    <div>
      {/* Static shell - instant */}
      <DashboardHeader />

      {/* Long-lived cache */}
      <Suspense fallback={<StatsSkeleton />}>
        <StaticStats />
      </Suspense>

      {/* Medium cache */}
      <Suspense fallback={<ChartsSkeleton />}>
        <AnalyticsCharts />
      </Suspense>

      {/* No cache - real-time */}
      <Suspense fallback={<LiveSkeleton />}>
        <LiveMetrics />
      </Suspense>
    </div>
  )
}

async function StaticStats() {
  'use cache'
  cacheLife('days')
  cacheTag('static-stats')

  const stats = await getStaticStatistics()
  return <StatsGrid data={stats} />
}
```

### Pattern 4: Form with Validation & Error Handling

```tsx
// components/forms/product-form.tsx
'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { createProduct } from '@/app/actions/products'

export function ProductForm({ product, categories }) {
  const action = product
    ? updateProduct.bind(null, product.id)
    : createProduct

  const [state, formAction] = useActionState(action, {})

  return (
    <form action={formAction} className="space-y-6">
      {state.message && (
        <div className={state.success ? 'alert-success' : 'alert-error'}>
          {state.message}
        </div>
      )}

      <div>
        <label htmlFor="name">Product Name *</label>
        <input
          id="name"
          name="name"
          type="text"
          defaultValue={product?.name}
          required
          aria-invalid={!!state.errors?.name}
        />
        {state.errors?.name && (
          <p className="error">{state.errors.name[0]}</p>
        )}
      </div>

      <SubmitButton />
    </form>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending}>
      {pending ? 'Saving...' : 'Save Product'}
    </button>
  )
}
```

### Pattern 5: Optimistic Updates

```tsx
// components/optimistic-todo-list.tsx
'use client'

import { useOptimistic, startTransition } from 'react'
import { toggleTodo, deleteTodo } from '@/app/actions/todos'

export function OptimisticTodoList({ todos }) {
  const [optimisticTodos, updateOptimisticTodos] = useOptimistic(
    todos,
    (state, action) => {
      switch (action.type) {
        case 'toggle':
          return state.map(todo =>
            todo.id === action.id
              ? { ...todo, completed: !todo.completed }
              : todo
          )
        case 'delete':
          return state.filter(todo => todo.id !== action.id)
        default:
          return state
      }
    }
  )

  const handleToggle = async (id) => {
    startTransition(() => {
      updateOptimisticTodos({ type: 'toggle', id })
    })
    await toggleTodo(id)
  }

  return (
    <ul>
      {optimisticTodos.map(todo => (
        <li key={todo.id}>
          <input
            type="checkbox"
            checked={todo.completed}
            onChange={() => handleToggle(todo.id)}
          />
          <span>{todo.title}</span>
        </li>
      ))}
    </ul>
  )
}
```

### Pattern 6: Cache Key Optimization (Production Critical)

**Golden Rule**: Cache on dimensions with FEW unique values, not MANY.

#### ❌ BAD - Low cache utilization:

```typescript
// Creates 1000s of cache entries (one per user)
async function getUserDashboard(userId: string) {
  'use cache: remote'
  cacheTag(`user-${userId}`)

  // Every user gets their own cache entry = low hit rate
  return await fetchUserData(userId)
}
```

#### ✅ GOOD - High cache utilization:

```typescript
// Extract user preference, cache by language (10-50 values)
async function WelcomeMessage() {
  const language = (await cookies()).get('language')?.value || 'en'

  // All English users share the same cache entry
  const content = await getCMSContent(language)
  return <div>{content.welcome}</div>
}

async function getCMSContent(language: string) {
  'use cache: remote'
  cacheTag(`cms-${language}`)
  cacheLife({ expire: 3600 })

  // Creates ~10-50 cache entries (one per language)
  // NOT thousands (one per user)
  return cms.getContent(language)
}
```

#### Real-world optimization example:

```typescript
// ✅ Cache by category, filter price in memory
async function ProductsPage({ searchParams }) {
  const { category, minPrice } = await searchParams

  return (
    <Suspense fallback={<Loading />}>
      <ProductList category={category} minPrice={minPrice} />
    </Suspense>
  )
}

async function ProductList({ category, minPrice }) {
  // Cache only on category (few unique values: electronics, clothing, etc.)
  const products = await getCachedProducts(category)

  // Filter price in memory instead of creating cache entries
  // for every possible price value
  const filtered = minPrice
    ? products.filter(p => p.price >= parseFloat(minPrice))
    : products

  return <div>{/* render filtered products */}</div>
}

async function getCachedProducts(category: string) {
  'use cache: remote'
  cacheTag('products', `category-${category}`)
  cacheLife({ expire: 3600 })

  // High cache utilization: ~10-20 categories vs thousands of price filters
  return db.products.findByCategory(category)
}
```

**Cache utilization comparison:**
- ❌ Cache by (category + price): 20 categories × 100 price ranges = 2,000 entries
- ✅ Cache by category only: 20 entries (100x better utilization)

### Pattern 7: Production Cache Profile System (MyJKKN Pattern)

Standardize cache durations across your team with reusable profiles:

```typescript
// lib/cache/cache-profiles.ts
export const cacheProfiles = {
  hot: {
    stale: 60,        // 1 minute
    revalidate: 300,  // 5 minutes
    expire: 600       // 10 minutes
  },
  warm: {
    stale: 300,       // 5 minutes
    revalidate: 900,  // 15 minutes
    expire: 1800      // 30 minutes
  },
  cold: {
    stale: 3600,      // 1 hour
    revalidate: 7200, // 2 hours
    expire: 14400     // 4 hours
  },
  static: {
    stale: 86400,     // 1 day
    revalidate: 172800, // 2 days
    expire: 604800    // 7 days
  }
} as const

export function getCacheProfile(profile: keyof typeof cacheProfiles) {
  return cacheProfiles[profile]
}
```

**Usage in data layer:**

```typescript
// app/(routes)/billing/invoices/_data/get-invoices.ts
'use cache'

import { getCacheProfile } from '@/lib/cache'
import { cacheLife, cacheTag } from 'next/cache'

export async function getInvoices(filters) {
  // Use warm profile (5-minute freshness)
  cacheLife(getCacheProfile('warm'))
  cacheTag('invoices')

  const supabase = await createClient()
  const { data } = await supabase.from('billing_invoices').select('*')

  return data
}
```

**Profile selection guide:**
- **hot** (1 min): Payment status, active sessions, real-time notifications
- **warm** (5 min): Invoices, bills, receipts, student profiles, staff records
- **cold** (1 hour): Institutions, departments, degrees, master data
- **static** (1 day): Academic years, semesters, regulations, system config

### Pattern 8: Hierarchical Cache Tag System

Organize cache tags by module for easy invalidation:

```typescript
// lib/cache/cache-tags.ts
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
    }
  },
  learners: {
    profiles: {
      list: () => 'learner-profiles',
      byId: (id: string) => `learner-profiles-${id}`,
      bySection: (sectionId: string) => `learner-profiles-section-${sectionId}`,
      byStatus: (status: string) => `learner-profiles-status-${status}`
    }
  }
}

// Cache invalidation helpers
export const cacheInvalidation = {
  // Invalidate all student-related caches at once
  student: (studentId: string) => [
    cacheTags.learners.profiles.byId(studentId),
    cacheTags.billing.invoices.byStudent(studentId),
    cacheTags.billing.receipts.byStudent(studentId)
  ]
}
```

**Usage:**

```typescript
'use cache'

import { cacheTags } from '@/lib/cache'
import { cacheTag, cacheLife } from 'next/cache'

export async function getLearnerProfiles(params) {
  cacheLife(getCacheProfile('warm'))

  // Apply granular cache tags
  cacheTag(cacheTags.learners.profiles.list())
  if (params.section_id) {
    cacheTag(cacheTags.learners.profiles.bySection(params.section_id))
  }
  if (params.lifecycle_status) {
    cacheTag(cacheTags.learners.profiles.byStatus(params.lifecycle_status))
  }

  // ... fetch data
}
```

**Server Action invalidation:**

```typescript
'use server'

import { updateTag } from 'next/cache'
import { cacheInvalidation } from '@/lib/cache'

export async function updateStudent(studentId: string, data) {
  await db.students.update(data)

  // Invalidate all related caches instantly
  cacheInvalidation.student(studentId).forEach(tag => updateTag(tag))
}
```

### Pattern 9: "Extract and Pass" for Dynamic APIs

**The pattern**: Read cookies/headers/searchParams OUTSIDE cached scope, pass values as arguments.

```typescript
// ❌ WRONG - Build timeout or runtime error
async function Dashboard() {
  'use cache'

  const cookieStore = await cookies() // ERROR!
  const userId = cookieStore.get('userId')?.value

  return await fetchDashboard(userId)
}
```

```typescript
// ✅ CORRECT - Extract outside, pass to cached function
import { cookies } from 'next/headers'
import { Suspense } from 'react'

export default function DashboardPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Dashboard />
    </Suspense>
  )
}

// Wrapper: Reads cookies OUTSIDE cache
async function Dashboard() {
  const cookieStore = await cookies()
  const userId = cookieStore.get('userId')?.value

  if (!userId) return <div>Please log in</div>

  // Pass userId to cached function
  return <CachedDashboard userId={userId} />
}

// Cached: Receives data as argument
async function CachedDashboard({ userId }: { userId: string }) {
  'use cache'
  cacheLife(getCacheProfile('hot'))
  cacheTag(cacheTags.users.byId(userId))

  // userId is now part of the cache key
  const data = await fetchUserData(userId)
  return <DashboardView data={data} />
}
```

**Why it works**: When you pass values as arguments, they become part of the **cache key**. Different users automatically get different cache entries.

### Pattern 10: Cache Nesting Rules

Understanding which cache directives can nest inside others:

| Outer Cache | Inner Cache | Valid? | Notes |
|------------|-------------|---------|-------|
| `use cache: remote` | `use cache: remote` | ✅ YES | Remote can nest in remote |
| `use cache: remote` | `use cache` | ✅ YES | Remote can contain regular cache |
| `use cache` | `use cache: remote` | ✅ YES | Regular cache can contain remote |
| `use cache` | `use cache` | ✅ YES | Regular can nest in regular |
| `use cache: remote` | `use cache: private` | ❌ NO | **Error at runtime** |
| `use cache: private` | `use cache: remote` | ❌ NO | **Error at runtime** |
| `use cache: private` | `use cache` | ❌ NO | **Error at runtime** |

**Valid nesting example:**

```typescript
// ✅ Valid: Remote inside remote
async function outerRemote() {
  'use cache: remote'
  cacheLife({ expire: 3600 })

  const result = await innerRemote()
  return result
}

async function innerRemote() {
  'use cache: remote'
  cacheLife({ expire: 600 })
  return getData()
}
```

**Invalid nesting example:**

```typescript
// ❌ Invalid: Private inside remote
async function outerRemote() {
  'use cache: remote'

  const result = await innerPrivate() // Error!
  return result
}

async function innerPrivate() {
  'use cache: private'
  return getData()
}
```

## Type Safety with Zod

```typescript
// types/product.ts
import { z } from 'zod'

export const CreateProductSchema = z.object({
  name: z.string()
    .min(1, 'Name is required')
    .max(255, 'Name is too long'),
  price: z.coerce
    .number({ invalid_type_error: 'Price must be a number' })
    .positive('Price must be positive'),
  stock_quantity: z.coerce
    .number()
    .int('Stock must be a whole number')
    .min(0, 'Stock cannot be negative'),
})

export const UpdateProductSchema = CreateProductSchema.partial()

export type CreateProductInput = z.infer<typeof CreateProductSchema>
```

## Supabase Setup

### Server Client

```typescript
// lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createServerSupabaseClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )
}
```

### Authentication Utilities

```typescript
// lib/auth.ts
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cache } from 'react'

export const getCurrentUser = cache(async () => {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
})

export async function requireAuth() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return user
}

export async function requireRole(allowedRoles: string[]) {
  const user = await requireAuth()
  const supabase = await createServerSupabaseClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !allowedRoles.includes(profile.role)) {
    redirect('/unauthorized')
  }

  return { user, role: profile.role }
}
```

## Module Development Workflow

When building a new feature module (e.g., Products, Orders):

1. **Database Schema** - Create table with RLS policies (see `references/database-patterns.md`)
2. **Types** - Define interfaces and Zod schemas (`types/module.ts`)
3. **Data Layer** - Create cached data fetching functions (`lib/data/module.ts`)
4. **Server Actions** - Implement CRUD operations (`app/actions/module.ts`)
5. **UI Components** - Build forms and lists (`components/module/`)
6. **Pages** - Create routes with Suspense boundaries (`app/(dashboard)/module/`)

## Best Practices

### DO:

**Server-Side:**
- ✅ Enable `cacheComponents` in next.config.ts
- ✅ Use Server Actions for all mutations
- ✅ Apply `use cache` to data fetching functions
- ✅ Wrap dynamic content in Suspense boundaries
- ✅ Validate all inputs on server with Zod
- ✅ Use optimistic updates for better UX
- ✅ Implement proper RLS policies
- ✅ Use `updateTag` for instant cache updates
- ✅ Use TypeScript strict mode
- ✅ Handle errors gracefully
- ✅ Add multiple cache tags for granular invalidation
- ✅ Stream UI progressively with PPR

**Performance Optimization:**
- ✅ Import directly from specific files (avoid barrel imports)
- ✅ Use `next/dynamic` for heavy components
- ✅ Defer third-party scripts with `next/script`
- ✅ Use `Promise.all()` for parallel operations
- ✅ Memoize expensive components with `React.memo()`
- ✅ Cache calculations with `useMemo()`
- ✅ Stable callbacks with `useCallback()`
- ✅ Virtualize large lists (1000+ items)
- ✅ Write comprehensive tests (unit, integration, E2E)

### DON'T:

**Server-Side:**
- ❌ **NEVER** use cookies(), headers(), or access searchParams inside 'use cache' scopes
- ❌ **NEVER** access searchParams or params without await/React.use()
- ❌ **NEVER** fetch data without Suspense boundary OR 'use cache' directive
- ❌ **NEVER** nest `'use cache: private'` inside `'use cache: remote'` (or vice versa)
- ❌ **NEVER** cache on high-cardinality dimensions (userId, sessionId, timestamps)
- ❌ **NEVER** pass Promises to cached functions (causes build timeouts)
- ❌ Over-cache frequently changing data
- ❌ Forget Suspense boundaries for streaming
- ❌ Use Route Handlers for simple mutations
- ❌ Trust client-side validation alone
- ❌ Expose sensitive data in error messages
- ❌ Mix cached and uncached data without Suspense
- ❌ Use edge runtime with Cache Components
- ❌ Hardcode cache durations everywhere (use cache profiles)

**Performance:**
- ❌ Use barrel imports (import from `@/components/ui` instead of specific files)
- ❌ Import heavy libraries without code splitting
- ❌ Await sequentially when operations can run in parallel
- ❌ Create inline objects/arrays as props to memoized components
- ❌ Render 1000+ items without virtualization
- ❌ Skip testing Server Actions and validation logic

**Essential Guides:**
- **[Error Prevention Guide](references/error-prevention-guide.md)** - Three critical errors and fixes
- **[Production Patterns](references/production-patterns.md)** - Real-world MyJKKN examples
- **[Bundle Optimization](references/bundle-optimization.md)** - 60% smaller bundles
- **[Async Optimization](references/async-optimization.md)** - 70% faster page loads
- **[Client Optimization](modules/01-frontend/client-optimization.md)** - 85% fewer re-renders
- **[Testing Patterns](references/testing-patterns.md)** - Comprehensive testing guide

## Performance Targets

- First Contentful Paint (FCP): < 1.2s
- Largest Contentful Paint (LCP): < 2.5s
- First Input Delay (FID): < 100ms
- Cumulative Layout Shift (CLS): < 0.1
- Time to First Byte (TTFB): < 600ms

## Migration from Next.js 15

### Replace Route Segment Config

```typescript
// BEFORE (Next.js 15)
export const dynamic = 'force-static'
export const revalidate = 3600

// AFTER (Next.js 16)
async function getCachedData() {
  'use cache'
  cacheLife('hours')
  cacheTag('data')
  return await fetchData()
}
```

### Update Async Params

```typescript
// BEFORE (Next.js 15)
export default function Page({ params, searchParams }) {
  const id = params.id
}

// AFTER (Next.js 16)
export default async function Page({ params, searchParams }) {
  const { id } = await params
}
```

See `references/migration-guide.md` for complete migration patterns.

## Resources

This skill includes comprehensive reference documentation and automation tools organized by module:

### modules/

**Frontend Module (`modules/01-frontend/`)**
- `README.md` - Frontend module overview and quick start
- `layout-system.md` - AppSidebar, Header, PageContainer patterns
- `form-patterns.md` - 12 form component types with examples
- `data-table-patterns.md` - TanStack Table with URL state
- `rbac-navigation.md` - Role-based navigation filtering
- `command-palette.md` - kbar integration patterns
- `charts-analytics.md` - Recharts dashboard components
- `drag-drop-patterns.md` - dnd-kit Kanban and sortable lists
- `file-upload-patterns.md` - React Dropzone with validation
- `theme-system.md` - Dark/light mode configuration
- `client-optimization.md` - 🆕 React optimization patterns (memo, useMemo, useCallback)

**Backend Module (`modules/02-backend/`)**
- `README.md` - Backend module overview
- `patterns/` - 10 production cache patterns (migrated from references/)
- `database-layer.md` - Supabase + RLS integration

### workflows/

End-to-end development guides:

- `complete-workflow.md` - Dashboard setup → Module development → Deployment
- `module-builder-workflow.md` - Step-by-step CRUD module creation
- `auth-integration-workflow.md` - Supabase Auth setup patterns

### templates/

Production-ready code templates:

- `dashboard-layout/` - AppSidebar, Header, PageContainer components
- `form-components/` - 12 reusable form field components
- `data-table/` - TanStack Table setup with hooks
- `auth/` - Supabase Auth middleware, context, pages
- `navigation/` - Nav config, breadcrumbs, RBAC hooks
- `module-templates/` - Complete CRUD and analytics modules

### scripts/

Automation tools for quick setup:

- `init_dashboard.sh` - **NEW** - Initialize complete admin dashboard
- `setup_auth.sh` - **NEW** - Configure Supabase Auth integration
- `generate_module.py` - Generate CRUD module (Frontend + Backend)
- `init_project.sh` - Initialize Next.js 16 project
- `validate_structure.py` - Validate project structure

### references/

**Essential Guides:**
- **`error-prevention-guide.md`** - 🚨 **READ THIS FIRST** - Three critical errors
- **`production-patterns.md`** - 🏆 Real-world MyJKKN patterns

**Performance Optimization (🆕 Updated):**
- **`bundle-optimization.md`** - 🆕 Barrel imports, code splitting, 60% smaller bundles
- **`async-optimization.md`** - 🆕 Promise.all(), parallel fetching, 70% faster loads
- **`testing-patterns.md`** - 🆕 Server Actions, Zod, Playwright, comprehensive testing

**Backend Patterns:**
- `cache-components-patterns.md` - Advanced caching strategies
- `server-actions-forms.md` - Form handling and validation
- `module-builder-patterns.md` - CRUD development workflows
- `migration-guide.md` - Next.js 15 to 16 migration
- `database-patterns.md` - Supabase schemas and RLS

**Integration Guides:**
- `supabase-auth-patterns.md` - Auth integration guide
- `shadcn-ui-guide.md` - Shadcn component usage
- `tech-stack-reference.md` - Complete dependency list (~45 packages)

### assets/

Configuration and reference files:

- `next.config.ts` - Optimized Next.js 16 configuration
- `tailwind.config.dashboard.ts` - **NEW** - Dashboard Tailwind config
- `shadcn-components-list.md` - **NEW** - 45+ Shadcn components
- `supabase-schema-template.sql` - Database schema templates

---

Follow these patterns to build production-ready Next.js 16 applications with optimal performance, security, and developer experience. Reference the detailed documentation in `references/` for specific use cases and advanced patterns.
