---
name: myjkkn-page-development
description: Comprehensive guide for designing and developing new pages, routes, APIs, services, hooks, types, and database schemas in the MyJKKN project. This skill should be used when creating a new module, adding new pages or routes, building CRUD features, designing database tables, creating service layers, implementing React Query hooks, or setting up data tables with filters. Automatically triggers when user mentions 'new page', 'new module', 'new route', 'add page', 'create page', 'CRUD', 'data table', 'new feature', 'add feature', 'page development', or 'module development'.
---

# MyJKKN Page Development

## Overview

This skill provides the complete workflow, conventions, folder structure, and layer architecture for developing new pages, modules, and features in the MyJKKN education management system. It covers the full stack from database schema to UI components, following established patterns from existing modules like Organizations/Programs.

## Architecture Layers

MyJKKN follows a strict 7-layer architecture. Every new feature touches these layers in order:

```
Layer 1: Database (Supabase)       - Tables, RLS, indexes, triggers
Layer 2: Types (TypeScript)        - Interfaces, DTOs, enums, filters
Layer 3: Service Layer             - Supabase queries, CRUD, error handling
Layer 4: React Query Hooks         - Caching, invalidation, data fetching
Layer 5: Data Fetching (_data/)    - Server-side data utilities
Layer 6: Components (_components/) - Forms, tables, filters, dialogs
Layer 7: Pages (app routes)        - Server/client pages, layouts, navigation
```

## Folder Structure Convention

### Full Module Structure

```
app/(routes)/[module-group]/[entity]/
  page.tsx                          # List page (Server Component)
  new/
    page.tsx                        # Create page (Client Component)
  [id]/
    page.tsx                        # Detail/View page (Client Component)
    edit/
      page.tsx                      # Edit page (Client Component)
  _components/
    columns.tsx                     # TanStack Table column definitions
    [entity]-data-table.tsx         # DataTable wrapper with toolbar
    [entity]-form.tsx               # Create/Edit form (shared)
    [entity]-filters.tsx            # Filter UI (presentation)
    [entity]-filters-client.tsx     # Filter logic (URL state)
    row-actions.tsx                 # Row dropdown menu (View/Edit/Delete)
    import-dialog.tsx               # Import dialog
    data-table-schema.ts            # Zod schema for URL search params
  _data/
    get-[entities].ts               # Server-side data fetching utility

types/
  [module].ts                       # TypeScript interfaces and DTOs

lib/services/[module-group]/
  [entity]-service.ts               # Service class with static methods

hooks/[module-group]/
  use-[entities].ts                 # React Query hook

api/[module-group]/[entity]/
  route.ts                          # API routes (if needed)
  template/route.ts                 # Template download endpoint
  export/route.ts                   # Export endpoint
```

### Naming Conventions

| Item | Convention | Example |
|------|-----------|---------|
| Route folder | lowercase plural | `programs/`, `sections/` |
| Component files | kebab-case | `program-form.tsx` |
| Service classes | PascalCase | `ProgramService` |
| Service files | kebab-case | `program-service.ts` |
| Hook files | kebab-case with `use-` | `use-programs.ts` |
| Hook functions | camelCase with `use` | `usePrograms()` |
| Type files | kebab-case or module name | `organizations.ts` |
| Type interfaces | PascalCase | `Program`, `CreateProgramDto` |
| DB tables | snake_case plural | `programs` |
| DB columns | snake_case singular | `program_name` |
| Query keys | lowercase plural | `['programs', filters]` |

## Workflow Decision Tree

```
New feature/page request?
  |
  +--> Does the table exist in database?
  |      |
  |      +--> NO: Follow Layer 1-7 (Full Module Creation)
  |      +--> YES: Skip to Layer 2 (Types) or relevant layer
  |
  +--> Is this a sub-feature of existing module?
  |      |
  |      +--> YES: Add to existing types/services, create new page
  |      +--> NO: Create new module folder structure
  |
  +--> Does it need its own data table?
         |
         +--> YES: Create columns.tsx, data-table.tsx, filters, schema
         +--> NO: Create simple page with form or display components
```

## Layer 1: Database Schema

**Prerequisite:** Use `supabase-expert` skill for all database work.

### Standard Table Template

Every MyJKKN table MUST include:

```sql
CREATE TABLE IF NOT EXISTS public.[entities] (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES public.institutions(id),
    [entity]_id TEXT NOT NULL,              -- Natural key (uppercase)
    [entity]_name TEXT NOT NULL,
    -- domain-specific columns --
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES public.profiles(id)
);

-- Enable RLS
ALTER TABLE public.[entities] ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_[entities]_institution
    ON public.[entities](institution_id);
CREATE INDEX IF NOT EXISTS idx_[entities]_active
    ON public.[entities](is_active);

-- Updated_at trigger
CREATE TRIGGER trg_[entities]_updated_at
    BEFORE UPDATE ON public.[entities]
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Table comment
COMMENT ON TABLE public.[entities] IS 'Description of the table purpose';
```

### Multi-Tenant Rule

ALL tables MUST have `institution_id` for multi-tenant isolation. Filter queries by user-accessible institutions.

## Layer 2: TypeScript Types

**Location:** `types/[module].ts`

### Standard Type Pattern

```typescript
// Entity interface (matches DB columns)
export interface Program {
  id: string;
  institution_id: string;
  program_id: string;
  program_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string;
  // Joined relations (optional, populated by select)
  institution?: { id: string; name: string; counselling_code: string };
  degree?: { id: string; degree_id: string; degree_name: string };
}

// Create DTO (omit auto-generated fields)
export interface CreateProgramDto {
  institution_id: string;
  program_id: string;
  program_name: string;
  is_active?: boolean;
}

// Update DTO (all fields optional)
export interface UpdateProgramDto extends Partial<CreateProgramDto> {}

// Filter interface (for list queries)
export interface ProgramFilters {
  search?: string;
  institution_id?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
  userId?: string;
  bypassInstitutionFilter?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// List response (with pagination metadata)
export interface ProgramListResponse {
  data: Program[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
```

### Type Rules

- Entity interface: Match database columns + optional joined relations
- CreateDto: Omit `id`, `created_at`, `updated_at` (auto-generated)
- UpdateDto: `Partial<CreateDto>` (all fields optional)
- Filters: Include `search`, `page`, `limit`, `userId`, parent entity IDs
- ListResponse: Always wrap with `metadata` for pagination

## Layer 3: Service Layer

**Location:** `lib/services/[module-group]/[entity]-service.ts`

See `references/component-patterns.md` for the complete service class template with all CRUD methods, error handling, and multi-tenant access control.

### Service Rules

- Use static methods (no instantiation needed)
- Use `createClientSupabaseClient()` for browser-side client
- Handle error codes: `23505` (duplicate), `23503` (FK violation), `PGRST116` (not found)
- Show toast on successful mutations
- Dynamic import `UserInstitutionAccessService` to avoid circular deps
- Uppercase code/ID fields on create and update
- Always set `updated_at` on updates
- Support `bypassInstitutionFilter` for admin operations

## Layer 4: React Query Hooks

**Location:** `hooks/[module-group]/use-[entities].ts`

### Standard Hook Pattern

```typescript
import { useQuery } from '@tanstack/react-query';
import { EntityService } from '@/lib/services/[module]/entity-service';
import { QUERY_CONFIG } from '@/lib/config/query-config';

export function useEntities(filters: EntityFilters) {
  return useQuery({
    queryKey: ['entities', filters],
    queryFn: async () => {
      const { data, metadata } = await EntityService.getEntities(filters);
      return { data, metadata };
    },
    placeholderData: (previousData) => previousData,
    ...QUERY_CONFIG.STABLE_DATA
  });
}
```

### Caching Tiers

```
STABLE_DATA:      staleTime: 5min,  gcTime: 10min  (Programs, degrees)
SEMI_STABLE_DATA: staleTime: 2min,  gcTime: 5min   (Sections, semesters)
DYNAMIC_DATA:     staleTime: 30sec, gcTime: 5min    (Attendance, billing)
```

### Cache Invalidation (after mutations)

```typescript
await queryClient.invalidateQueries({ queryKey: ['entities'] });
await queryClient.invalidateQueries({ queryKey: ['module-stats'] });
router.refresh();
```

## Layer 5: Server Data Fetching

**Location:** `_data/get-[entities].ts`

Use `createClient` from `@/lib/supabase/server` for server-side queries. This layer is for Server Components that need to pre-fetch data before passing to client components.

## Layer 6: Components

See `references/component-patterns.md` for complete templates of each component type.

### Component Decision Guide

| Component | When to Create | Key Features |
|-----------|---------------|--------------|
| `columns.tsx` | Always for data tables | Checkbox, sortable headers, linked names, badges, actions |
| `[entity]-data-table.tsx` | Always for list pages | Toolbar, bulk delete, import/export, permission checks |
| `[entity]-form.tsx` | Always for create/edit | Zod schema, cascading selects, switch for booleans |
| `[entity]-filters.tsx` | When list has filters | Cascading dropdowns, AbortController cleanup |
| `[entity]-filters-client.tsx` | URL-based filters | URL param manipulation, page reset on filter change |
| `row-actions.tsx` | Always for data tables | Permission-based dropdown, delete confirmation |
| `import-dialog.tsx` | When import needed | Drag-drop, file validation, progress, error display |
| `data-table-schema.ts` | Always for data tables | Zod schema for URL search params |

## Layer 7: Pages

### Page Types

| Route | Component Type | Purpose |
|-------|---------------|---------|
| `page.tsx` | Server (async) | List view - validates search params, renders filters + data table |
| `new/page.tsx` | Client | Create form wrapped in Card + ContentLayout |
| `[id]/page.tsx` | Client | Detail view - fetches entity, renders in 2-col grid |
| `[id]/edit/page.tsx` | Client | Edit form - fetches entity, passes to form with `isEditing={true}` |

### Standard List Page (Server Component)

```typescript
export default async function EntitiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const search = entitySearchParamsSchema.parse(await searchParams);
  return (
    <ContentLayout title='Entities'>
      <PageBreadcrumb items={[...]} />
      <div className='space-y-6 mt-4 w-full min-w-0 px-4 md:px-8'>
        <div>
          <h1 className='text-2xl font-bold py-1'>Entities</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>Description</p>
        </div>
        <EntityFiltersClient searchParams={search} />
        <EntitiesDataTable search={search} />
      </div>
    </ContentLayout>
  );
}
```

## Permission Integration

### Permission Keys Convention

```
[module-group].[entity].view
[module-group].[entity].create
[module-group].[entity].edit
[module-group].[entity].delete
```

### Permission Check Pattern

```typescript
const { canAccess, isSuperAdmin } = usePermissions();
const canCreate = isSuperAdmin || canAccess('organizations.programs', 'create');
```

### UI Rules

- Hide buttons/actions user cannot perform
- Disable with `opacity-50 cursor-not-allowed` for partial access
- Row actions: Return `null` if no permissions at all
- Data table toolbar: Conditionally show Add/Import/Export buttons

## Navigation Registration

**Location:** `lib/sidebarMenuLink.ts`

```typescript
// Add menu item under the correct group
{ href: '/module-group/entities', label: 'Entities', icon: IconName }

// Add permission mapping
MENU_PERMISSIONS['/module-group/entities'] = 'module-group.entities.view';
```

## Common Patterns

### Cascading Dropdowns

Use 3 `useEffect` hooks with `AbortController` for cleanup. Reset child values when parent changes. See `references/component-patterns.md` for full implementation.

### Bulk Operations

Use `Promise.allSettled` for partial failure handling. Show success/error counts via toast.

### Export/Download

Use Blob URL creation pattern with cleanup. Support Excel, CSV, and JSON formats.

## Pre-Flight Checklist

Before creating any new page/module:

- [ ] Check if table exists (use `supabase-expert` skill + MCP)
- [ ] Check if types already exist in `types/` folder
- [ ] Check if service already exists in `lib/services/`
- [ ] Check if hook already exists in `hooks/`
- [ ] Identify parent entities for cascading dropdowns
- [ ] Determine permission keys needed
- [ ] Plan URL search params for data table filters
- [ ] Follow naming conventions (see table above)

## Quick Start Commands

### For Complete New Module

```
Create [MODULE_NAME] module with entities [ENTITY_LIST].
Follow myjkkn-page-development skill:
1. Design DB schema (use supabase-expert skill)
2. Create types in types/[module].ts
3. Create service in lib/services/[module]/
4. Create hook in hooks/[module]/
5. Create page structure with all _components
6. Register in sidebar navigation
```

### For Adding Page to Existing Module

```
Add [ENTITY] page to [MODULE] module.
Follow myjkkn-page-development skill:
1. Add types to existing types file
2. Create service class
3. Create React Query hook
4. Create full page structure (list/create/detail/edit)
5. Create all _components
```

## Resources

### References (Load as needed)

- `references/component-patterns.md` - Complete component and service templates
- `references/layer-architecture.md` - Detailed layer architecture with data flow

## Integration with Other Skills

- **supabase-expert**: Layer 1 (database) work
- **brand-styling**: UI consistency
- **import-export-advanced**: Import/export dialogs
- **jkkn-terminologies**: Entity naming and labels
- **vercel-react-best-practices**: Performance optimization
