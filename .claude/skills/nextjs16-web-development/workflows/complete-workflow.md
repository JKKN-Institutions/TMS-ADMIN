# Complete Workflow: Dashboard Setup → Module Development → Deployment

End-to-end guide for building a production-ready Next.js 16 admin dashboard.

## Overview

This workflow guides you through the complete development process from initial dashboard setup to production deployment, integrating both Frontend and Backend modules.

## Workflow Phases

### Phase 1: Project Initialization
**Goal**: Set up Next.js 16 project with all dependencies

**Steps**:
1. Run init_dashboard.sh script
2. Install Next.js 16 with App Router and Turbopack
3. Install Shadcn UI CLI and components (~45 packages)
4. Configure Tailwind CSS 4
5. Set up TypeScript strict mode
6. Create folder structure (features/, components/, lib/, hooks/, config/)
7. Configure next.config.ts with Cache Components

**Output**: Project structure with all dependencies installed

---

### Phase 2: Dashboard Layout Setup
**Goal**: Create the base dashboard layout with navigation

**Steps**:
1. Create root layout with providers:
   - ThemeProvider (next-themes)
   - AuthProvider (Supabase context)
2. Implement AppSidebar:
   - Collapsible navigation (cookie-based persistence)
   - Nested menu items with icons
   - RBAC filtering integration
3. Implement Header:
   - Breadcrumbs with dynamic generation
   - Global search input
   - User dropdown menu
   - Theme toggle (dark/light)
4. Set up PageContainer wrapper
5. Configure navigation structure in `nav-config.ts`

**References**:
- Frontend Module: `layout-system.md`
- Frontend Module: `rbac-navigation.md`
- Frontend Module: `theme-system.md`
- Templates: `dashboard-layout/`

**Output**: Functional dashboard shell with navigation

---

### Phase 3: Authentication Integration
**Goal**: Set up Supabase Auth with SSR and route protection

**Steps**:
1. Run setup_auth.sh script
2. Configure Supabase Auth client (SSR)
3. Set up environment variables (.env.local)
4. Implement middleware for route protection
5. Create AuthContext provider
6. Add user dropdown to header
7. Create sign-in/sign-up pages

**References**:
- Workflow: `auth-integration-workflow.md`
- Frontend Module: `layout-system.md` (user dropdown)
- Templates: `auth/`
- Reference: `supabase-auth-patterns.md`

**Output**: Working authentication system with protected routes

---

### Phase 4: Core Components Setup
**Goal**: Install reusable components for module development

**Steps**:
1. Install form components (12 types):
   - Copy templates to `components/forms/`
   - Configure BaseFormFieldProps interface
2. Set up data table system:
   - Copy `useDataTable` hook
   - Install Nuqs for URL state
   - Configure TanStack Table
3. Configure RBAC navigation:
   - Set up permission structure
   - Implement `useFilteredNavItems` hook
4. Add command palette (optional):
   - Install kbar
   - Configure commands
5. Install chart components (optional):
   - Copy Recharts wrappers

**References**:
- Frontend Module: `form-patterns.md`
- Frontend Module: `data-table-patterns.md`
- Frontend Module: `rbac-navigation.md`
- Frontend Module: `command-palette.md`
- Frontend Module: `charts-analytics.md`
- Templates: `form-components/`, `data-table/`, `command-palette/`, `charts/`

**Output**: Library of reusable components ready for module development

---

### Phase 5: Module Development (Repeatable)
**Goal**: Build a complete CRUD feature module

For each feature module, follow these steps:

#### Step 1: Database Layer (Backend Module)
- Create Supabase table with proper types
- Add RLS policies using `auth.uid()`
- Define foreign key relationships
- Create indexes for performance

**References**:
- Reference: `database-patterns.md`
- Backend Module: `database-layer.md`

#### Step 2: Type Definitions
- Create `types/[module].ts`
- Define TypeScript interface
- Create Zod schemas (insert, update, select)

**References**:
- Backend Module: Pattern 4 (form-validation)

#### Step 3: Data Layer (Backend Module)
- Create `lib/data/[module].ts`
- Write cached fetching functions with `'use cache'`
- Add `cacheTag()` for invalidation
- Configure `cacheLife()` profiles (hot/warm/cold/static)

**References**:
- Backend Module: Pattern 1 (cached-data)
- Backend Module: Pattern 7 (cache-profiles)
- Backend Module: Pattern 8 (cache-tags)

#### Step 4: Server Actions (Backend Module)
- Create `app/actions/[module].ts`
- Implement create, update, delete actions
- Add Zod validation on all inputs
- Use `updateTag()` for instant cache invalidation
- Handle errors with proper types

**References**:
- Backend Module: Pattern 2 (server-actions)
- Backend Module: Pattern 4 (form-validation)

#### Step 5: UI Components (Frontend Module)
- Create list page with data table:
  - Use `useDataTable` hook
  - Configure columns with sorting/filtering
  - Add toolbar with search and filters
- Create form using form components:
  - Use React Hook Form
  - Integrate Zod validation
  - Add loading states with `useFormStatus()`
- Create detail page (optional):
  - Display data with charts if analytics needed
- Add loading skeletons for all async components

**References**:
- Frontend Module: `data-table-patterns.md`
- Frontend Module: `form-patterns.md`
- Templates: `data-table/`, `form-components/`

#### Step 6: Pages/Routes (Frontend + Backend Integration)
- Create route structure:
  - `/dashboard/[module]` - List page with Suspense
  - `/dashboard/[module]/new` - Create page
  - `/dashboard/[module]/[id]` - Detail page
  - `/dashboard/[module]/[id]/edit` - Edit page
- Wrap async components in `<Suspense>` with skeletons
- Add to navigation config with RBAC rules

**References**:
- Backend Module: Pattern 3 (streaming)
- Frontend Module: `rbac-navigation.md`
- Workflow: `module-builder-workflow.md`

**Output**: Complete CRUD module with UI and data layer

---

### Phase 6: Testing & Deployment
**Goal**: Validate and deploy the application

**Steps**:
1. Test CRUD operations:
   - Create, read, update, delete functionality
   - Form validation and error handling
2. Verify cache invalidation:
   - Check `updateTag()` works instantly
   - Verify cache hit rates
3. Check RBAC permissions:
   - Test navigation filtering
   - Verify route protection
4. Test responsive design:
   - Mobile, tablet, desktop views
   - Collapsible sidebar behavior
5. Deploy to production:
   - Vercel deployment
   - Environment variables setup
   - Database migration

**References**:
- Backend Module: Pattern 2 (server-actions)
- Backend Module: Pattern 6 (cache-keys)
- Reference: `production-patterns.md`

**Output**: Production-ready application deployed

---

## Quick Reference

### Frontend Module Patterns
- Layout System → `modules/01-frontend/layout-system.md`
- Form Components → `modules/01-frontend/form-patterns.md`
- Data Tables → `modules/01-frontend/data-table-patterns.md`
- RBAC Navigation → `modules/01-frontend/rbac-navigation.md`

### Backend Module Patterns
- Cached Data → `modules/02-backend/patterns/pattern-01-cached-data.md`
- Server Actions → `modules/02-backend/patterns/pattern-02-server-actions.md`
- Streaming → `modules/02-backend/patterns/pattern-03-streaming.md`
- Cache Profiles → `modules/02-backend/patterns/pattern-07-cache-profiles.md`

### Automation Scripts
- `scripts/init_dashboard.sh` - Initialize dashboard
- `scripts/setup_auth.sh` - Set up authentication
- `scripts/generate_module.py` - Generate CRUD module

### Templates
- `templates/dashboard-layout/` - Layout components
- `templates/form-components/` - Form fields
- `templates/data-table/` - Table components
- `templates/auth/` - Auth pages and middleware

## Common Issues

### Issue: "Uncached data accessed outside Suspense"
**Solution**: Wrap async components in `<Suspense>` or add `'use cache'` to data functions
**Reference**: `references/error-prevention-guide.md`

### Issue: "cookies()/headers() inside 'use cache'"
**Solution**: Use "Extract and pass" pattern - read cookies outside, pass as arguments
**Reference**: Backend Module Pattern 9

### Issue: "Low cache hit rate"
**Solution**: Cache on low-cardinality dimensions, not user IDs
**Reference**: Backend Module Pattern 6

### Issue: "Navigation not filtering by role"
**Solution**: Check RBAC configuration in nav-config.ts and useFilteredNavItems
**Reference**: Frontend Module `rbac-navigation.md`

## Next Steps

After completing this workflow:
1. Review `production-patterns.md` for optimization techniques
2. Study `error-prevention-guide.md` to avoid common mistakes
3. Explore additional Frontend Module patterns (command palette, charts, drag-drop)
4. Implement monitoring with Sentry (optional)
5. Set up CI/CD pipeline for automated deployments

---

**Version**: 3.0.0
**Updated**: January 2026
