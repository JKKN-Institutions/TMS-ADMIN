# Frontend Module

Production-ready admin dashboard patterns for Next.js 16 applications.

## Overview

This module provides comprehensive UI patterns and components for building modern admin dashboards with Next.js 16, Shadcn UI, and Supabase Auth.

## Key Features

- **Layout System**: AppSidebar, Header, PageContainer with responsive design
- **Form Components**: 12 standardized form types with React Hook Form + Zod validation
- **Data Tables**: TanStack Table v8 with server-side filtering, sorting, and pagination
- **Authentication**: Supabase Auth integration with SSR and middleware
- **RBAC Navigation**: Role-based access control with permission filtering
- **Theme System**: Dark/light mode with next-themes
- **Command Palette**: Global search with kbar (Cmd+K)
- **Charts & Analytics**: Recharts wrappers for dashboard visualizations
- **Drag & Drop**: dnd-kit for Kanban boards and sortable lists
- **File Upload**: React Dropzone with validation patterns

## Tech Stack

**Core Framework**:
- Next.js 16 (App Router)
- React 19.2
- TypeScript 5.7

**UI Libraries**:
- Shadcn UI (45+ components)
- Radix UI primitives
- Tailwind CSS 4
- Lucide React icons

**Forms & Validation**:
- React Hook Form 7.x
- Zod 4.x
- @hookform/resolvers

**Data Tables**:
- TanStack React Table 8.x
- Nuqs 2.x (URL state management)

**Authentication**:
- Supabase Auth
- @supabase/ssr
- @supabase/supabase-js

**State Management**:
- Zustand 5.x (client state)

**Additional Features**:
- @dnd-kit/* (drag-drop)
- Recharts 2.x (charts)
- kbar 0.1.x (command palette)
- React Dropzone 14.x (file upload)
- next-themes (theme switching)
- Motion 11.x (animations)

## Quick Start

### 1. Initialize Dashboard

```bash
# Run the initialization script
bash scripts/init_dashboard.sh

# This will:
# - Install Next.js 16 with Turbopack
# - Install Shadcn UI CLI and components
# - Configure Tailwind CSS 4
# - Set up TypeScript strict mode
# - Create folder structure
# - Install all dependencies (~45 packages)
```

### 2. Set Up Authentication

```bash
# Run the auth setup script
bash scripts/setup_auth.sh

# This will:
# - Configure Supabase Auth with SSR
# - Create middleware for route protection
# - Set up AuthContext provider
# - Generate auth pages (sign-in, sign-up)
# - Configure environment variables
```

### 3. Start Building Modules

Follow the module builder workflow to create CRUD features combining Frontend UI with Backend data patterns.

## Module Contents

### Layout System (`layout-system.md`)
- AppSidebar with collapsible navigation
- Header with breadcrumbs, search, user menu
- PageContainer for consistent page structure
- InfoSidebar for contextual tips

### Form Patterns (`form-patterns.md`)
12 reusable form components:
1. FormInput - Text inputs with validation
2. FormSelect - Dropdown selects
3. FormCheckbox - Single checkboxes
4. FormRadioGroup - Radio button groups
5. FormDatePicker - Date selection
6. FormTextarea - Multi-line text
7. FormSlider - Range sliders
8. FormSwitch - Toggle switches
9. FormFileUpload - File uploads with preview
10. FormCheckboxGroup - Multiple checkboxes
11. FormOTP - One-time password input
12. BaseFormFieldProps - Shared interface

### Data Table Patterns (`data-table-patterns.md`)
- TanStack Table v8 setup
- useDataTable hook with URL state (Nuqs)
- Server-side search, filter, pagination
- Column sorting and filtering
- Toolbar with search and faceted filters
- Loading skeletons

### RBAC Navigation (`rbac-navigation.md`)
- Navigation configuration structure
- Permission-based filtering
- useFilteredNavItems hook
- Nested menu support
- Dynamic breadcrumbs

### Command Palette (`command-palette.md`)
- kbar integration
- Global search (Cmd+K / Ctrl+K)
- Command registration
- Navigation shortcuts

### Charts & Analytics (`charts-analytics.md`)
- Recharts integration
- Responsive chart containers
- Area, Bar, Line, Pie charts
- Dashboard analytics patterns

### Drag & Drop (`drag-drop-patterns.md`)
- dnd-kit setup
- Kanban board component
- Sortable lists
- Drag-drop utilities

### File Upload (`file-upload-patterns.md`)
- React Dropzone integration
- File validation
- Preview components
- Upload progress

### Theme System (`theme-system.md`)
- next-themes setup
- Dark/light mode toggle
- Theme persistence
- System preference detection

## Integration with Backend Module

Frontend components integrate seamlessly with Backend Module patterns:

**Data Flow**:
1. **Data Tables** → Use cached data from Backend Module (Pattern 1)
2. **Forms** → Submit to Server Actions (Pattern 2)
3. **Pages** → Wrap with Suspense boundaries (Pattern 3)
4. **Cache Invalidation** → Forms trigger updateTag() (Pattern 2)

**Example Integration**:
```tsx
// Frontend: Data table component
export function ProductsTable({ products }) {
  // Uses TanStack Table from Frontend Module
  const table = useDataTable({ data: products })
  return <DataTable table={table} />
}

// Backend: Cached data fetching
export async function getProducts() {
  'use cache'
  cacheLife('hours')
  cacheTag('products')
  // ... fetch data
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
  const products = await getProducts() // Backend Module
  return <ProductsTable products={products} /> // Frontend Module
}
```

## Next Steps

1. **Read individual pattern files** for detailed implementation guides
2. **Use workflows/** for end-to-end development guidance
3. **Copy templates/** for production-ready component code
4. **Refer to Backend Module** for data layer patterns

## Resources

- [Complete Workflow](../../workflows/complete-workflow.md)
- [Module Builder Workflow](../../workflows/module-builder-workflow.md)
- [Auth Integration Workflow](../../workflows/auth-integration-workflow.md)
- [Backend Module](../02-backend/README.md)
- [Shadcn UI Guide](../../references/shadcn-ui-guide.md)
- [Tech Stack Reference](../../references/tech-stack-reference.md)
