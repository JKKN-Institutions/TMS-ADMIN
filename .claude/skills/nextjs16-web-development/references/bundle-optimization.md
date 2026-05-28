# Bundle Optimization Patterns

**CRITICAL**: This guide covers essential bundle size optimization techniques for Next.js 16 applications. Proper bundle optimization can reduce initial load by 40-60% and improve Time to Interactive significantly.

---

## Why Bundle Optimization Matters

**Production Impact**:
- 1MB reduction = ~300ms faster load on 3G
- Smaller bundles = Better Core Web Vitals (LCP, FID, CLS)
- Less JavaScript = Faster hydration

**MyJKKN Results**:
- Before: 850KB initial bundle
- After: 320KB initial bundle (62% reduction)
- LCP improved from 3.2s to 1.4s

---

## Pattern 1: Avoid Barrel Imports (Critical)

### ❌ WRONG - Barrel Imports

Barrel imports (index.ts files that re-export everything) prevent tree-shaking:

```tsx
// ❌ WRONG - Imports ENTIRE UI library (~500KB)
import { Button, Card, Dialog, Table, Select } from '@/components/ui'

// ❌ WRONG - Lodash barrel import
import { debounce, throttle, isEmpty } from 'lodash'

// ❌ WRONG - Icon barrel import
import { ChevronDown, Search, User, Settings } from 'lucide-react'
```

**Problem**: Bundler includes ALL exports from the barrel file, not just what you use.

### ✅ CORRECT - Direct Imports

Import directly from specific files:

```tsx
// ✅ CORRECT - Tree-shakeable, only imports what's needed
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'

// ✅ CORRECT - Import specific lodash functions
import debounce from 'lodash/debounce'
import throttle from 'lodash/throttle'

// ✅ CORRECT - Lucide icons are tree-shakeable when imported directly
import { ChevronDown } from 'lucide-react/dist/esm/icons/chevron-down'
import { Search } from 'lucide-react/dist/esm/icons/search'
```

### ESLint Rule to Enforce

Add to `.eslintrc.json`:

```json
{
  "rules": {
    "no-restricted-imports": [
      "error",
      {
        "patterns": [
          {
            "group": ["@/components/ui"],
            "message": "Import directly from @/components/ui/[component] instead of barrel import"
          },
          {
            "group": ["lodash"],
            "message": "Import from lodash/[function] instead of barrel import"
          }
        ]
      }
    ]
  }
}
```

---

## Pattern 2: Dynamic Imports for Heavy Components

### When to Use Dynamic Imports

Use `next/dynamic` for:
- **Heavy third-party libraries** (charts, editors, PDF viewers)
- **Components only shown conditionally** (modals, dropdowns)
- **Below-the-fold content** (footer components, analytics)
- **Admin-only features** (settings panels, debug tools)

### ❌ WRONG - Static Imports

```tsx
// ❌ WRONG - Chart library loaded even if not visible
import { LineChart, BarChart, PieChart } from 'recharts'
import RichTextEditor from 'react-quill'
import PDFViewer from '@react-pdf/renderer'

export function Dashboard() {
  const [showChart, setShowChart] = useState(false)

  return (
    <div>
      <button onClick={() => setShowChart(true)}>Show Chart</button>
      {showChart && <LineChart data={data} />}
    </div>
  )
}
```

**Problem**: All chart code loaded upfront, even when `showChart` is false.

### ✅ CORRECT - Dynamic Imports

```tsx
// ✅ CORRECT - Chart only loaded when needed
import dynamic from 'next/dynamic'

const LineChart = dynamic(
  () => import('recharts').then(mod => mod.LineChart),
  {
    loading: () => <ChartSkeleton />,
    ssr: false // Don't include in SSR bundle if not needed
  }
)

const RichTextEditor = dynamic(() => import('react-quill'), {
  loading: () => <div>Loading editor...</div>,
  ssr: false // Rich text editors often break SSR
})

export function Dashboard() {
  const [showChart, setShowChart] = useState(false)

  return (
    <div>
      <button onClick={() => setShowChart(true)}>Show Chart</button>
      {showChart && <LineChart data={data} />}
    </div>
  )
}
```

### Dynamic Import with Named Exports

```tsx
// ✅ CORRECT - Import specific component from library
const DataTable = dynamic(
  () => import('@/components/data-table').then(mod => mod.DataTable)
)

const AdvancedFilters = dynamic(
  () => import('@/components/filters').then(mod => mod.AdvancedFilters),
  { loading: () => <FiltersSkeleton /> }
)
```

### Dynamic Import for Route-Specific Code

```tsx
// ✅ CORRECT - Admin panel only loads for admin routes
const AdminPanel = dynamic(() => import('@/components/admin/panel'), {
  loading: () => <AdminSkeleton />
})

export default function AdminPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AdminPanel />
    </Suspense>
  )
}
```

---

## Pattern 3: Defer Third-Party Scripts

### ❌ WRONG - Blocking Scripts

```tsx
// ❌ WRONG - Blocks initial page load
export default function RootLayout({ children }) {
  return (
    <html>
      <head>
        <script src="https://analytics.example.com/script.js" />
        <script src="https://cdn.example.com/chat-widget.js" />
      </head>
      <body>{children}</body>
    </html>
  )
}
```

**Problem**: Scripts load before page content, delaying First Contentful Paint.

### ✅ CORRECT - Defer with next/script

```tsx
import Script from 'next/script'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}

        {/* Load after page is interactive */}
        <Script
          src="https://analytics.example.com/script.js"
          strategy="lazyOnload" // Load after hydration
        />

        <Script
          src="https://cdn.example.com/chat-widget.js"
          strategy="lazyOnload"
          onLoad={() => {
            console.log('Chat widget loaded')
          }}
        />
      </body>
    </html>
  )
}
```

### Script Loading Strategies

```tsx
// Strategy 1: beforeInteractive - Critical scripts only
<Script
  src="https://cdn.example.com/critical.js"
  strategy="beforeInteractive" // Load before page interactive
/>

// Strategy 2: afterInteractive (default) - Important scripts
<Script
  src="https://analytics.example.com/tracking.js"
  strategy="afterInteractive" // Load after page interactive
/>

// Strategy 3: lazyOnload - Non-critical scripts
<Script
  src="https://cdn.example.com/chat.js"
  strategy="lazyOnload" // Load when browser is idle
/>

// Strategy 4: worker - Web Worker (experimental)
<Script
  src="https://cdn.example.com/heavy-computation.js"
  strategy="worker" // Run in Web Worker
/>
```

---

## Pattern 4: Conditional Module Loading

Load modules only when features are activated:

### ❌ WRONG - Load Everything Upfront

```tsx
// ❌ WRONG - Import all payment providers even if not used
import StripeProvider from '@/lib/stripe'
import PayPalProvider from '@/lib/paypal'
import RazorpayProvider from '@/lib/razorpay'

export function PaymentPage({ provider }) {
  if (provider === 'stripe') return <StripeProvider />
  if (provider === 'paypal') return <PayPalProvider />
  return <RazorpayProvider />
}
```

### ✅ CORRECT - Lazy Load Providers

```tsx
// ✅ CORRECT - Only load the provider being used
export async function PaymentPage({ provider }) {
  let PaymentProvider

  switch (provider) {
    case 'stripe':
      PaymentProvider = (await import('@/lib/stripe')).default
      break
    case 'paypal':
      PaymentProvider = (await import('@/lib/paypal')).default
      break
    case 'razorpay':
      PaymentProvider = (await import('@/lib/razorpay')).default
      break
  }

  return <PaymentProvider />
}
```

### Feature Flags with Dynamic Imports

```tsx
// ✅ CORRECT - Feature flags control bundle size
export default function DashboardPage() {
  const features = useFeatureFlags()

  return (
    <div>
      {features.analytics && (
        <Suspense fallback={<AnalyticsSkeleton />}>
          <Analytics />
        </Suspense>
      )}

      {features.chat && (
        <Suspense fallback={<ChatSkeleton />}>
          <ChatWidget />
        </Suspense>
      )}
    </div>
  )
}

const Analytics = dynamic(() => import('@/components/analytics'))
const ChatWidget = dynamic(() => import('@/components/chat'))
```

---

## Pattern 5: Preload on Hover/Focus

Improve perceived performance by preloading before click:

### ✅ CORRECT - Preload on Interaction

```tsx
'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'

// Heavy modal component
const SettingsModal = dynamic(() => import('@/components/settings-modal'))

export function SettingsButton() {
  const [showModal, setShowModal] = useState(false)
  const [preloaded, setPreloaded] = useState(false)

  const preloadModal = () => {
    if (!preloaded) {
      // Trigger dynamic import on hover/focus
      import('@/components/settings-modal')
      setPreloaded(true)
    }
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        onMouseEnter={preloadModal}  // Preload on hover
        onFocus={preloadModal}        // Preload on keyboard focus
      >
        Settings
      </button>

      {showModal && <SettingsModal onClose={() => setShowModal(false)} />}
    </>
  )
}
```

### Preload on Route Change

```tsx
'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'

export function NavigationLink({ href, children }) {
  const router = useRouter()

  const preloadRoute = () => {
    router.prefetch(href) // Preload route on hover
  }

  return (
    <Link
      href={href}
      onMouseEnter={preloadRoute}
      onFocus={preloadRoute}
    >
      {children}
    </Link>
  )
}
```

---

## Pattern 6: Optimize Dependencies

### Replace Heavy Libraries

| Heavy Library | Lightweight Alternative | Size Savings |
|--------------|------------------------|--------------|
| moment.js (67KB) | date-fns (13KB) | 81% smaller |
| lodash (71KB) | es-toolkit (3KB) | 96% smaller |
| axios (13KB) | fetch API (native) | 100% smaller |
| uuid (14KB) | crypto.randomUUID() | 100% smaller |

### ✅ CORRECT - Lightweight Alternatives

```tsx
// ❌ WRONG - moment.js (67KB)
import moment from 'moment'
const formatted = moment().format('YYYY-MM-DD')

// ✅ CORRECT - date-fns (13KB, tree-shakeable)
import { format } from 'date-fns'
const formatted = format(new Date(), 'yyyy-MM-dd')

// ❌ WRONG - lodash (71KB)
import _ from 'lodash'
const unique = _.uniq(array)

// ✅ CORRECT - es-toolkit (3KB) or native
import { uniq } from 'es-toolkit'
const unique = uniq(array)
// Or native: [...new Set(array)]

// ❌ WRONG - axios (13KB)
import axios from 'axios'
const response = await axios.get('/api/data')

// ✅ CORRECT - fetch (native)
const response = await fetch('/api/data')
const data = await response.json()

// ❌ WRONG - uuid (14KB)
import { v4 as uuidv4 } from 'uuid'
const id = uuidv4()

// ✅ CORRECT - crypto.randomUUID (native in Node 18+)
const id = crypto.randomUUID()
```

---

## Pattern 7: Code Splitting by Route

Next.js automatically code-splits by route, but you can optimize further:

### Organize Code by Route

```
app/
├── (dashboard)/
│   ├── analytics/
│   │   ├── _components/     # Only loaded on /analytics
│   │   │   ├── charts.tsx
│   │   │   └── metrics.tsx
│   │   └── page.tsx
│   └── settings/
│       ├── _components/     # Only loaded on /settings
│       │   └── settings-form.tsx
│       └── page.tsx
```

**Benefits**:
- Route-specific components in `_components/` never leak to other routes
- Smaller initial bundles for each route

---

## Pattern 8: Remove Unused Dependencies

### Audit Bundle Size

```bash
# Analyze bundle
npm run build

# Install bundle analyzer
npm install -D @next/bundle-analyzer

# Add to next.config.ts
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})

module.exports = withBundleAnalyzer({
  // ... your config
})

# Run analysis
ANALYZE=true npm run build
```

### Find Unused Dependencies

```bash
# Install depcheck
npm install -g depcheck

# Check for unused dependencies
depcheck

# Remove unused packages
npm uninstall unused-package-1 unused-package-2
```

---

## Production Checklist

Before deploying, verify:

- [ ] **No barrel imports** - All imports are direct
- [ ] **Heavy components dynamically imported** - Charts, editors, PDF viewers
- [ ] **Third-party scripts use next/script** - With appropriate strategy
- [ ] **Conditional features lazy-loaded** - Feature flags control imports
- [ ] **Lightweight dependency alternatives** - date-fns instead of moment
- [ ] **Bundle analyzed** - No unexpected large dependencies
- [ ] **Unused dependencies removed** - Run depcheck
- [ ] **Route-specific code isolated** - In `_components/` folders

---

## Expected Results

Following these patterns, you should see:

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Initial Bundle | 800KB | 300KB | 62% smaller |
| First Load JS | 1.2MB | 450KB | 62% smaller |
| Time to Interactive | 3.5s | 1.8s | 49% faster |
| Lighthouse Score | 65 | 95 | +30 points |

---

## Integration with Existing Patterns

### Combine with Cache Components

```tsx
// Data layer - cached
export async function getProducts() {
  'use cache'
  cacheLife('hours')
  cacheTag('products')

  const supabase = await createClient()
  const { data } = await supabase.from('products').select('*')
  return data
}

// UI layer - dynamically imported
const ProductsTable = dynamic(
  () => import('@/components/products-table'),
  { loading: () => <TableSkeleton /> }
)

// Page - combines both
export default async function ProductsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ProductsList />
    </Suspense>
  )
}

async function ProductsList() {
  const products = await getProducts() // Cached
  return <ProductsTable products={products} /> // Lazy loaded
}
```

---

## Summary

Bundle optimization is **critical** for production performance:

1. **Avoid barrel imports** - Import directly from specific files
2. **Dynamic imports** - Use next/dynamic for heavy components
3. **Defer scripts** - Use next/script with lazyOnload strategy
4. **Conditional loading** - Load modules only when features activate
5. **Preload on hover** - Improve perceived performance
6. **Lightweight alternatives** - Replace heavy libraries
7. **Route-based splitting** - Isolate route-specific code
8. **Remove unused deps** - Regular audits with depcheck

**Impact**: 60% smaller bundles, 50% faster Time to Interactive, 30+ Lighthouse score improvement.
