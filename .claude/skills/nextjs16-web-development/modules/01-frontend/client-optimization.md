# Client Component Optimization

**CRITICAL**: This guide covers client-side React optimization patterns for Next.js 16. Proper client optimization prevents unnecessary re-renders and improves runtime performance by 50-80%.

---

## Why Client Optimization Matters

**The Problem**: Unnecessary re-renders waste CPU cycles:

```tsx
// ❌ Component re-renders 100 times per second
function ParentComponent() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => setCount(c => c + 1), 10)
    return () => clearInterval(interval)
  }, [])

  // ExpensiveChild re-renders 100 times/sec even though it doesn't use count!
  return (
    <div>
      <p>Count: {count}</p>
      <ExpensiveChild data={staticData} />
    </div>
  )
}
```

**MyJKKN Results**:
- Data table filtering: 2.3s → 0.3s (87% faster)
- Form interactions: Laggy → Instant
- List rendering: 1.1s → 0.2s (82% faster)

---

## Pattern 1: React.memo for Expensive Components

### When to Use React.memo

Use `React.memo()` when:
- Component renders often with same props
- Component is expensive to render (complex calculations, large lists)
- Component is lower in the tree (doesn't need to re-render when parent state changes)

### ❌ WRONG - Unnecessary Re-renders

```tsx
'use client'

// ❌ WRONG - Re-renders every time parent state changes
function ExpensiveList({ items }: { items: Item[] }) {
  // Expensive calculation on every render
  const processedItems = items.map(item => ({
    ...item,
    formatted: expensiveFormat(item)
  }))

  return (
    <ul>
      {processedItems.map(item => (
        <li key={item.id}>{item.formatted}</li>
      ))}
    </ul>
  )
}

function ParentComponent() {
  const [count, setCount] = useState(0) // Unrelated state
  const items = useMemo(() => fetchItems(), [])

  return (
    <div>
      <button onClick={() => setCount(c => c + 1)}>Count: {count}</button>
      {/* Re-renders on every count change even though items haven't changed! */}
      <ExpensiveList items={items} />
    </div>
  )
}
```

### ✅ CORRECT - Memoized Component

```tsx
'use client'

import { memo, useMemo } from 'react'

// ✅ CORRECT - Only re-renders when items change
const ExpensiveList = memo(function ExpensiveList({ items }: { items: Item[] }) {
  const processedItems = useMemo(
    () => items.map(item => ({
      ...item,
      formatted: expensiveFormat(item)
    })),
    [items]
  )

  return (
    <ul>
      {processedItems.map(item => (
        <li key={item.id}>{item.formatted}</li>
      ))}
    </ul>
  )
})

function ParentComponent() {
  const [count, setCount] = useState(0)
  const items = useMemo(() => fetchItems(), [])

  return (
    <div>
      <button onClick={() => setCount(c => c + 1)}>Count: {count}</button>
      {/* Only re-renders when items reference changes */}
      <ExpensiveList items={items} />
    </div>
  )
}
```

### Custom Comparison Function

```tsx
// ✅ CORRECT - Custom comparison for complex props
const UserCard = memo(
  function UserCard({ user }: { user: User }) {
    return (
      <div>
        <h3>{user.name}</h3>
        <p>{user.email}</p>
      </div>
    )
  },
  (prevProps, nextProps) => {
    // Only re-render if name or email changed
    return (
      prevProps.user.name === nextProps.user.name &&
      prevProps.user.email === nextProps.user.email
    )
  }
)
```

---

## Pattern 2: useMemo for Expensive Calculations

### ❌ WRONG - Recalculate on Every Render

```tsx
'use client'

function DataTable({ data }: { data: Item[] }) {
  // ❌ WRONG - Sorts on EVERY render (even when data hasn't changed)
  const sortedData = data.sort((a, b) => a.name.localeCompare(b.name))

  // ❌ WRONG - Filters on every render
  const filteredData = sortedData.filter(item => item.active)

  return (
    <table>
      {filteredData.map(item => (
        <tr key={item.id}>
          <td>{item.name}</td>
        </tr>
      ))}
    </table>
  )
}
```

**Problem**: Sorting and filtering happen on every render, even when `data` hasn't changed.

### ✅ CORRECT - Memoize Calculations

```tsx
'use client'

import { useMemo } from 'react'

function DataTable({ data }: { data: Item[] }) {
  // ✅ CORRECT - Only recalculates when data changes
  const sortedData = useMemo(
    () => [...data].sort((a, b) => a.name.localeCompare(b.name)),
    [data]
  )

  const filteredData = useMemo(
    () => sortedData.filter(item => item.active),
    [sortedData]
  )

  return (
    <table>
      {filteredData.map(item => (
        <tr key={item.id}>
          <td>{item.name}</td>
        </tr>
      ))}
    </table>
  )
}
```

### When NOT to Use useMemo

```tsx
// ❌ OVERKILL - Don't memoize simple calculations
const total = useMemo(() => price * quantity, [price, quantity])

// ✅ CORRECT - Simple calculations are cheap
const total = price * quantity

// ❌ OVERKILL - Primitives are cheap to create
const label = useMemo(() => `${firstName} ${lastName}`, [firstName, lastName])

// ✅ CORRECT - String concatenation is cheap
const label = `${firstName} ${lastName}`
```

**Rule of Thumb**: Only memoize if the calculation:
- Loops over arrays (sorting, filtering, mapping)
- Does complex math or string operations
- Creates new objects/arrays that are passed to memoized children

---

## Pattern 3: useCallback for Stable Callbacks

### ❌ WRONG - New Function on Every Render

```tsx
'use client'

function TodoList({ todos }: { todos: Todo[] }) {
  const [items, setItems] = useState(todos)

  // ❌ WRONG - New function on every render
  const handleToggle = (id: string) => {
    setItems(items.map(item =>
      item.id === id ? { ...item, done: !item.done } : item
    ))
  }

  return (
    <ul>
      {items.map(item => (
        // MemoizedTodoItem re-renders on every TodoList render
        // because handleToggle is a new function reference
        <MemoizedTodoItem
          key={item.id}
          item={item}
          onToggle={handleToggle}
        />
      ))}
    </ul>
  )
}

const MemoizedTodoItem = memo(TodoItem)
```

**Problem**: `handleToggle` is a new function on every render, breaking `memo()`.

### ✅ CORRECT - Stable Callback with useCallback

```tsx
'use client'

import { useCallback } from 'react'

function TodoList({ todos }: { todos: Todo[] }) {
  const [items, setItems] = useState(todos)

  // ✅ CORRECT - Stable function reference
  const handleToggle = useCallback((id: string) => {
    setItems(items => items.map(item =>
      item.id === id ? { ...item, done: !item.done } : item
    ))
  }, []) // No dependencies because we use functional setState

  return (
    <ul>
      {items.map(item => (
        // MemoizedTodoItem only re-renders when item changes
        <MemoizedTodoItem
          key={item.id}
          item={item}
          onToggle={handleToggle}
        />
      ))}
    </ul>
  )
}

const MemoizedTodoItem = memo(TodoItem)
```

---

## Pattern 4: Functional setState for Stable Callbacks

### ❌ WRONG - Callback Depends on State

```tsx
'use client'

function Counter() {
  const [count, setCount] = useState(0)

  // ❌ WRONG - Must recreate callback when count changes
  const increment = useCallback(() => {
    setCount(count + 1)
  }, [count]) // Dependency on count

  return <button onClick={increment}>Count: {count}</button>
}
```

**Problem**: Callback recreated on every count change, breaking memoization.

### ✅ CORRECT - Functional setState

```tsx
'use client'

function Counter() {
  const [count, setCount] = useState(0)

  // ✅ CORRECT - No dependencies, stable forever
  const increment = useCallback(() => {
    setCount(c => c + 1) // Functional form
  }, []) // No dependencies!

  return <button onClick={increment}>Count: {count}</button>
}
```

### Complex Example with Multiple State Updates

```tsx
'use client'

function ShoppingCart() {
  const [items, setItems] = useState<CartItem[]>([])
  const [total, setTotal] = useState(0)

  // ✅ CORRECT - Both updates use functional form, no dependencies
  const addItem = useCallback((item: CartItem) => {
    setItems(items => [...items, item])
    setTotal(total => total + item.price)
  }, []) // Stable forever

  const removeItem = useCallback((id: string) => {
    setItems(items => items.filter(item => item.id !== id))
    setTotal(total => {
      const item = items.find(i => i.id === id)
      return total - (item?.price || 0)
    })
  }, [])

  return (
    <div>
      {items.map(item => (
        <MemoizedCartItem
          key={item.id}
          item={item}
          onRemove={removeItem} // Stable reference
        />
      ))}
    </div>
  )
}
```

---

## Pattern 5: Lazy State Initialization

### ❌ WRONG - Expensive Initialization on Every Render

```tsx
'use client'

function DataVisualization({ rawData }: { rawData: RawData[] }) {
  // ❌ WRONG - processData runs on EVERY render
  const [processedData, setProcessedData] = useState(
    processData(rawData) // Expensive computation
  )

  return <Chart data={processedData} />
}

function processData(data: RawData[]): ProcessedData[] {
  // Expensive: sorting, filtering, transforming
  return data
    .filter(item => item.valid)
    .sort((a, b) => a.timestamp - b.timestamp)
    .map(item => ({ ...item, calculated: complexCalculation(item) }))
}
```

**Problem**: `processData()` runs on every render, even though only the initial value is used.

### ✅ CORRECT - Lazy Initialization

```tsx
'use client'

function DataVisualization({ rawData }: { rawData: RawData[] }) {
  // ✅ CORRECT - processData only runs ONCE (initial render)
  const [processedData, setProcessedData] = useState(() =>
    processData(rawData) // Function form
  )

  return <Chart data={processedData} />
}
```

### When to Use Lazy Initialization

Use lazy initialization when initial state:
- Reads from localStorage/sessionStorage
- Does expensive calculations
- Processes large datasets
- Calls functions that allocate memory

```tsx
// ✅ CORRECT - localStorage read only once
const [preferences, setPreferences] = useState(() => {
  const saved = localStorage.getItem('preferences')
  return saved ? JSON.parse(saved) : defaultPreferences
})

// ✅ CORRECT - Expensive calculation only once
const [fibonacci, setFibonacci] = useState(() =>
  calculateFibonacci(1000)
)
```

---

## Pattern 6: useRef for Transient Values

### ❌ WRONG - Trigger Re-renders for Transient Values

```tsx
'use client'

function MouseTracker() {
  // ❌ WRONG - Re-renders on every mouse move
  const [mouseX, setMouseX] = useState(0)
  const [mouseY, setMouseY] = useState(0)

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMouseX(e.clientX) // Triggers re-render
      setMouseY(e.clientY) // Triggers another re-render
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

  // Heavy component re-renders 100s of times per second
  return <div>Mouse: ({mouseX}, {mouseY})</div>
}
```

**Problem**: Re-renders on every mouse move (hundreds per second).

### ✅ CORRECT - Use Ref for Transient Values

```tsx
'use client'

import { useRef, useEffect } from 'react'

function MouseTracker() {
  // ✅ CORRECT - No re-renders
  const mousePos = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mousePos.current.x = e.clientX // No re-render
      mousePos.current.y = e.clientY // No re-render

      // Only update UI when needed (e.g., on click)
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

  return <div>Tracking mouse position (check console)</div>
}
```

### Use Refs for

- Mouse/scroll positions (frequently changing)
- Animation frame IDs
- Interval/timeout IDs
- Previous values (for comparison)
- DOM element references
- Any value that changes frequently but doesn't need to trigger re-renders

---

## Pattern 7: Avoid Inline Object/Array Props

### ❌ WRONG - New Objects/Arrays on Every Render

```tsx
'use client'

function ParentComponent() {
  return (
    <div>
      {/* ❌ WRONG - New object on every render */}
      <MemoizedChild config={{ theme: 'dark', size: 'large' }} />

      {/* ❌ WRONG - New array on every render */}
      <MemoizedList items={['a', 'b', 'c']} />

      {/* ❌ WRONG - New function on every render */}
      <MemoizedButton onClick={() => console.log('clicked')} />
    </div>
  )
}
```

**Problem**: Even with `memo()`, child re-renders because props are new references.

### ✅ CORRECT - Stable References

```tsx
'use client'

import { useMemo, useCallback } from 'react'

// Hoist constants outside component
const DEFAULT_CONFIG = { theme: 'dark', size: 'large' } as const
const DEFAULT_ITEMS = ['a', 'b', 'c'] as const

function ParentComponent() {
  // Or use useMemo for dynamic values
  const config = useMemo(() => ({
    theme: 'dark',
    size: 'large'
  }), [])

  const handleClick = useCallback(() => {
    console.log('clicked')
  }, [])

  return (
    <div>
      {/* ✅ CORRECT - Stable references */}
      <MemoizedChild config={DEFAULT_CONFIG} />
      <MemoizedList items={DEFAULT_ITEMS} />
      <MemoizedButton onClick={handleClick} />
    </div>
  )
}
```

---

## Pattern 8: Virtualization for Large Lists

### ❌ WRONG - Render All Items

```tsx
'use client'

function LargeList({ items }: { items: Item[] }) {
  // ❌ WRONG - Renders 10,000 DOM nodes
  return (
    <div>
      {items.map(item => (
        <ItemCard key={item.id} item={item} />
      ))}
    </div>
  )
}
```

**Problem**: 10,000 items = 10,000 DOM nodes = slow rendering and scrolling.

### ✅ CORRECT - Virtualized List

```tsx
'use client'

import { useVirtualizer } from '@tanstack/react-virtual'
import { useRef } from 'react'

function VirtualizedList({ items }: { items: Item[] }) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 50, // Estimated row height
    overscan: 5 // Render 5 extra items above/below viewport
  })

  return (
    <div ref={parentRef} style={{ height: '600px', overflow: 'auto' }}>
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative'
        }}
      >
        {virtualizer.getVirtualItems().map(virtualRow => (
          <div
            key={virtualRow.index}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualRow.size}px`,
              transform: `translateY(${virtualRow.start}px)`
            }}
          >
            <ItemCard item={items[virtualRow.index]} />
          </div>
        ))}
      </div>
    </div>
  )
}
```

**Result**: Only renders ~20 visible items instead of 10,000.

---

## Pattern 9: startTransition for Non-Urgent Updates

### ❌ WRONG - Blocking Input

```tsx
'use client'

function SearchPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[]>([])

  const handleSearch = (value: string) => {
    setQuery(value) // Urgent: update input
    setResults(searchData(value)) // Blocks input if slow
  }

  return (
    <div>
      <input value={query} onChange={e => handleSearch(e.target.value)} />
      <SearchResults results={results} />
    </div>
  )
}
```

**Problem**: If `searchData()` is slow, input becomes laggy.

### ✅ CORRECT - Use startTransition

```tsx
'use client'

import { useState, startTransition } from 'react'

function SearchPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[]>([])

  const handleSearch = (value: string) => {
    setQuery(value) // Urgent: happens immediately

    // Non-urgent: can be interrupted
    startTransition(() => {
      setResults(searchData(value))
    })
  }

  return (
    <div>
      <input value={query} onChange={e => handleSearch(e.target.value)} />
      <SearchResults results={results} />
    </div>
  )
}
```

**Result**: Input stays responsive even when search is slow.

---

## Production Checklist

Before deploying, verify:

- [ ] **Expensive components memoized** - Use React.memo()
- [ ] **Expensive calculations memoized** - Use useMemo()
- [ ] **Stable callbacks** - Use useCallback() with functional setState
- [ ] **Lazy state initialization** - Function form for expensive initial values
- [ ] **Refs for transient values** - Mouse position, scroll, etc.
- [ ] **No inline object/array props** - Hoist or useMemo()
- [ ] **Large lists virtualized** - Use @tanstack/react-virtual
- [ ] **startTransition for slow updates** - Keep UI responsive

---

## Expected Results

Following these patterns, you should see:

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Data Table Filter | 2.3s | 0.3s | 87% faster |
| List Rendering (1000 items) | 1.1s | 0.2s | 82% faster |
| Form Input Lag | 150ms | 10ms | 93% faster |
| Re-renders per second | 100+ | 2-5 | 95% reduction |

---

## Summary

Client optimization is **critical** for runtime performance:

1. **React.memo()** - Prevent re-renders of expensive components
2. **useMemo()** - Cache expensive calculations
3. **useCallback()** - Stable callback references
4. **Functional setState** - Remove state dependencies from callbacks
5. **Lazy initialization** - Expensive initial state only calculated once
6. **useRef()** - Transient values that don't need re-renders
7. **Stable props** - Hoist objects/arrays outside components
8. **Virtualization** - Only render visible items
9. **startTransition** - Non-urgent updates don't block input

**Impact**: 80-90% fewer re-renders, 85% faster interactions, silky smooth UX.
