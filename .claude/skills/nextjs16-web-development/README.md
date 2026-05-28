# Next.js 16 Web Development Skill

A comprehensive Claude Code skill for standardizing Next.js 16 development workflows across your team, now with **production-ready admin dashboard patterns**.

## 🎯 Two-Module Architecture

This skill provides **complete full-stack development workflows** through two integrated modules:

### 📱 Frontend Module (`modules/01-frontend/`)
Production-ready admin dashboard with:
- **Layout System**: AppSidebar with RBAC navigation, Header with breadcrumbs, PageContainer
- **Form Components**: 12 standardized form types (input, select, date-picker, file-upload, etc.)
- **Data Tables**: TanStack Table v8 with URL state management via Nuqs
- **Authentication**: Supabase Auth integration with SSR and middleware
- **Theme System**: Dark/light mode with next-themes
- **Command Palette**: Global search with kbar (Cmd+K)
- **Charts**: Recharts wrappers for analytics dashboards
- **Drag & Drop**: dnd-kit for Kanban boards and sortable lists
- **File Upload**: React Dropzone with validation patterns

### ⚙️ Backend Module (`modules/02-backend/`)
Server-side data layer with:
- **Cache Components**: 10 production patterns for optimal caching
- **Server Actions**: Form mutations and cache invalidation
- **Database Layer**: Supabase + Row Level Security
- **Cache Strategies**: Hot/Warm/Cold/Static profiles from MyJKKN production
- **Type Safety**: Zod schemas + TypeScript strict mode

### 🔄 Unified Workflow
**Dashboard Setup** → **Feature Modules** → **Deployment**

Each module combines Frontend UI patterns with Backend data patterns for complete CRUD functionality.

## 📦 What's Included

### SKILL.md (4k words)
Core skill file with:
- Two-module architecture overview
- Quick decision frameworks (caching, invalidation, Server Actions vs Route Handlers)
- Essential backend patterns (10 core patterns)
- Project initialization workflow
- Best practices (DO/DON'T lists)
- Migration quickstart from Next.js 15
- Performance targets

### modules/ (Organized Documentation - 25k+ words total)

**Frontend Module (`modules/01-frontend/`)** - Admin dashboard patterns:

1. **README.md** - Frontend module overview and quick start
2. **layout-system.md** - AppSidebar, Header, PageContainer with RBAC
3. **form-patterns.md** - 12 reusable form component types
4. **data-table-patterns.md** - TanStack Table v8 + URL state (Nuqs)
5. **rbac-navigation.md** - Role-based navigation filtering
6. **command-palette.md** - kbar integration (Cmd+K global search)
7. **charts-analytics.md** - Recharts components for dashboards
8. **drag-drop-patterns.md** - dnd-kit Kanban and sortable lists
9. **file-upload-patterns.md** - React Dropzone with validation
10. **theme-system.md** - Dark/light mode with next-themes
11. **client-optimization.md** (~4k words) 🆕 - React.memo, useMemo, useCallback, virtualization (85% fewer re-renders)

**Backend Module (`modules/02-backend/`)** - Server-side data patterns:

1. **README.md** - Backend module overview
2. **patterns/** - 10 production cache patterns:
   - pattern-00-connection.md - Non-deterministic operations
   - pattern-01-cached-data.md - Basic data caching
   - pattern-02-server-actions.md - Mutations and invalidation
   - pattern-03-streaming.md - Suspense boundaries
   - pattern-04-form-validation.md - Zod validation
   - pattern-05-optimistic-updates.md - Client-side UX
   - pattern-06-cache-keys.md - Optimization strategies
   - pattern-07-cache-profiles.md - Hot/Warm/Cold/Static
   - pattern-08-cache-tags.md - Hierarchical organization
   - pattern-09-extract-pass.md - Dynamic API pattern
   - pattern-10-cache-nesting.md - Nesting rules
3. **database-layer.md** - Supabase + RLS integration

### workflows/ (End-to-End Guides)

1. **complete-workflow.md** - Dashboard setup → Module dev → Deployment
2. **module-builder-workflow.md** - Step-by-step CRUD creation
3. **auth-integration-workflow.md** - Supabase Auth setup patterns

### references/ (Additional Resources)

**Essential Guides:**

1. **error-prevention-guide.md** (~4k words) 🚨 **READ FIRST**
   - The THREE most common Next.js 16 errors
   - Uncached data outside Suspense
   - Runtime APIs inside 'use cache'
   - Async params/searchParams handling

2. **production-patterns.md** (~6k words) 🏆
   - Real-world MyJKKN patterns
   - Cache profile system
   - Hierarchical cache tags
   - "Extract and pass" pattern

**Performance Optimization (🆕 Updated):**

3. **bundle-optimization.md** (~5k words) 🆕
   - Avoid barrel imports (60% smaller bundles)
   - Dynamic imports with next/dynamic
   - Defer third-party scripts
   - Lightweight dependency alternatives
   - Code splitting by route

4. **async-optimization.md** (~5k words) 🆕
   - Promise.all() for parallel fetching (70% faster)
   - Defer await to branches
   - Promise.allSettled() for partial failures
   - Parallel Suspense boundaries
   - after() API for non-blocking operations

5. **testing-patterns.md** (~4k words) 🆕
   - Testing Server Actions and validation
   - Zod schema testing
   - Client component testing
   - Integration and E2E with Playwright
   - Coverage goals and best practices

**Backend Patterns:**

6. **cache-components-patterns.md** (~4k words)
   - Complete caching guide
   - Cache key optimization (PRODUCTION CRITICAL)
   - Cache lifecycle management

7. **server-actions-forms.md** (~4k words)
   - Form validation with Zod
   - Error handling and optimistic updates
   - File uploads and multi-step forms

8. **module-builder-patterns.md** (~3k words)
   - CRUD module workflow
   - Database layer with caching
   - Component architecture

9. **migration-guide.md** (~3k words)
   - Next.js 15 to 16 migration
   - Route segment config removal
   - Async params handling

10. **database-patterns.md** (~3k words)
    - Supabase schema design
    - RLS policies and indexes

**Integration Guides:**

11. **supabase-auth-patterns.md** (~3k words)
    - Auth integration with SSR
    - Middleware and route protection
    - User context patterns

12. **shadcn-ui-guide.md** (~2k words)
    - Component usage patterns
    - Customization guide

13. **tech-stack-reference.md** (~2k words)
    - Complete dependency list (~45 packages)
    - Integration guides

### scripts/ (Automation Tools)

Executable scripts for quick setup:

1. **init_dashboard.sh** 🆕
   - Initialize complete admin dashboard
   - Install Next.js 16 + Shadcn UI (~45 dependencies)
   - Configure Tailwind CSS 4
   - Set up layout components (AppSidebar, Header, PageContainer)
   - Create folder structure (features/, components/, lib/)
   - Usage: `bash scripts/init_dashboard.sh`

2. **setup_auth.sh** 🆕
   - Configure Supabase Auth with SSR
   - Set up middleware for route protection
   - Create AuthContext provider
   - Generate auth pages (sign-in, sign-up)
   - Configure environment variables
   - Usage: `bash scripts/setup_auth.sh`

3. **generate_module.py** (Enhanced)
   - Generate complete CRUD module (Frontend + Backend)
   - Creates: types, data layer, Server Actions, forms, tables, pages
   - Generates both UI components and cached data functions
   - Supports custom singular/plural names
   - Usage: `python generate_module.py products`

4. **init_project.sh**
   - Initialize basic Next.js 16 project
   - Install core dependencies
   - Configure next.config.ts with Cache Components
   - Set up Supabase clients
   - Create .env.local template

5. **validate_structure.py**
   - Validate project follows team standards
   - Check directory structure
   - Verify configurations
   - Validate dependencies

### templates/ (Production-Ready Code)

Ready-to-use component templates:

1. **dashboard-layout/** - Layout components
   - app-sidebar.tsx - Collapsible sidebar with RBAC
   - header.tsx - Breadcrumbs + search + user menu
   - page-container.tsx - Consistent page wrapper
   - info-sidebar.tsx - Contextual tips
   - layout.tsx - Dashboard composition

2. **form-components/** - 12 form field types
   - form-input.tsx, form-select.tsx, form-checkbox.tsx
   - form-date-picker.tsx, form-file-upload.tsx
   - form-textarea.tsx, form-slider.tsx, form-switch.tsx
   - And 4 more standardized form components

3. **data-table/** - TanStack Table setup
   - use-data-table.ts - Hook with URL state
   - data-table.tsx, data-table-toolbar.tsx
   - data-table-pagination.tsx, data-table-column-header.tsx

4. **auth/** - Supabase Auth templates
   - middleware.ts - Route protection
   - auth-context.tsx - User state provider
   - sign-in.tsx, sign-up.tsx - Auth pages

5. **navigation/** - Nav system
   - nav-config.ts - Navigation structure with RBAC
   - use-filtered-nav.ts - Permission filtering hook
   - breadcrumbs.tsx - Dynamic breadcrumbs

6. **module-templates/** - Complete modules
   - crud-module/ - Full CRUD implementation
   - analytics-module/ - Dashboard analytics

### assets/ (Configuration Files)

Configuration templates:

1. **next.config.ts**
   - Optimized Next.js 16 config
   - Production-grade cache profiles (Hot/Warm/Cold/Static)
   - PPR and Cache Components enabled

2. **tailwind.config.dashboard.ts** 🆕
   - Dashboard-specific Tailwind configuration
   - Theme tokens and custom utilities

3. **shadcn-components-list.md** 🆕
   - List of 45+ Shadcn UI components
   - Installation and usage guide

4. **supabase-schema-template.sql**
   - Database schema template
   - RLS policies and indexes

## 🚀 How Claude Uses This Skill

### Automatic Triggering

Claude will automatically use this skill when you:
- Mention "Next.js 16" in your request
- Ask about caching strategies or Server Actions
- Request help setting up a new Next.js project
- Need to implement CRUD features
- Ask about Supabase integration
- Request database schema design

### Progressive Disclosure

1. **Always loaded**: Skill name + description (~200 words)
2. **When triggered**: SKILL.md core patterns (~3.5k words)
3. **As needed**: Specific reference docs (~3k words each)
4. **Scripts**: Can be executed without loading into context

## 📊 Skill Structure

```
nextjs16-web-development/
├── SKILL.md                           # Core skill with two-module intro
├── README.md                          # This file
│
├── modules/                           # 🆕 Two-module architecture
│   ├── 01-frontend/                   # Admin dashboard patterns
│   │   ├── README.md
│   │   ├── layout-system.md
│   │   ├── form-patterns.md
│   │   ├── data-table-patterns.md
│   │   ├── rbac-navigation.md
│   │   ├── command-palette.md
│   │   ├── charts-analytics.md
│   │   ├── drag-drop-patterns.md
│   │   ├── file-upload-patterns.md
│   │   └── theme-system.md
│   │
│   └── 02-backend/                    # Server-side data patterns
│       ├── README.md
│       ├── patterns/                  # 10 cache patterns
│       │   ├── pattern-00-connection.md
│       │   ├── pattern-01-cached-data.md
│       │   ├── ...
│       │   └── pattern-10-cache-nesting.md
│       └── database-layer.md
│
├── workflows/                         # 🆕 End-to-end guides
│   ├── complete-workflow.md
│   ├── module-builder-workflow.md
│   └── auth-integration-workflow.md
│
├── templates/                         # 🆕 Production-ready code
│   ├── dashboard-layout/
│   ├── form-components/
│   ├── data-table/
│   ├── auth/
│   ├── navigation/
│   └── module-templates/
│
├── scripts/                           # Automation tools
│   ├── init_dashboard.sh              # 🆕
│   ├── setup_auth.sh                  # 🆕
│   ├── generate_module.py             # Enhanced
│   ├── init_project.sh
│   └── validate_structure.py
│
├── assets/                            # Configuration files
│   ├── next.config.ts
│   ├── tailwind.config.dashboard.ts   # 🆕
│   ├── shadcn-components-list.md      # 🆕
│   └── supabase-schema-template.sql
│
└── references/                        # Detailed documentation
    ├── error-prevention-guide.md
    ├── production-patterns.md
    ├── cache-components-patterns.md
    ├── server-actions-forms.md
    ├── module-builder-patterns.md
    ├── migration-guide.md
    ├── database-patterns.md
    ├── supabase-auth-patterns.md      # 🆕
    ├── shadcn-ui-guide.md             # 🆕
    └── tech-stack-reference.md        # 🆕
```

## 🎯 Usage Examples

### Example 1: Set Up Admin Dashboard 🆕

**User**: "Create an admin dashboard with Next.js 16 and Shadcn UI"

**Claude will**:
1. Load Frontend Module patterns
2. Run init_dashboard.sh to set up project
3. Install Shadcn UI components (~45 packages)
4. Create layout system (AppSidebar, Header, PageContainer)
5. Set up theme system (dark/light mode)
6. Configure navigation with RBAC
7. Provide next steps for adding features

### Example 2: Integrate Supabase Auth 🆕

**User**: "Add authentication to my dashboard"

**Claude will**:
1. Reference auth-integration-workflow.md
2. Run setup_auth.sh script
3. Configure Supabase Auth with SSR
4. Create middleware for route protection
5. Set up AuthContext provider
6. Generate sign-in/sign-up pages
7. Add user dropdown to header

### Example 3: Build CRUD Module with UI

**User**: "Create a products module with table and form"

**Claude will**:
1. Load complete-workflow.md for module development
2. Use generate_module.py to create boilerplate
3. **Backend**: Create types, data layer with caching, Server Actions
4. **Frontend**: Generate form components, data table with filters
5. Create pages with Suspense boundaries
6. Add to navigation config with RBAC rules
7. Test CRUD operations and cache invalidation

### Example 4: Add Data Table with Filters

**User**: "Create a filterable, sortable table for invoices"

**Claude will**:
1. Reference data-table-patterns.md from Frontend Module
2. Set up TanStack Table v8
3. Configure useDataTable hook with URL state (Nuqs)
4. Create table toolbar with search and filters
5. Add pagination and column sorting
6. Connect to cached data from Backend Module
7. Implement loading skeletons

### Example 5: Optimize Caching

**User**: "How should I cache user-specific dashboard data?"

**Claude will**:
1. Load Backend Module caching decision tree
2. Reference pattern-07-cache-profiles.md
3. Recommend `use cache: private` with appropriate cacheLife
4. Apply "Extract and pass" pattern (pattern-09)
5. Set up hierarchical cache tags (pattern-08)
6. Provide complete code examples
7. Explain cache invalidation strategy

## 🔧 Team Standards Enforced

This skill standardizes:

✅ **Project Structure**: Consistent directory organization
✅ **Caching Strategy**: Decision framework for all data types
✅ **Server Actions**: Preferred over API routes for mutations
✅ **Type Safety**: TypeScript + Zod validation everywhere
✅ **Database Design**: RLS policies, indexes, functions
✅ **Performance**: Cache Components + PPR + Suspense
✅ **Security**: Input validation, CSRF protection, RLS
✅ **Error Handling**: Consistent patterns across all forms
✅ **Code Organization**: Clear separation of concerns

## 📈 Expected Improvements

Using this skill, teams can expect:

**Development Speed:**
- **40% faster** module development with boilerplate generation
- **50% fewer** code review iterations with standards
- **Consistent codebase** across all team members

**Performance:**
- **60% smaller** bundles with optimization patterns
- **70% faster** page loads with async optimization
- **85% fewer** re-renders with client optimization
- **50% reduction** in First Contentful Paint with optimized caching
- **60% reduction** in Time to Interactive with cache key optimization
- **100x better** cache utilization with proper cache key strategies

**Reliability:**
- **90% fewer** runtime errors with error prevention patterns
- **Better test coverage** with comprehensive testing patterns
- **Better UX** with optimistic updates and streaming

### Real-World Results (MyJKKN Production App)

After implementing these patterns:
- Cache hit rate increased from 2% to 85% (42x improvement)
- Page load time reduced from 3.2s to 1.1s (66% faster)
- Zero "Uncached data" errors after adopting error prevention guide
- Developer onboarding time reduced from 2 weeks to 3 days

## 🎓 Learning Path

For new team members:

1. **Start**: Read SKILL.md core patterns
2. **Practice**: Use init_project.sh to create a project
3. **Build**: Generate a module with generate_module.py
4. **Deep Dive**: Study references/ for advanced patterns
5. **Validate**: Use validate_structure.py regularly

## 📚 References to Original Documentation

This skill was created from:
- nextjs16-advanced-module-builder.skill.md
- nextjs16-cache-components-patterns.skill.md
- nextjs16-server-actions-forms.skill.md
- nextjs16-migration-guide.skill.md
- nextjs16-complete-development-workflow.skill.md

All content has been:
- Organized using progressive disclosure principles
- Split into core (SKILL.md) and detailed (references/) documentation
- Enhanced with automation scripts
- Provided with reusable templates

## 🔄 Updates and Maintenance

To update this skill:

1. **Update SKILL.md**: For core workflow changes
2. **Update references/**: For detailed pattern changes
3. **Update scripts/**: For automation improvements
4. **Update assets/**: For template enhancements

Keep the skill synchronized with:
- Next.js releases and updates
- Team workflow changes
- Supabase best practices
- React patterns and hooks

## 🤝 Contributing

This skill is maintained by the JKKN Engineering team. For updates or improvements, follow the standard contribution process for Claude Code skills.

---

## ⚡ What's New in This Update

### Version 3.1.0 (January 2026) 🎉

**Major Update: Performance Optimization & Testing**

**New Performance Guides:**
1. **Bundle Optimization** - 60% smaller bundles
   - Avoid barrel imports
   - Dynamic imports
   - Defer third-party scripts
   - Lightweight alternatives

2. **Async Optimization** - 70% faster page loads
   - Promise.all() patterns
   - Parallel Suspense boundaries
   - after() API for non-blocking

3. **Client Optimization** - 85% fewer re-renders
   - React.memo, useMemo, useCallback
   - Virtualization for large lists
   - startTransition for responsiveness

4. **Testing Patterns** - Comprehensive testing
   - Server Actions testing
   - Zod schema validation
   - E2E with Playwright

### Version 3.0.0 (January 2026)

**Major Update: Two-Module Architecture with Admin Dashboard**

1. **Frontend Module** - Production-ready admin dashboard
   - Complete layout system (AppSidebar, Header, PageContainer)
   - 12 standardized form components with React Hook Form + Zod
   - TanStack Table v8 with URL state management
   - Supabase Auth integration with SSR
   - RBAC navigation system
   - Theme system (dark/light mode)
   - Command palette with kbar
   - Charts with Recharts
   - Drag-drop with dnd-kit
   - File upload with React Dropzone

2. **Backend Module** - Reorganized cache patterns
   - 10 patterns moved from references/ to modules/02-backend/patterns/
   - Database layer documentation
   - Server Actions patterns
   - Cache strategies and invalidation

3. **New Workflows**
   - complete-workflow.md - End-to-end dashboard development
   - module-builder-workflow.md - Step-by-step CRUD creation
   - auth-integration-workflow.md - Supabase Auth setup

4. **New Templates**
   - 50+ production-ready component templates
   - Dashboard layout components
   - Form components (12 types)
   - Data table with toolbar and pagination
   - Auth pages and middleware
   - Navigation with RBAC
   - Complete CRUD module templates

5. **New Scripts**
   - init_dashboard.sh - One-command dashboard setup
   - setup_auth.sh - Automated auth configuration
   - Enhanced generate_module.py - Creates both Frontend + Backend

6. **New References**
   - supabase-auth-patterns.md - Auth integration guide
   - shadcn-ui-guide.md - Component usage patterns
   - tech-stack-reference.md - 45+ dependencies

**Tech Stack**: Next.js 16 + React 19.2 + Shadcn UI + Supabase + TanStack Table + Zustand + dnd-kit + Recharts + kbar

**Version**: 3.0.0
**Created**: November 2025
**Updated**: January 2026
**Next.js Version**: 16.x (stable)
**React Version**: 19.2+
**Supabase Version**: Latest
**Based on**: [next-shadcn-dashboard-starter](https://github.com/Kiranism/next-shadcn-dashboard-starter)
