# Dashboard Layout Templates

Production-ready dashboard layout components.

## Files

- **app-sidebar.tsx** - Collapsible sidebar with navigation
- **header.tsx** - Header with breadcrumbs, search, user menu
- **breadcrumbs.tsx** - Dynamic route-based breadcrumbs
- **page-container.tsx** - Consistent page wrapper
- **info-sidebar.tsx** - Optional contextual tips sidebar
- **layout.tsx** - Main dashboard layout composition

## Installation

1. Copy all files to your project:
   ```
   components/layout/app-sidebar.tsx
   components/layout/header.tsx
   components/layout/breadcrumbs.tsx
   components/layout/page-container.tsx
   components/layout/info-sidebar.tsx
   app/(dashboard)/layout.tsx
   ```

2. Install dependencies:
   ```bash
   npm install lucide-react
   ```

3. Ensure you have Shadcn UI components:
   ```bash
   npx shadcn@latest add button input tooltip
   ```

## Usage

### Basic Layout

```tsx
// app/(dashboard)/layout.tsx
import { AppSidebar } from '@/components/layout/app-sidebar'
import { Header } from '@/components/layout/header'

export default function DashboardLayout({ children }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-auto bg-muted/40">
          {children}
        </main>
      </div>
    </div>
  )
}
```

### Page with PageContainer

```tsx
// app/(dashboard)/dashboard/products/page.tsx
import { PageContainer } from '@/components/layout/page-container'
import { Button } from '@/components/ui/button'

export default function ProductsPage() {
  return (
    <PageContainer
      title="Products"
      description="Manage your product catalog"
      actions={<Button>Create Product</Button>}
    >
      {/* Page content */}
    </PageContainer>
  )
}
```

### With InfoSidebar

```tsx
// app/(dashboard)/dashboard/products/new/page.tsx
import { PageContainer } from '@/components/layout/page-container'
import { InfoSidebar } from '@/components/layout/info-sidebar'

export default function NewProductPage() {
  return (
    <PageContainer title="Create Product">
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ProductForm />
        </div>

        <InfoSidebar title="Tips">
          <p>Provide clear product names</p>
          <p>Set competitive pricing</p>
          <p>Upload high-quality images</p>
        </InfoSidebar>
      </div>
    </PageContainer>
  )
}
```

## Dependencies

Required hooks and utilities:

- `useFilteredNav()` from `@/hooks/use-filtered-nav`
- `NavItem` type from `@/config/nav-config`
- `UserDropdown` from `@/components/header/user-dropdown`
- `ThemeToggle` from `@/components/theme-toggle`
- `cn()` from `@/lib/utils`

See auth templates and navigation templates for these dependencies.

## Customization

### Change Sidebar Width

```tsx
// app-sidebar.tsx
<aside className={cn(
  'relative flex flex-col border-r bg-background transition-all duration-300',
  isCollapsed ? 'w-16' : 'w-72' // Change from w-64
)}>
```

### Add Logo

```tsx
// app-sidebar.tsx
<div className="flex h-16 items-center border-b px-4">
  {!isCollapsed && (
    <Link href="/dashboard" className="flex items-center gap-2">
      <Image src="/logo.png" alt="Logo" width={32} height={32} />
      <span className="text-xl font-bold">Dashboard</span>
    </Link>
  )}
</div>
```

### Customize Header

```tsx
// header.tsx
<header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background px-4 md:px-6">
  {/* Add custom elements */}
  <NotificationBell />
  <CommandTrigger />
</header>
```

## Features

- **Responsive**: Works on mobile, tablet, desktop
- **Accessible**: ARIA labels and keyboard navigation
- **Persistent State**: Sidebar collapse saved to cookie
- **Theme Support**: Works with light/dark themes
- **Type-Safe**: Full TypeScript support
