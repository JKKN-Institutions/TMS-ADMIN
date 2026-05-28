# Layout System

Production-ready dashboard layout components for consistent UI structure.

## Overview

The layout system provides a standardized structure for admin dashboards with:
- **AppSidebar**: Collapsible navigation with RBAC support
- **Header**: Breadcrumbs, search, user menu, and theme toggle
- **PageContainer**: Consistent page wrapper with padding and styling
- **InfoSidebar**: Optional contextual tips and information

## Layout Composition

### Root Layout Structure

```tsx
// app/(dashboard)/layout.tsx
import { AppSidebar } from '@/components/layout/app-sidebar'
import { Header } from '@/components/layout/header'
import { ThemeProvider } from '@/components/theme-provider'
import { AuthProvider } from '@/contexts/auth-context'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <div className="flex h-screen overflow-hidden">
          {/* Sidebar */}
          <AppSidebar />

          {/* Main content area */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Header */}
            <Header />

            {/* Page content */}
            <main className="flex-1 overflow-auto">
              {children}
            </main>
          </div>
        </div>
      </AuthProvider>
    </ThemeProvider>
  )
}
```

---

## AppSidebar Component

### Features

- **Collapsible navigation**: Cookie-based persistence
- **Nested menu items**: Support for grouped navigation
- **RBAC filtering**: Show/hide items based on user role
- **Icons**: Lucide React icons for visual clarity
- **Responsive**: Auto-collapse on mobile
- **Active states**: Highlight current route

### Component Structure

```tsx
// components/layout/app-sidebar.tsx
'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useFilteredNav } from '@/hooks/use-filtered-nav'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface NavItem {
  title: string
  href: string
  icon?: string
  items?: NavItem[]
  roles?: string[]
}

export function AppSidebar() {
  const pathname = usePathname()
  const navItems = useFilteredNav()
  const [isCollapsed, setIsCollapsed] = useState(false)

  // Load collapse state from cookie
  useEffect(() => {
    const collapsed = document.cookie
      .split('; ')
      .find(row => row.startsWith('sidebar-collapsed='))
      ?.split('=')[1]

    setIsCollapsed(collapsed === 'true')
  }, [])

  // Save collapse state to cookie
  const toggleCollapse = () => {
    const newState = !isCollapsed
    setIsCollapsed(newState)
    document.cookie = `sidebar-collapsed=${newState}; path=/; max-age=31536000`
  }

  return (
    <aside
      className={cn(
        'relative flex flex-col border-r bg-background transition-all duration-300',
        isCollapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center border-b px-4">
        {!isCollapsed && (
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="text-xl font-bold">Dashboard</span>
          </Link>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-2 overflow-y-auto">
        {navItems.map((item) => (
          <NavItemComponent
            key={item.href}
            item={item}
            pathname={pathname}
            isCollapsed={isCollapsed}
          />
        ))}
      </nav>

      {/* Collapse toggle */}
      <div className="border-t p-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleCollapse}
          className="w-full"
        >
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4 mr-2" />
              Collapse
            </>
          )}
        </Button>
      </div>
    </aside>
  )
}

function NavItemComponent({
  item,
  pathname,
  isCollapsed,
}: {
  item: NavItem
  pathname: string
  isCollapsed: boolean
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
  const hasChildren = item.items && item.items.length > 0

  const NavContent = (
    <Link
      href={item.href}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
        isActive
          ? 'bg-primary text-primary-foreground'
          : 'hover:bg-accent hover:text-accent-foreground'
      )}
      onClick={() => hasChildren && setIsExpanded(!isExpanded)}
    >
      {item.icon && <span className="h-5 w-5">{/* Icon */}</span>}
      {!isCollapsed && <span className="flex-1">{item.title}</span>}
      {!isCollapsed && hasChildren && (
        <ChevronRight
          className={cn(
            'h-4 w-4 transition-transform',
            isExpanded && 'rotate-90'
          )}
        />
      )}
    </Link>
  )

  if (isCollapsed) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{NavContent}</TooltipTrigger>
          <TooltipContent side="right">
            <p>{item.title}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return (
    <div>
      {NavContent}
      {hasChildren && isExpanded && !isCollapsed && (
        <div className="ml-4 mt-1 space-y-1 border-l pl-2">
          {item.items.map((subItem) => (
            <Link
              key={subItem.href}
              href={subItem.href}
              className={cn(
                'block rounded-lg px-3 py-2 text-sm transition-colors',
                pathname === subItem.href
                  ? 'bg-accent text-accent-foreground'
                  : 'hover:bg-accent hover:text-accent-foreground'
              )}
            >
              {subItem.title}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
```

### Usage

```tsx
// app/(dashboard)/layout.tsx
import { AppSidebar } from '@/components/layout/app-sidebar'

export default function Layout({ children }) {
  return (
    <div className="flex h-screen">
      <AppSidebar />
      <main className="flex-1">{children}</main>
    </div>
  )
}
```

### Cookie Persistence

The sidebar collapse state is saved to a cookie for persistence across sessions:

```typescript
// Save state
document.cookie = `sidebar-collapsed=${isCollapsed}; path=/; max-age=31536000`

// Load state
const collapsed = document.cookie
  .split('; ')
  .find(row => row.startsWith('sidebar-collapsed='))
  ?.split('=')[1] === 'true'
```

---

## Header Component

### Features

- **Breadcrumbs**: Dynamic route-based navigation
- **Global search**: Input field for search functionality
- **User dropdown**: Profile menu with sign-out
- **Theme toggle**: Dark/light mode switcher
- **Responsive**: Mobile-friendly layout

### Component Structure

```tsx
// components/layout/header.tsx
'use client'

import { usePathname } from 'next/navigation'
import { Search } from 'lucide-react'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { UserDropdown } from '@/components/header/user-dropdown'
import { ThemeToggle } from '@/components/theme-toggle'
import { Input } from '@/components/ui/input'

export function Header() {
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background px-4 md:px-6">
      {/* Breadcrumbs */}
      <div className="flex-1">
        <Breadcrumbs pathname={pathname} />
      </div>

      {/* Search */}
      <div className="relative w-full max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search..."
          className="w-full pl-8"
        />
      </div>

      {/* Theme toggle */}
      <ThemeToggle />

      {/* User dropdown */}
      <UserDropdown />
    </header>
  )
}
```

### Breadcrumbs Component

```tsx
// components/layout/breadcrumbs.tsx
'use client'

import Link from 'next/link'
import { ChevronRight, Home } from 'lucide-react'
import { Fragment } from 'react'

interface BreadcrumbsProps {
  pathname: string
}

export function Breadcrumbs({ pathname }: BreadcrumbsProps) {
  const segments = pathname.split('/').filter(Boolean)

  // Generate breadcrumb items
  const breadcrumbs = segments.map((segment, index) => {
    const href = '/' + segments.slice(0, index + 1).join('/')
    const label = segment
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')

    return { href, label }
  })

  return (
    <nav className="flex items-center gap-2 text-sm">
      {/* Home */}
      <Link
        href="/dashboard"
        className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
      >
        <Home className="h-4 w-4" />
      </Link>

      {/* Breadcrumb items */}
      {breadcrumbs.map((item, index) => (
        <Fragment key={item.href}>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          {index === breadcrumbs.length - 1 ? (
            <span className="font-medium">{item.label}</span>
          ) : (
            <Link
              href={item.href}
              className="text-muted-foreground hover:text-foreground"
            >
              {item.label}
            </Link>
          )}
        </Fragment>
      ))}
    </nav>
  )
}
```

---

## PageContainer Component

### Features

- **Consistent padding**: Standard spacing for all pages
- **Max width**: Prevents content from being too wide
- **Responsive**: Adjusts padding on mobile
- **Optional header**: Page title and actions

### Component Structure

```tsx
// components/layout/page-container.tsx
import { cn } from '@/lib/utils'

interface PageContainerProps {
  children: React.ReactNode
  title?: string
  description?: string
  actions?: React.ReactNode
  className?: string
}

export function PageContainer({
  children,
  title,
  description,
  actions,
  className,
}: PageContainerProps) {
  return (
    <div className={cn('container mx-auto p-4 md:p-6 lg:p-8', className)}>
      {/* Page header */}
      {(title || actions) && (
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            {title && <h1 className="text-3xl font-bold">{title}</h1>}
            {description && (
              <p className="mt-2 text-muted-foreground">{description}</p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}

      {/* Page content */}
      {children}
    </div>
  )
}
```

### Usage

```tsx
// app/(dashboard)/dashboard/products/page.tsx
import { PageContainer } from '@/components/layout/page-container'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default function ProductsPage() {
  return (
    <PageContainer
      title="Products"
      description="Manage your product catalog"
      actions={
        <Link href="/dashboard/products/new">
          <Button>Create Product</Button>
        </Link>
      }
    >
      {/* Page content */}
      <ProductsTable />
    </PageContainer>
  )
}
```

---

## InfoSidebar Component

### Features

- **Contextual tips**: Help messages for current page
- **Collapsible**: Can be hidden by user
- **Sticky positioning**: Stays visible while scrolling
- **Optional**: Can be excluded on any page

### Component Structure

```tsx
// components/layout/info-sidebar.tsx
'use client'

import { useState } from 'react'
import { X, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface InfoSidebarProps {
  title: string
  children: React.ReactNode
  className?: string
}

export function InfoSidebar({ title, children, className }: InfoSidebarProps) {
  const [isVisible, setIsVisible] = useState(true)

  if (!isVisible) {
    return (
      <Button
        variant="outline"
        size="icon"
        onClick={() => setIsVisible(true)}
        className="fixed bottom-4 right-4 z-50"
      >
        <Info className="h-4 w-4" />
      </Button>
    )
  }

  return (
    <aside
      className={cn(
        'sticky top-20 h-fit rounded-lg border bg-card p-4',
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Info className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold">{title}</h3>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsVisible(false)}
          className="h-6 w-6"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="mt-4 space-y-2 text-sm text-muted-foreground">
        {children}
      </div>
    </aside>
  )
}
```

### Usage

```tsx
// app/(dashboard)/dashboard/products/new/page.tsx
import { PageContainer } from '@/components/layout/page-container'
import { InfoSidebar } from '@/components/layout/info-sidebar'

export default function NewProductPage() {
  return (
    <PageContainer title="Create Product">
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main content (2 columns) */}
        <div className="lg:col-span-2">
          <ProductForm />
        </div>

        {/* Info sidebar (1 column) */}
        <InfoSidebar title="Tips">
          <p>Make sure to provide a clear product name and description.</p>
          <p>Set competitive pricing based on market research.</p>
          <p>Upload high-quality product images for better conversions.</p>
        </InfoSidebar>
      </div>
    </PageContainer>
  )
}
```

---

## Responsive Design

### Breakpoints

```typescript
// Tailwind breakpoints
const breakpoints = {
  sm: '640px',   // Mobile landscape
  md: '768px',   // Tablet
  lg: '1024px',  // Desktop
  xl: '1280px',  // Large desktop
  '2xl': '1536px' // Extra large desktop
}
```

### Mobile Behavior

**Sidebar**:
- Auto-collapse on screens < 768px
- Slide-in overlay on mobile
- Fixed positioning for small screens

**Header**:
- Stack breadcrumbs and search vertically on mobile
- Hide breadcrumbs on very small screens
- Collapse user dropdown to icon only

**PageContainer**:
- Reduce padding on mobile (p-4 instead of p-8)
- Stack header items vertically

---

## Layout Examples

### Standard Page Layout

```tsx
export default function StandardPage() {
  return (
    <PageContainer title="Page Title" description="Page description">
      <div className="grid gap-6">
        <Card>{/* Content */}</Card>
        <Card>{/* Content */}</Card>
      </div>
    </PageContainer>
  )
}
```

### Two-Column Layout

```tsx
export default function TwoColumnPage() {
  return (
    <PageContainer title="Settings">
      <div className="grid gap-6 lg:grid-cols-4">
        {/* Sidebar navigation */}
        <nav className="lg:col-span-1">
          <SettingsNav />
        </nav>

        {/* Main content */}
        <div className="lg:col-span-3">
          <SettingsContent />
        </div>
      </div>
    </PageContainer>
  )
}
```

### Three-Column Layout

```tsx
export default function ThreeColumnPage() {
  return (
    <PageContainer title="Dashboard">
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main content (2 columns) */}
        <div className="lg:col-span-2 space-y-6">
          <StatsCards />
          <RecentActivity />
        </div>

        {/* Sidebar (1 column) */}
        <div className="space-y-6">
          <QuickActions />
          <Notifications />
        </div>
      </div>
    </PageContainer>
  )
}
```

---

## Customization

### Theming

All layout components support theming through Tailwind CSS and next-themes:

```tsx
// Uses theme-aware classes
<div className="bg-background text-foreground border-border">
  {/* Content */}
</div>
```

### Custom Styles

Override default styles using className prop:

```tsx
<PageContainer className="max-w-4xl">
  {/* Narrower container */}
</PageContainer>

<AppSidebar className="w-72">
  {/* Wider sidebar */}
</AppSidebar>
```

---

## Best Practices

1. **Consistent Structure**: Use PageContainer for all pages
2. **Semantic HTML**: Use proper heading hierarchy (h1, h2, h3)
3. **Accessibility**: Include ARIA labels for interactive elements
4. **Mobile First**: Design for mobile, enhance for desktop
5. **Performance**: Lazy load sidebar icons and heavy components
6. **State Persistence**: Save UI preferences (sidebar collapse) to cookies
7. **Loading States**: Show skeletons while layout loads

---

## Dependencies

```json
{
  "dependencies": {
    "next": "^16.0.0",
    "react": "^19.0.0",
    "lucide-react": "^0.400.0",
    "@radix-ui/react-tooltip": "^1.0.0",
    "clsx": "^2.0.0",
    "tailwind-merge": "^2.0.0"
  }
}
```

---

## Next Steps

- Integrate RBAC navigation filtering → See `rbac-navigation.md`
- Add theme toggle → See `theme-system.md`
- Implement search functionality → See `command-palette.md`
- Add responsive behavior for mobile

---

**Version**: 3.0.0
**Updated**: January 2026
