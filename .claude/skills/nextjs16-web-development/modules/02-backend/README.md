# Backend Module

Server-side data patterns with optimal caching for Next.js 16 applications.

## Overview

This module provides comprehensive server-side patterns for building performant data layers with Next.js 16 Cache Components, Server Actions, and Supabase integration.

## Key Features

- **Cache Components**: 10 production patterns for optimal caching strategies
- **Server Actions**: Form handling, mutations, and instant cache invalidation
- **Database Layer**: Supabase integration with Row Level Security (RLS)
- **Cache Strategies**: Hot/Warm/Cold/Static profiles from MyJKKN production
- **Cache Invalidation**: Hierarchical tag system with updateTag()
- **Type Safety**: Zod schemas + TypeScript strict mode
- **Streaming**: Suspense boundaries for progressive rendering
- **Optimistic Updates**: Client-side UX patterns

## Core Paradigm Shift

**Next.js 15**: Static by default → opt into dynamic
**Next.js 16**: Dynamic by default → opt into caching with `use cache`

This fundamental shift provides fine-grained control over caching at the function level rather than page level.

## 10 Production Patterns

### Pattern 0: Deferring to Request Time
**File**: `patterns/pattern-00-connection.md`

Use `connection()` for non-deterministic operations (random values, timestamps, UUIDs):

```typescript
import { connection } from 'next/server'

export default async function Page() {
  await connection() // Defer to request time
  const timestamp = Date.now()
  const uuid = crypto.randomUUID()
  // ... use non-deterministic values
}
```

### Pattern 1: Cached Data Fetching
**File**: `patterns/pattern-01-cached-data.md`

Basic data caching with `use cache` directive:

```typescript
export async function getProducts() {
  'use cache'
  cacheLife('hours')
  cacheTag('products')

  const supabase = await createServerSupabaseClient()
  const { data } = await supabase.from('products').select('*')
  return data
}
```

### Pattern 2: Server Actions for Mutations
**File**: `patterns/pattern-02-server-actions.md`

Form submissions with validation and instant cache invalidation:

```typescript
'use server'

export async function createProduct(formData: FormData) {
  const validation = ProductSchema.safeParse(formData)
  if (!validation.success) return { errors: validation.error }

  await db.insert(validation.data)
  updateTag('products') // Instant invalidation
  redirect('/products')
}
```

### Pattern 3: Streaming with Suspense
**File**: `patterns/pattern-03-streaming.md`

Progressive rendering with different cache strategies:

```tsx
export default async function Dashboard() {
  return (
    <>
      <Suspense fallback={<StatsSkeleton />}>
        <CachedStats /> {/* Long cache */}
      </Suspense>

      <Suspense fallback={<LiveSkeleton />}>
        <RealTimeData /> {/* No cache */}
      </Suspense>
    </>
  )
}
```

### Pattern 4: Form Validation & Error Handling
**File**: `patterns/pattern-04-form-validation.md`

Server-side validation with Zod and error states:

```typescript
const FormSchema = z.object({
  name: z.string().min(1, 'Name required'),
  email: z.string().email('Invalid email'),
})

export async function submitForm(formData: FormData) {
  const validation = FormSchema.safeParse(formData)
  if (!validation.success) {
    return { errors: validation.error.flatten().fieldErrors }
  }
  // ... process valid data
}
```

### Pattern 5: Optimistic Updates
**File**: `patterns/pattern-05-optimistic-updates.md`

Client-side optimistic UI with `useOptimistic`:

```tsx
'use client'

export function TodoList({ todos }) {
  const [optimisticTodos, updateOptimisticTodos] = useOptimistic(todos)

  const handleToggle = async (id) => {
    startTransition(() => {
      updateOptimisticTodos({ type: 'toggle', id })
    })
    await toggleTodo(id)
  }
  // ... render optimistic state
}
```

### Pattern 6: Cache Key Optimization
**File**: `patterns/pattern-06-cache-keys.md`

**PRODUCTION CRITICAL**: Cache on dimensions with FEW unique values, not MANY.

```typescript
// ❌ BAD: Cache per user (1000s of entries)
async function getUserDashboard(userId: string) {
  'use cache: remote'
  return await fetchUserData(userId)
}

// ✅ GOOD: Cache by language (10-50 entries)
async function getCMSContent(language: string) {
  'use cache: remote'
  cacheTag(`cms-${language}`)
  return cms.getContent(language) // 100x better utilization
}
```

### Pattern 7: Production Cache Profiles
**File**: `patterns/pattern-07-cache-profiles.md`

Standardized cache duration profiles from MyJKKN production:

```typescript
// Hot: 1 minute (payments, sessions)
cacheLife('hot')

// Warm: 5 minutes (invoices, profiles)
cacheLife('warm')

// Cold: 1 hour (institutions, departments)
cacheLife('cold')

// Static: 1 day (config, regulations)
cacheLife('static')
```

### Pattern 8: Hierarchical Cache Tags
**File**: `patterns/pattern-08-cache-tags.md`

Organized cache tag system for granular invalidation:

```typescript
export const cacheTags = {
  products: {
    list: () => 'products',
    byId: (id: string) => `products-${id}`,
    byCategory: (cat: string) => `products-category-${cat}`,
  }
}

// Usage
cacheTag(cacheTags.products.list())
cacheTag(cacheTags.products.byCategory('electronics'))

// Invalidation
updateTag(cacheTags.products.list())
```

### Pattern 9: "Extract and Pass" for Dynamic APIs
**File**: `patterns/pattern-09-extract-pass.md`

Read cookies/headers/searchParams OUTSIDE cached scope, pass as arguments:

```typescript
// ❌ WRONG
async function Dashboard() {
  'use cache'
  const userId = (await cookies()).get('userId') // ERROR!
}

// ✅ CORRECT
async function Dashboard() {
  const userId = (await cookies()).get('userId') // Extract outside
  return <CachedDashboard userId={userId} /> // Pass as argument
}

async function CachedDashboard({ userId }) {
  'use cache'
  cacheTag(`user-${userId}`)
  // userId is now part of cache key
}
```

### Pattern 10: Cache Nesting Rules
**File**: `patterns/pattern-10-cache-nesting.md`

Understanding which cache directives can nest:

| Outer Cache | Inner Cache | Valid? |
|------------|-------------|---------|
| `use cache: remote` | `use cache: remote` | ✅ YES |
| `use cache: remote` | `use cache` | ✅ YES |
| `use cache` | `use cache: remote` | ✅ YES |
| `use cache: private` | `use cache: remote` | ❌ NO |
| `use cache: remote` | `use cache: private` | ❌ NO |

## Database Layer

**File**: `database-layer.md`

### Supabase Integration

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
        getAll() { return cookieStore.getAll() },
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

### Row Level Security (RLS)

```sql
-- Enable RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Read policy
CREATE POLICY "Public products are viewable by everyone"
  ON products FOR SELECT
  USING (is_published = true);

-- Write policy
CREATE POLICY "Users can insert their own products"
  ON products FOR INSERT
  WITH CHECK (auth.uid() = user_id);
```

## Cache Invalidation Strategy

**Instant updates**: Use `updateTag()` when users expect immediate feedback

```typescript
'use server'
import { updateTag } from 'next/cache'

export async function deleteProduct(id: string) {
  await db.products.delete(id)
  updateTag('products') // Instant invalidation
}
```

**Background updates**: Use `revalidateTag()` for eventual consistency

```typescript
export async function syncExternalData() {
  await fetchExternalAPI()
  revalidateTag('external-data') // Background refresh
}
```

## Quick Decision Framework

### Caching Strategy

```
Is the data user-specific?
├─ YES → Is it personalized but cacheable?
│  ├─ YES → 'use cache: private' + cacheLife
│  └─ NO → Don't cache (use cookies/headers)
└─ NO → How often does it change?
   ├─ Real-time → No cache
   ├─ Seconds → cacheLife('hot')
   ├─ Minutes → cacheLife('warm')
   ├─ Hours → cacheLife('cold')
   └─ Days → cacheLife('static')
```

### Server Actions vs Route Handlers

```
Need to handle form submission?
├─ YES → Server Action
└─ NO → Building API for external use?
   ├─ YES → Route Handler
   └─ NO → Server Action
```

## Best Practices

### DO:
- ✅ Enable `cacheComponents` in next.config.ts
- ✅ Use Server Actions for all mutations
- ✅ Apply `use cache` to data fetching functions
- ✅ Wrap dynamic content in Suspense boundaries
- ✅ Validate all inputs with Zod
- ✅ Use `updateTag` for instant cache updates
- ✅ Cache on low-cardinality dimensions
- ✅ Add multiple cache tags for granular invalidation

### DON'T:
- ❌ **NEVER** use cookies/headers/searchParams inside 'use cache'
- ❌ **NEVER** access searchParams/params without await
- ❌ **NEVER** fetch data without Suspense OR 'use cache'
- ❌ **NEVER** nest `'use cache: private'` inside `'use cache: remote'`
- ❌ **NEVER** cache on high-cardinality dimensions (userId, timestamp)
- ❌ Pass Promises to cached functions (causes build timeouts)

## Integration with Frontend Module

Backend patterns power Frontend components:

**Flow**:
1. Frontend forms → Submit to Server Actions (Pattern 2)
2. Server Actions → Validate with Zod (Pattern 4)
3. Server Actions → Update database + invalidate cache (Pattern 2)
4. Frontend tables → Display cached data (Pattern 1)
5. Frontend pages → Wrap with Suspense (Pattern 3)

**Example**:
```tsx
// Backend: Server Action
'use server'
export async function createProduct(formData: FormData) {
  const validation = ProductSchema.safeParse(formData)
  if (!validation.success) return { errors: validation.error }

  await db.insert(validation.data)
  updateTag('products')
  redirect('/products')
}

// Backend: Cached data
export async function getProducts() {
  'use cache'
  cacheLife('warm')
  cacheTag('products')
  return await db.products.findMany()
}

// Frontend: Form component
export function ProductForm() {
  const [state, formAction] = useActionState(createProduct, {})
  return <form action={formAction}>{/* form fields */}</form>
}

// Frontend: Table component
export function ProductsTable({ products }) {
  const table = useDataTable({ data: products })
  return <DataTable table={table} />
}

// Page: Combines both
export default async function ProductsPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <ProductsList />
    </Suspense>
  )
}

async function ProductsList() {
  const products = await getProducts() // Backend cached data
  return <ProductsTable products={products} /> // Frontend table
}
```

## Next Steps

1. **Read pattern files** in `patterns/` directory for detailed examples
2. **Study error-prevention-guide.md** to avoid common mistakes
3. **Review production-patterns.md** for real-world MyJKKN examples
4. **Use workflows/** for end-to-end module development
5. **Integrate with Frontend Module** for complete UI + data layer

## Resources

- [Error Prevention Guide](../../references/error-prevention-guide.md) - 🚨 **READ FIRST**
- [Production Patterns](../../references/production-patterns.md) - Real-world MyJKKN examples
- [Complete Workflow](../../workflows/complete-workflow.md)
- [Module Builder Workflow](../../workflows/module-builder-workflow.md)
- [Frontend Module](../01-frontend/README.md)
- [Database Patterns](../../references/database-patterns.md)
