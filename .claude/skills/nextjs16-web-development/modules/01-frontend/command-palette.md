# Command Palette

Global search with kbar (Cmd+K / Ctrl+K).

## Overview

Command palette provides quick navigation and actions using keyboard shortcuts:
- **Global search**: Access from anywhere with Cmd+K
- **Navigation**: Quick jump to pages
- **Actions**: Execute common tasks
- **Fuzzy search**: Smart filtering
- **Keyboard-first**: Efficient navigation

---

## Installation

```bash
npm install kbar
```

---

## Setup

### KBarProvider Configuration

```tsx
// components/command-palette/command-bar-provider.tsx
'use client'

import { useRouter } from 'next/navigation'
import {
  KBarProvider,
  KBarPortal,
  KBarPositioner,
  KBarAnimator,
  KBarSearch,
  useMatches,
  KBarResults,
  Action,
} from 'kbar'
import { useAuth } from '@/contexts/auth-context'

export function CommandBarProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { signOut } = useAuth()

  const actions: Action[] = [
    // Navigation
    {
      id: 'dashboard',
      name: 'Dashboard',
      shortcut: ['d'],
      keywords: 'home overview',
      section: 'Navigation',
      perform: () => router.push('/dashboard'),
    },
    {
      id: 'products',
      name: 'Products',
      shortcut: ['p'],
      keywords: 'items catalog',
      section: 'Navigation',
      perform: () => router.push('/dashboard/products'),
    },
    {
      id: 'orders',
      name: 'Orders',
      shortcut: ['o'],
      keywords: 'purchases sales',
      section: 'Navigation',
      perform: () => router.push('/dashboard/orders'),
    },
    {
      id: 'users',
      name: 'Users',
      shortcut: ['u'],
      keywords: 'customers members',
      section: 'Navigation',
      perform: () => router.push('/dashboard/users'),
    },

    // Actions
    {
      id: 'create-product',
      name: 'Create Product',
      shortcut: ['c', 'p'],
      keywords: 'new add',
      section: 'Actions',
      perform: () => router.push('/dashboard/products/new'),
    },
    {
      id: 'settings',
      name: 'Settings',
      shortcut: ['s'],
      keywords: 'preferences config',
      section: 'Actions',
      perform: () => router.push('/dashboard/settings'),
    },
    {
      id: 'sign-out',
      name: 'Sign Out',
      shortcut: ['shift', 'q'],
      keywords: 'logout exit',
      section: 'Account',
      perform: () => signOut(),
    },

    // Documentation
    {
      id: 'docs',
      name: 'Documentation',
      keywords: 'help guide',
      section: 'Help',
      perform: () => window.open('https://docs.example.com', '_blank'),
    },
  ]

  return (
    <KBarProvider actions={actions}>
      <CommandBar />
      {children}
    </KBarProvider>
  )
}

function CommandBar() {
  return (
    <KBarPortal>
      <KBarPositioner className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm">
        <KBarAnimator className="w-full max-w-2xl mx-auto mt-24">
          <div className="bg-background border rounded-lg shadow-lg overflow-hidden">
            <KBarSearch className="w-full px-4 py-3 border-b outline-none bg-background" />
            <RenderResults />
          </div>
        </KBarAnimator>
      </KBarPositioner>
    </KBarPortal>
  )
}

function RenderResults() {
  const { results } = useMatches()

  return (
    <KBarResults
      items={results}
      onRender={({ item, active }) =>
        typeof item === 'string' ? (
          <div className="px-4 py-2 text-xs font-semibold text-muted-foreground">
            {item}
          </div>
        ) : (
          <div
            className={`px-4 py-3 flex items-center justify-between cursor-pointer ${
              active ? 'bg-accent' : ''
            }`}
          >
            <div className="flex items-center gap-3">
              <div>{item.name}</div>
            </div>
            {item.shortcut?.length && (
              <div className="flex gap-1">
                {item.shortcut.map((key) => (
                  <kbd
                    key={key}
                    className="px-2 py-1 text-xs bg-muted rounded border"
                  >
                    {key}
                  </kbd>
                ))}
              </div>
            )}
          </div>
        )
      }
    />
  )
}
```

### Add to Layout

```tsx
// app/layout.tsx
import { CommandBarProvider } from '@/components/command-palette/command-bar-provider'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <CommandBarProvider>
          {children}
        </CommandBarProvider>
      </body>
    </html>
  )
}
```

---

## Usage

### Trigger Command Palette

Users can open the command palette by:
- Pressing `Cmd+K` (Mac) or `Ctrl+K` (Windows/Linux)
- Clicking a trigger button

### Trigger Button

```tsx
// components/header/command-trigger.tsx
'use client'

import { Search } from 'lucide-react'
import { useKBar } from 'kbar'
import { Button } from '@/components/ui/button'

export function CommandTrigger() {
  const { query } = useKBar()

  return (
    <Button
      variant="outline"
      className="relative w-full justify-start text-sm text-muted-foreground sm:pr-12 md:w-40 lg:w-64"
      onClick={() => query.toggle()}
    >
      <Search className="mr-2 h-4 w-4" />
      <span className="hidden lg:inline-flex">Search...</span>
      <span className="inline-flex lg:hidden">Search</span>
      <kbd className="pointer-events-none absolute right-1.5 top-2 hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
        <span className="text-xs">⌘</span>K
      </kbd>
    </Button>
  )
}
```

---

## Dynamic Actions

### Load Actions from API

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useRegisterActions } from 'kbar'

export function DynamicActions() {
  const [products, setProducts] = useState([])

  useEffect(() => {
    // Fetch products
    fetch('/api/products')
      .then(res => res.json())
      .then(data => setProducts(data))
  }, [])

  // Register product actions
  useRegisterActions(
    products.map(product => ({
      id: `product-${product.id}`,
      name: product.name,
      keywords: product.name.toLowerCase(),
      section: 'Products',
      perform: () => router.push(`/dashboard/products/${product.id}`),
    })),
    [products]
  )

  return null
}
```

---

## Best Practices

1. **Group actions**: Use sections for organization
2. **Keywords**: Add synonyms for better search
3. **Shortcuts**: Assign memorable shortcuts
4. **Icons**: Add visual cues
5. **Dynamic actions**: Load context-specific actions

---

**Version**: 3.0.0
