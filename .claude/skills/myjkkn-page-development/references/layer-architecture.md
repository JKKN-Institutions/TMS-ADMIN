# MyJKKN Layer Architecture Reference

Detailed architecture documentation covering data flow, folder structure, and inter-layer communication patterns.

## Full Stack Data Flow

```
USER ACTION (click, submit, navigate)
       |
       v
+------------------+
| Layer 7: PAGES   |  Server Components (list) / Client Components (CRUD)
| app/(routes)/    |  - Validates URL params with Zod schema
|                  |  - Renders layout (ContentLayout + Breadcrumb)
|                  |  - Passes validated params to child components
+--------+---------+
         |
         v
+------------------+
| Layer 6: COMPONENTS |  Client Components ('use client')
| _components/     |  - Data tables, forms, filters, dialogs
|                  |  - Permission-based conditional rendering
|                  |  - UI state management (useState)
|                  |  - Form validation (react-hook-form + Zod)
+--------+---------+
         |
    +----+----+
    |         |
    v         v
+--------+ +--------+
| L4:    | | L5:    |
| HOOKS  | | _DATA  |  React Query hooks (client) / Server data fetch
| hooks/ | | _data/ |
+---+----+ +---+----+
    |          |
    v          v
+------------------+
| Layer 3: SERVICE |  Static class methods
| lib/services/    |  - Supabase CRUD operations
|                  |  - Multi-tenant access control
|                  |  - Error code handling
|                  |  - Toast notifications
+--------+---------+
         |
         v
+------------------+
| Layer 2: TYPES   |  TypeScript interfaces
| types/           |  - Entity, CreateDto, UpdateDto
|                  |  - Filters, ListResponse
|                  |  - Enums, union types
+--------+---------+
         |
         v
+------------------+
| Layer 1: DATABASE |  Supabase / PostgreSQL
| supabase/setup/  |  - Tables with RLS
|                  |  - Indexes, triggers
|                  |  - Functions, policies
+------------------+
```

## Complete Project Folder Structure

```
MyJKKN/
|
+-- app/
|   +-- (routes)/
|   |   +-- organizations/          # Module Group
|   |   |   +-- layout.tsx          # Shared layout (sidebar, auth)
|   |   |   +-- dashboard/          # Dashboard page
|   |   |   +-- institutions/       # Entity: Institutions
|   |   |   |   +-- page.tsx        # List (Server Component)
|   |   |   |   +-- new/page.tsx    # Create (Client Component)
|   |   |   |   +-- [id]/
|   |   |   |   |   +-- page.tsx    # Detail (Client Component)
|   |   |   |   |   +-- edit/page.tsx # Edit (Client Component)
|   |   |   |   +-- _components/    # Private components
|   |   |   |   |   +-- columns.tsx
|   |   |   |   |   +-- institution-form.tsx
|   |   |   |   |   +-- institutions-data-table.tsx
|   |   |   |   |   +-- institution-filters.tsx
|   |   |   |   |   +-- institution-filters-client.tsx
|   |   |   |   |   +-- row-actions.tsx
|   |   |   |   |   +-- import-dialog.tsx
|   |   |   |   |   +-- data-table-schema.ts
|   |   |   |   +-- _data/          # Server data fetching
|   |   |   |       +-- get-institutions.ts
|   |   |   |
|   |   |   +-- degrees/            # Entity: Degrees (same structure)
|   |   |   +-- departments/        # Entity: Departments
|   |   |   +-- programs/           # Entity: Programs
|   |   |   +-- semesters/          # Entity: Semesters
|   |   |   +-- sections/           # Entity: Sections
|   |   |   +-- courses/            # Entity: Courses
|   |   |       +-- mappings/       # Sub-entity: Course Mappings
|   |   |
|   |   +-- academic/               # Module Group: Academic
|   |   |   +-- timetables/
|   |   |   +-- attendance/
|   |   |   +-- staff-planning/
|   |   |
|   |   +-- billing/                # Module Group: Billing
|   |   |   +-- invoices/
|   |   |   +-- payments/
|   |   |   +-- receipts/
|   |   |   +-- refunds/
|   |   |
|   |   +-- learners/               # Module Group: Learners
|   |   +-- staff/                   # Module Group: Staff
|   |   +-- admissions/             # Module Group: Admissions
|   |
|   +-- api/                        # API Routes
|       +-- organizations/
|       |   +-- programs/
|       |   |   +-- route.ts         # GET/POST handlers
|       |   |   +-- template/route.ts # Template download
|       |   |   +-- export/route.ts   # Export endpoint
|       |   +-- institutions/
|       |   +-- departments/
|       +-- academic/
|       +-- billing/
|
+-- lib/
|   +-- supabase/
|   |   +-- client.ts               # Browser Supabase client
|   |   +-- server.ts               # Server Supabase client
|   |   +-- middleware.ts            # Auth middleware client
|   |
|   +-- services/
|   |   +-- organization/           # Organization module services
|   |   |   +-- program-service.ts
|   |   |   +-- department-service.ts
|   |   |   +-- degree-service.ts
|   |   |   +-- semester-service.ts
|   |   |   +-- section-service.ts
|   |   |   +-- course-service.ts
|   |   |   +-- course-mapping-service.ts
|   |   |   +-- organization-service.ts  # Helper/utility methods
|   |   |   +-- dashboard-service.ts
|   |   |
|   |   +-- academic/               # Academic module services
|   |   |   +-- timetable-service.ts
|   |   |   +-- attendance-service.ts
|   |   |
|   |   +-- billing/                # Billing module services
|   |   |   +-- billing-invoice-service.ts
|   |   |   +-- billing-invoice-service-optimized.ts  # *_optimized pattern
|   |   |
|   |   +-- users/                   # User management services
|   |       +-- user-institution-access-service.ts
|   |       +-- user-role-service.ts
|   |
|   +-- config/
|   |   +-- query-config.ts         # React Query cache config
|   |
|   +-- utils/
|   |   +-- enhanced-logger.ts      # Logging utility
|   |
|   +-- sidebarMenuLink.ts          # Navigation menu definitions
|
+-- hooks/
|   +-- organization/               # Organization module hooks
|   |   +-- use-programs.ts
|   |   +-- use-departments.ts
|   |   +-- use-degrees.ts
|   |   +-- use-semesters.ts
|   |   +-- use-sections.ts
|   |   +-- use-courses.ts
|   |   +-- use-course-mappings.ts
|   |
|   +-- academic/                   # Academic module hooks
|   +-- billing/                    # Billing module hooks
|   +-- use-permissions.ts          # Permission check hook (shared)
|   +-- use-user-institution-access.ts  # Institution access hook (shared)
|
+-- types/
|   +-- organizations.ts            # Organization types (all entities)
|   +-- academic.ts                 # Academic types
|   +-- billing.ts                  # Billing types
|   +-- users.ts                    # User/auth types
|
+-- components/
|   +-- ui/                         # shadcn/ui components
|   |   +-- button.tsx
|   |   +-- card.tsx
|   |   +-- dialog.tsx
|   |   +-- badge.tsx
|   |   +-- input.tsx
|   |   +-- select.tsx
|   |   +-- switch.tsx
|   |   +-- form.tsx
|   |   +-- alert-dialog.tsx
|   |   +-- dropdown-menu.tsx
|   |   +-- ...
|   |
|   +-- data-table/                 # Shared data table system
|   |   +-- data-table.tsx          # Core data table (997 lines)
|   |   +-- column-header.tsx       # Sortable column header
|   |   +-- toolbar.tsx             # Search, filters, export
|   |   +-- pagination.tsx          # Page size, navigation
|   |
|   +-- layout/
|   |   +-- content-layout.tsx      # Page wrapper (Navbar + container)
|   |
|   +-- navigation/
|   |   +-- Breadcrumbs.tsx         # PageBreadcrumb component
|   |
|   +-- auth/
|       +-- permission-guard.tsx    # Permission guard components
|
+-- supabase/
|   +-- setup/
|   |   +-- 01_tables.sql           # All table definitions
|   |   +-- 02_functions.sql        # Database functions
|   |   +-- 03_policies.sql         # RLS policies
|   |   +-- 04_triggers.sql         # Triggers
|   |   +-- 05_views.sql            # Views
|   +-- SQL_FILE_INDEX.md            # Index of all SQL objects
|
+-- middleware.ts                    # Auth middleware (Supabase SSR)
```

## Layer Interaction Rules

### Layer 7 (Pages) Rules

| Page Type | Component Type | Data Source | Key Responsibilities |
|-----------|---------------|-------------|---------------------|
| List `page.tsx` | Server (async) | URL searchParams | Validate params, compose layout |
| Create `new/page.tsx` | Client | None (empty form) | Render form component |
| Detail `[id]/page.tsx` | Client | Service call in useEffect | Fetch entity, render details |
| Edit `[id]/edit/page.tsx` | Client | Service call in useEffect | Fetch entity, render form |

### Layer 6 (Components) Rules

| Component | Imports From | State Pattern | Key Feature |
|-----------|-------------|--------------|-------------|
| `columns.tsx` | Types, UI components | None | Pure column definitions |
| `*-data-table.tsx` | Service, permissions | useState | Toolbar, bulk ops, refresh |
| `*-form.tsx` | Service, Zod, react-hook-form | useForm | Validation, cascading selects |
| `*-filters.tsx` | Service | useState + useEffect | Dropdown loading, AbortController |
| `*-filters-client.tsx` | Router, searchParams | useCallback | URL manipulation |
| `row-actions.tsx` | Service, permissions | useState | Dropdown menu, delete dialog |
| `data-table-schema.ts` | Zod | None | Schema definition only |

### Layer 3 (Service) Rules

| Method Pattern | Input | Output | Error Handling |
|---------------|-------|--------|----------------|
| `createEntity(dto)` | CreateDto | Entity | 23505 duplicate check |
| `getEntity(id)` | UUID string | Entity | PGRST116 returns null |
| `getEntities(filters)` | Filters | ListResponse | Empty array on no match |
| `updateEntity(id, dto)` | UUID + UpdateDto | Entity | 23505 duplicate check |
| `deleteEntity(id)` | UUID string | void | Re-throw errors |

## Supabase Client Usage

### When to Use Which Client

| Context | Client | Import |
|---------|--------|--------|
| Service layer (browser-side) | `createClientSupabaseClient()` | `@/lib/supabase/client` |
| Server Components / _data/ | `createClient()` (await) | `@/lib/supabase/server` |
| Middleware | `createServerClient()` | `@supabase/ssr` |
| API Routes | `createClient()` (await) | `@/lib/supabase/server` |

### Important: Server vs Client

- **Server client** (`@/lib/supabase/server`): Uses `cookies()`, must be awaited, for Server Components and API routes
- **Browser client** (`@/lib/supabase/client`): Singleton, for service layer and client components
- **NEVER** use server client in 'use client' components
- **NEVER** use browser client in Server Components

## Permission System Architecture

```
Database: custom_roles table
    |
    v
RolePermissionData (type)
    |
    +-- permissions: Record<string, boolean>
    |   e.g., "organizations.programs.view": true
    |
    v
usePermissions() hook
    |
    +-- canAccess(module, action): boolean
    +-- isSuperAdmin: boolean
    +-- can(permission): boolean
    |
    v
UI Components (conditional rendering)
    |
    +-- Data table toolbar: Show/hide Add, Import, Export buttons
    +-- Row actions: Show/hide View, Edit, Delete options
    +-- Pages: Show/hide Edit button on detail page
```

### Permission Key Pattern

```
[module-group].[entity].[action]

Examples:
organizations.programs.view
organizations.programs.create
organizations.programs.edit
organizations.programs.delete
academic.timetables.view
billing.invoices.create
```

## Organization Module Hierarchy

Understanding the entity hierarchy is critical for cascading dropdowns and data dependencies:

```
Institution (root)
    |
    +-- Degree (UG, PG, Ph.D)
    |       |
    |       +-- Department
    |               |
    |               +-- Program
    |                       |
    |                       +-- Semester
    |                       |       |
    |                       |       +-- Section
    |                       |       |
    |                       |       +-- Course Mapping
    |                       |
    |                       +-- Academic Year
```

### Cascade Rules

When creating/editing entities with parent dependencies:

1. **Institution select** loads first (always available)
2. **Degree select** loads when institution is selected
3. **Department select** loads when degree is selected
4. **Program select** loads when department is selected
5. **Semester select** loads when program is selected
6. **Section select** loads when semester is selected

When a parent changes, ALL child selects reset to empty.

## React Query Cache Configuration

```typescript
// lib/config/query-config.ts
export const QUERY_CONFIG = {
  // For data that rarely changes (organization structure)
  STABLE_DATA: {
    staleTime: 5 * 60 * 1000,      // 5 minutes
    gcTime: 10 * 60 * 1000,         // 10 minutes garbage collection
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 1,
  },

  // For data that changes occasionally
  SEMI_STABLE_DATA: {
    staleTime: 2 * 60 * 1000,      // 2 minutes
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  },

  // For frequently changing data (attendance, billing)
  DYNAMIC_DATA: {
    staleTime: 30 * 1000,           // 30 seconds
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    retry: 2,
  },
};
```

### When to Use Each Tier

| Data Type | Cache Tier | Examples |
|-----------|-----------|----------|
| Organization structure | STABLE_DATA | Programs, degrees, departments |
| Academic configuration | SEMI_STABLE_DATA | Semesters, sections, timetables |
| Transactional data | DYNAMIC_DATA | Attendance, billing, payments |
| Dashboard stats | SEMI_STABLE_DATA | Counts, summaries |
| User sessions | DYNAMIC_DATA | Current user, permissions |

## Error Handling Strategy

### Database Error Codes

| Code | Meaning | User Message Pattern |
|------|---------|---------------------|
| `23505` | Unique constraint violation | `"[Field] already exists"` |
| `23503` | Foreign key violation | `"Invalid reference data"` |
| `PGRST116` | No rows returned | Return `null` (not an error) |
| `42P01` | Table not found | Log and re-throw |
| Other | Unknown DB error | Log and re-throw |

### Error Flow

```
Service Layer (catch error)
    |
    +-- Known error code? -> Throw descriptive Error message
    |
    +-- Unknown error? -> console.error + re-throw
    |
    v
Component Layer (catch error)
    |
    +-- toast.error(error.message || 'Fallback message')
    |
    +-- Set error state for UI display (if needed)
```

## URL State Management

### Search Params Flow

```
URL: /organizations/programs?page=1&search=cs&institution_id=abc

          Server Component (page.tsx)
          |
          +-- Parse with Zod: entitySearchParamsSchema.parse(searchParams)
          |
          v
          FilterClientComponent
          |
          +-- useSearchParams() to read current URL
          +-- useRouter().push() to update URL
          +-- Always reset page to 1 on filter change
          |
          v
          DataTableComponent
          |
          +-- Receives parsed search params as props
          +-- Passes to fetchData callback
          +-- DataTable component manages its own URL state (enableUrlState)
```

### Standard Search Params Schema

```typescript
z.object({
  // Pagination (always present)
  page: z.coerce.number().default(1),
  pageSize: z.coerce.number().default(10),

  // Search (text search across multiple columns)
  search: z.string().optional(),

  // Sorting
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),

  // Module-specific filters (vary by entity)
  institution_id: z.string().optional(),
  degree_id: z.string().optional(),
  status: z.enum(['active', 'inactive']).optional(),

  // Date range (JSON stringified)
  dateRange: z.string().optional().transform(parseJson),
})
```

## Import/Export Patterns

### Import Flow

```
User uploads file (.xlsx/.xls)
    |
    v
ImportDialog validates file type
    |
    v
FormData with file sent to API route
    |
    v
API route: /api/module/entity/route.ts (POST)
    |
    +-- Parse Excel file (xlsx library)
    +-- Validate each row
    +-- Insert valid rows
    +-- Return: { successCount, errorCount, errors[] }
    |
    v
ImportDialog shows results
    |
    +-- Success: toast + refresh table
    +-- Errors: scrollable error list with row numbers
```

### Export Flow

```
User clicks Export button
    |
    v
Fetch data from API: /api/module/entity/export?format=xlsx
    |
    v
Create Blob from response
    |
    v
Create temporary <a> element
    |
    +-- href = URL.createObjectURL(blob)
    +-- download = "entities-YYYY-MM-DD.xlsx"
    +-- Click programmatically
    +-- Cleanup: revokeObjectURL + remove element
```

### Template Download

```
API route: /api/module/entity/template (GET)
    |
    v
Generate Excel file with:
    +-- Header row with column names
    +-- Data validation (dropdowns for enums)
    +-- Example row (optional)
    |
    v
Return as downloadable file
```

## Navigation Registration

### Adding a New Module to Sidebar

```typescript
// lib/sidebarMenuLink.ts

// 1. Add menu group (if new module group)
{
  groupLabel: 'New Module Group',
  menus: [
    {
      href: '/module-group/dashboard',
      label: 'Dashboard',
      icon: LayoutGrid,
    },
    {
      href: '/module-group/entities',
      label: 'Entities',
      icon: GraduationCap,  // Choose appropriate Lucide icon
    },
    // Add more entities...
  ],
}

// 2. Add permission mappings
MENU_PERMISSIONS['/module-group/entities'] = 'module-group.entities.view';

// 3. Add role-based visibility (if needed)
// In GetRoleBasedPages function, filter menus by user role
```

### Common Icons Used

| Entity Type | Icon | Import |
|------------|------|--------|
| Dashboard | `LayoutGrid` | lucide-react |
| Institution | `Building` | lucide-react |
| Department | `Flame` | lucide-react |
| Program | `GraduationCap` | lucide-react |
| Calendar/Period | `CalendarDays` | lucide-react |
| Course/Book | `BookOpen` | lucide-react |
| Users/Students | `Users` | lucide-react |
| Settings | `Settings` | lucide-react |
| Reports | `BarChart3` | lucide-react |
