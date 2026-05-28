# Async Optimization Patterns

**CRITICAL**: This guide covers async/await optimization patterns that can reduce page load times by 40-70%. These are the most impactful performance optimizations after caching.

---

## Why Async Optimization Matters

**The Problem**: Sequential async operations create waterfalls:

```tsx
// ❌ 3 seconds total (1s + 1s + 1s)
const user = await getUser(id)      // 1 second
const posts = await getPosts(id)    // 1 second
const comments = await getComments(id) // 1 second
```

```tsx
// ✅ 1 second total (parallel)
const [user, posts, comments] = await Promise.all([
  getUser(id),      // \
  getPosts(id),     //  > All run in parallel
  getComments(id)   // /
])
```

**MyJKKN Results**:
- Dashboard load: 2.8s → 0.9s (68% faster)
- Student profile: 1.5s → 0.5s (67% faster)

---

## Pattern 1: Parallel Data Fetching with Promise.all()

### ❌ WRONG - Sequential Fetching (Waterfall)

```tsx
// ❌ WRONG - Each await blocks the next one
export default async function DashboardPage() {
  const user = await getUser()           // 200ms
  const stats = await getStats()         // 300ms
  const notifications = await getNotifications() // 150ms
  const recentActivity = await getRecentActivity() // 250ms

  // Total: 900ms (sequential)

  return (
    <div>
      <UserProfile user={user} />
      <StatsWidget stats={stats} />
      <Notifications notifications={notifications} />
      <ActivityFeed activity={recentActivity} />
    </div>
  )
}
```

**Problem**: Total time = sum of all operations (900ms).

### ✅ CORRECT - Parallel Fetching

```tsx
// ✅ CORRECT - All requests start simultaneously
export default async function DashboardPage() {
  const [user, stats, notifications, recentActivity] = await Promise.all([
    getUser(),           // \
    getStats(),          //  |
    getNotifications(),  //  > All run in parallel
    getRecentActivity()  // /
  ])

  // Total: 300ms (longest operation)

  return (
    <div>
      <UserProfile user={user} />
      <StatsWidget stats={stats} />
      <Notifications notifications={notifications} />
      <ActivityFeed activity={recentActivity} />
    </div>
  )
}
```

**Result**: Total time = longest operation (300ms), 67% faster.

---

## Pattern 2: Defer Await to Where It's Needed

### ❌ WRONG - Await Too Early

```tsx
// ❌ WRONG - Awaits data even if not needed
export default async function ProductPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ view?: string }>
}) {
  const { id } = await params
  const { view } = await searchParams

  // Fetch product data immediately
  const product = await getProduct(id) // 500ms

  // Early return - wasted the fetch!
  if (view === 'list') {
    redirect('/products')
  }

  return <ProductDetail product={product} />
}
```

**Problem**: Fetches product even when redirecting, wasting 500ms.

### ✅ CORRECT - Defer Await to Branches

```tsx
// ✅ CORRECT - Only await when needed
export default async function ProductPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ view?: string }>
}) {
  const { id } = await params
  const { view } = await searchParams

  // Early return - no wasted fetch
  if (view === 'list') {
    redirect('/products')
  }

  // Only fetch if we're actually showing the product
  const product = await getProduct(id) // 500ms, but only when needed

  return <ProductDetail product={product} />
}
```

**Result**: Redirects happen instantly without waiting for data.

### Real-World Example: Conditional Data Loading

```tsx
// ✅ CORRECT - Fetch different data based on user role
export default async function AdminPage() {
  const user = await getCurrentUser()

  // Early exit for non-admins
  if (user.role !== 'admin') {
    redirect('/unauthorized')
  }

  // Only fetch admin data if user is admin
  const [users, logs, settings] = await Promise.all([
    getAllUsers(),
    getAuditLogs(),
    getAdminSettings()
  ])

  return <AdminDashboard users={users} logs={logs} settings={settings} />
}
```

---

## Pattern 3: Start Promises Early, Await Late

### ❌ WRONG - Start and Await Immediately

```tsx
// ❌ WRONG - Sequential execution
export default async function Page() {
  const userData = await fetch('/api/user').then(r => r.json())
  const postsData = await fetch('/api/posts').then(r => r.json())

  // 400ms total (200ms + 200ms)

  return <Dashboard user={userData} posts={postsData} />
}
```

### ✅ CORRECT - Start Early, Await Late

```tsx
// ✅ CORRECT - Start all requests, then await together
export default async function Page() {
  // Start both requests immediately (don't await yet)
  const userPromise = fetch('/api/user').then(r => r.json())
  const postsPromise = fetch('/api/posts').then(r => r.json())

  // Now await both
  const [userData, postsData] = await Promise.all([
    userPromise,
    postsPromise
  ])

  // 200ms total (parallel)

  return <Dashboard user={userData} posts={postsData} />
}
```

### API Route Example

```tsx
// app/api/dashboard/route.ts
export async function GET(request: Request) {
  // ❌ WRONG - Sequential
  const user = await db.users.findUnique({ where: { id: userId } })
  const orders = await db.orders.findMany({ where: { userId } })
  const payments = await db.payments.findMany({ where: { userId } })
  // 450ms total

  // ✅ CORRECT - Parallel
  const [user, orders, payments] = await Promise.all([
    db.users.findUnique({ where: { id: userId } }),
    db.orders.findMany({ where: { userId } }),
    db.payments.findMany({ where: { userId } })
  ])
  // 150ms total (3x faster)

  return Response.json({ user, orders, payments })
}
```

---

## Pattern 4: Handle Partial Failures with Promise.allSettled()

### When to Use

Use `Promise.allSettled()` when:
- Some operations can fail without breaking the page
- You want to show partial data instead of nothing
- Operations are independent (failure of one doesn't affect others)

### ❌ WRONG - All-or-Nothing with Promise.all()

```tsx
// ❌ WRONG - If any request fails, all fail
try {
  const [user, posts, comments] = await Promise.all([
    getUser(id),
    getPosts(id),
    getComments(id) // If this fails, user and posts are lost!
  ])

  return <Dashboard user={user} posts={posts} comments={comments} />
} catch (error) {
  return <Error message="Failed to load dashboard" />
}
```

**Problem**: If comments fail to load, you lose user and posts data too.

### ✅ CORRECT - Partial Success with Promise.allSettled()

```tsx
// ✅ CORRECT - Show partial data even if some operations fail
const results = await Promise.allSettled([
  getUser(id),
  getPosts(id),
  getComments(id)
])

const user = results[0].status === 'fulfilled' ? results[0].value : null
const posts = results[1].status === 'fulfilled' ? results[1].value : []
const comments = results[2].status === 'fulfilled' ? results[2].value : []

return (
  <Dashboard
    user={user}
    posts={posts}
    comments={comments}
    errors={{
      user: results[0].status === 'rejected' ? results[0].reason : null,
      posts: results[1].status === 'rejected' ? results[1].reason : null,
      comments: results[2].status === 'rejected' ? results[2].reason : null
    }}
  />
)
```

### Helper Function for Type Safety

```tsx
// lib/utils/async-helpers.ts
type SettledResult<T> = {
  data: T | null
  error: Error | null
}

export async function allSettledSafe<T extends readonly unknown[]>(
  promises: T
): Promise<{ [K in keyof T]: SettledResult<Awaited<T[K]>> }> {
  const results = await Promise.allSettled(promises)

  return results.map(result => ({
    data: result.status === 'fulfilled' ? result.value : null,
    error: result.status === 'rejected' ? result.reason : null
  })) as any
}

// Usage
const [user, posts, comments] = await allSettledSafe([
  getUser(id),
  getPosts(id),
  getComments(id)
])

// Type-safe access
if (user.data) {
  console.log(user.data.name)
}
if (user.error) {
  console.error(user.error)
}
```

---

## Pattern 5: Race Conditions with Promise.race()

### Use Case: Timeout Pattern

```tsx
// ✅ CORRECT - Timeout slow operations
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Operation timed out')), ms)
  )

  return Promise.race([promise, timeout])
}

// Usage
try {
  const data = await withTimeout(
    fetch('https://slow-api.example.com/data'),
    5000 // 5 second timeout
  )
} catch (error) {
  // Handle timeout or API error
  console.error('Failed or timed out:', error)
}
```

### Use Case: Fastest Response Wins

```tsx
// ✅ CORRECT - Use fastest API endpoint
const data = await Promise.race([
  fetch('https://api-us-east.example.com/data'),
  fetch('https://api-us-west.example.com/data'),
  fetch('https://api-eu.example.com/data')
]).then(r => r.json())

// First endpoint to respond wins
```

---

## Pattern 6: Streaming with Suspense (Next.js 16)

### Combine Parallel Fetching with Streaming

```tsx
// ✅ CORRECT - Parallel data fetching + streaming UI
export default function DashboardPage() {
  return (
    <div>
      {/* Static shell - renders immediately */}
      <DashboardHeader />

      {/* Three independent Suspense boundaries - stream in parallel */}
      <div className="grid grid-cols-3 gap-4">
        <Suspense fallback={<StatsSkeleton />}>
          <StatsWidget />
        </Suspense>

        <Suspense fallback={<ChartsSkeleton />}>
          <ChartsWidget />
        </Suspense>

        <Suspense fallback={<ActivitySkeleton />}>
          <ActivityWidget />
        </Suspense>
      </div>
    </div>
  )
}

// Each widget fetches data independently
async function StatsWidget() {
  const stats = await getStats() // Runs in parallel with other widgets
  return <Stats data={stats} />
}

async function ChartsWidget() {
  const charts = await getCharts() // Runs in parallel
  return <Charts data={charts} />
}

async function ActivityWidget() {
  const activity = await getActivity() // Runs in parallel
  return <Activity data={activity} />
}
```

**Result**: All three widgets fetch data in parallel and stream as they complete.

---

## Pattern 7: Parallel Suspense Boundaries (Critical)

### ❌ WRONG - Nested Suspense (Sequential)

```tsx
// ❌ WRONG - Inner Suspense waits for outer
export default function Page() {
  return (
    <Suspense fallback={<OuterSkeleton />}>
      <OuterComponent>
        <Suspense fallback={<InnerSkeleton />}>
          <InnerComponent />
        </Suspense>
      </OuterComponent>
    </Suspense>
  )
}

async function OuterComponent({ children }) {
  await delay(1000) // Blocks inner Suspense
  return <div>{children}</div>
}

async function InnerComponent() {
  await delay(500)
  return <div>Inner</div>
}

// Total: 1500ms (sequential)
```

### ✅ CORRECT - Sibling Suspense (Parallel)

```tsx
// ✅ CORRECT - Siblings stream independently
export default function Page() {
  return (
    <div>
      <Suspense fallback={<Skeleton1 />}>
        <Component1 />
      </Suspense>

      <Suspense fallback={<Skeleton2 />}>
        <Component2 />
      </Suspense>

      <Suspense fallback={<Skeleton3 />}>
        <Component3 />
      </Suspense>
    </div>
  )
}

async function Component1() {
  await delay(1000)
  return <div>Component 1</div>
}

async function Component2() {
  await delay(500)
  return <div>Component 2</div>
}

async function Component3() {
  await delay(800)
  return <div>Component 3</div>
}

// Total: 1000ms (parallel, longest component)
```

---

## Pattern 8: Optimize Server Actions

### ❌ WRONG - Sequential Database Operations

```tsx
'use server'

export async function createOrder(data: OrderData) {
  // ❌ WRONG - Sequential
  const order = await db.orders.create({ data })
  const invoice = await db.invoices.create({ data: { orderId: order.id } })
  const notification = await db.notifications.create({
    data: { userId: order.userId, message: 'Order created' }
  })

  // Update cache
  revalidatePath('/orders')

  return order
}
```

### ✅ CORRECT - Parallel Independent Operations

```tsx
'use server'

export async function createOrder(data: OrderData) {
  // Create order first (required for invoice)
  const order = await db.orders.create({ data })

  // ✅ CORRECT - Invoice and notification in parallel
  const [invoice, notification] = await Promise.all([
    db.invoices.create({ data: { orderId: order.id } }),
    db.notifications.create({
      data: { userId: order.userId, message: 'Order created' }
    })
  ])

  // Update cache
  revalidatePath('/orders')

  return order
}
```

### Use after() for Non-Blocking Operations (Next.js 15+)

```tsx
'use server'

import { after } from 'next/server'

export async function createOrder(data: OrderData) {
  // Critical path - must complete before response
  const order = await db.orders.create({ data })

  // Non-critical operations - don't block response
  after(async () => {
    // These run after response is sent
    await Promise.all([
      sendEmail(order.userId, 'Order confirmation'),
      trackAnalytics('order_created', order.id),
      updateInventory(order.items)
    ])
  })

  revalidatePath('/orders')
  return order
}
```

**Result**: Response sent immediately after order creation, analytics/email sent in background.

---

## Production Checklist

Before deploying, verify:

- [ ] **No sequential awaits** - Use Promise.all() for independent operations
- [ ] **Defer await to branches** - Only fetch data when actually needed
- [ ] **Start promises early** - Don't await immediately if more work follows
- [ ] **Use allSettled for optional data** - Show partial data on failures
- [ ] **Parallel Suspense boundaries** - Siblings, not nested
- [ ] **Server Actions optimized** - Parallel database operations
- [ ] **after() for non-blocking** - Analytics, emails, logging
- [ ] **Timeouts for slow operations** - Use Promise.race()

---

## Expected Results

Following these patterns, you should see:

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Dashboard Load | 2.8s | 0.9s | 68% faster |
| User Profile | 1.5s | 0.5s | 67% faster |
| Search Results | 2.2s | 0.8s | 64% faster |
| API Response | 450ms | 150ms | 67% faster |

---

## Integration with Cache Components

```tsx
// ✅ EXCELLENT - Parallel cached data fetching
export default async function DashboardPage() {
  return (
    <div>
      <Suspense fallback={<Skeleton1 />}>
        <UserWidget />
      </Suspense>

      <Suspense fallback={<Skeleton2 />}>
        <StatsWidget />
      </Suspense>

      <Suspense fallback={<Skeleton3 />}>
        <ActivityWidget />
      </Suspense>
    </div>
  )
}

// Each widget uses cached data - fetches in parallel
async function UserWidget() {
  'use cache'
  cacheLife('minutes')
  cacheTag('user')

  const user = await getUser()
  return <User data={user} />
}

async function StatsWidget() {
  'use cache'
  cacheLife('hours')
  cacheTag('stats')

  const stats = await getStats()
  return <Stats data={stats} />
}

async function ActivityWidget() {
  'use cache'
  cacheLife('minutes')
  cacheTag('activity')

  const activity = await getActivity()
  return <Activity data={activity} />
}
```

**Result**:
- All three widgets fetch in parallel (Suspense siblings)
- All data is cached (Cache Components)
- UI streams as each completes (Suspense)
- Best of all worlds!

---

## Summary

Async optimization is **critical** for performance:

1. **Promise.all()** - Parallel independent operations
2. **Defer await** - Only fetch when needed
3. **Start early, await late** - Begin all requests immediately
4. **Promise.allSettled()** - Handle partial failures
5. **Promise.race()** - Timeouts and fastest response
6. **Parallel Suspense** - Sibling boundaries, not nested
7. **Optimize Server Actions** - Parallel database operations
8. **after() API** - Non-blocking background tasks

**Impact**: 60-70% faster page loads, better Time to Interactive, improved Core Web Vitals.
