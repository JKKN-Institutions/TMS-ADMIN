# Testing & Validation Guide

Comprehensive testing checklist for the Next.js 16 Web Development skill.

## Quick Test Checklist

```
Phase 8: Testing & Refinement
- [ ] Script Testing (init_dashboard.sh, setup_auth.sh, generate_module.py)
- [ ] Template Compilation (all TSX/TS files)
- [ ] Documentation Completeness (all markdown files)
- [ ] End-to-End Workflow (scratch to deployment)
- [ ] Integration Points (frontend ↔ backend)
- [ ] Cross-References (all links work)
```

---

## 1. Script Testing

### Test init_dashboard.sh

**Location**: `scripts/init_dashboard.sh`

**Prerequisites**:
- Node.js 18+ installed
- Git repository initialized
- Package manager (npm/pnpm/yarn/bun) available

**Test Steps**:
```bash
cd /path/to/new-project
bash /path/to/skill/scripts/init_dashboard.sh
```

**Expected Outcomes**:
- [ ] Package manager auto-detected (npm/pnpm/yarn/bun)
- [ ] Node.js version verified (18+)
- [ ] Core dependencies installed:
  - [ ] next@16, react@19.2, react-dom@19.2
  - [ ] TypeScript 5.7
  - [ ] Tailwind CSS 4
  - [ ] 45+ Shadcn UI dependencies
  - [ ] React Hook Form, Zod 4
  - [ ] TanStack Table, Nuqs
  - [ ] Supabase Auth packages
  - [ ] Dev tools (ESLint, Prettier, Husky)
- [ ] Shadcn UI initialized (`components.json` created)
- [ ] Core components added (button, input, label, etc.)
- [ ] Folder structure created:
  - [ ] `app/`, `components/`, `lib/`, `hooks/`, `types/`, `config/`
- [ ] Configuration files created:
  - [ ] `next.config.ts`
  - [ ] `tsconfig.json`
  - [ ] `lib/utils.ts`
  - [ ] `.env.local` template
- [ ] package.json scripts updated
- [ ] Husky pre-commit hook configured
- [ ] Lint-staged configured

**Verification Commands**:
```bash
# Check installations
npm list next react typescript tailwindcss

# Verify structure
ls -la app/ components/ lib/ hooks/ types/ config/

# Check configs
cat next.config.ts
cat tsconfig.json
cat components.json

# Test dev server
npm run dev
```

**Common Issues**:
- **Issue**: Script fails with "Node.js not installed"
  - **Fix**: Install Node.js 18+
- **Issue**: Package manager not detected
  - **Fix**: Create `package.json` first with `npm init -y`
- **Issue**: Shadcn init fails
  - **Fix**: Ensure internet connection, try `npx shadcn@latest init -y` manually

---

### Test setup_auth.sh

**Location**: `scripts/setup_auth.sh`

**Prerequisites**:
- `init_dashboard.sh` already run
- Skill templates directory accessible
- Supabase project created

**Test Steps**:
```bash
bash /path/to/skill/scripts/setup_auth.sh
```

**Expected Outcomes**:
- [ ] Templates directory found and validated
- [ ] Supabase client utilities created:
  - [ ] `lib/supabase/server.ts`
  - [ ] `lib/supabase/client.ts`
- [ ] Middleware copied:
  - [ ] `middleware.ts` (from templates/auth/)
- [ ] Auth context created:
  - [ ] `contexts/auth-context.tsx`
- [ ] Protected route component:
  - [ ] `components/auth/protected-route.tsx`
- [ ] User dropdown component:
  - [ ] `components/header/user-dropdown.tsx`
- [ ] Auth pages created:
  - [ ] `app/auth/sign-in/page.tsx`
  - [ ] `app/auth/sign-up/page.tsx`
  - [ ] `app/auth/callback/route.ts`
  - [ ] `components/auth/pages/sign-in.tsx`
  - [ ] `components/auth/pages/sign-up.tsx`
- [ ] Database schema created:
  - [ ] `supabase/migrations/001_create_profiles.sql`
- [ ] Environment variables checked/created:
  - [ ] `.env.local` with Supabase placeholders

**Verification Commands**:
```bash
# Check created files
ls -la lib/supabase/
ls -la middleware.ts
ls -la contexts/
ls -la components/auth/
ls -la app/auth/
ls -la supabase/migrations/

# Verify .env.local
cat .env.local

# Test TypeScript compilation
npx tsc --noEmit
```

**Manual Steps Required**:
1. Update `.env.local` with real Supabase credentials
2. Run migration in Supabase:
   ```bash
   # Copy contents of supabase/migrations/001_create_profiles.sql
   # Paste into Supabase SQL Editor and run
   ```
3. Add AuthProvider to `app/layout.tsx`:
   ```tsx
   import { AuthProvider } from '@/contexts/auth-context'

   export default function RootLayout({ children }) {
     return (
       <html lang="en">
         <body>
           <AuthProvider>
             {children}
           </AuthProvider>
         </body>
       </html>
     )
   }
   ```

**Common Issues**:
- **Issue**: Templates directory not found
  - **Fix**: Ensure skill directory path is correct
- **Issue**: Import errors in auth files
  - **Fix**: Run `npm install @supabase/ssr @supabase/supabase-js`
- **Issue**: Middleware not working
  - **Fix**: Ensure middleware.ts is in project root

---

### Test generate_module.py

**Location**: `scripts/generate_module.py`

**Prerequisites**:
- Python 3.6+ installed
- Dashboard initialized with `init_dashboard.sh`
- Auth configured with `setup_auth.sh`

**Test Steps**:
```bash
python /path/to/skill/scripts/generate_module.py
# Follow prompts:
# - Module name: products
# - Fields: name (string), description (text), price (number), active (boolean)
```

**Expected Outcomes**:
- [ ] Module directory created: `app/dashboard/products/`
- [ ] Type definitions created:
  - [ ] `types/products.ts` with TypeScript interface
  - [ ] Zod schemas (CreateProductSchema, UpdateProductSchema)
- [ ] Data layer created:
  - [ ] `lib/data/products.ts` with cached functions
  - [ ] `cacheLife('warm')` configured
  - [ ] `cacheTag()` added for invalidation
- [ ] Server Actions created:
  - [ ] `app/actions/products.ts`
  - [ ] Create, update, delete actions
  - [ ] Zod validation
  - [ ] `updateTag()` for cache invalidation
- [ ] Form components created:
  - [ ] Uses `FormInput` for name field
  - [ ] Uses `FormTextarea` for description
  - [ ] Uses `FormCheckbox` for active
  - [ ] React Hook Form integration
- [ ] Table components created:
  - [ ] `columns.tsx` with `DataTableColumnHeader`
  - [ ] `table.tsx` with `useDataTable` hook
  - [ ] `toolbar.tsx` with `DataTableToolbar`
  - [ ] URL state management with Nuqs
- [ ] Pages created:
  - [ ] `app/dashboard/products/page.tsx` (list)
  - [ ] `app/dashboard/products/new/page.tsx` (create)
  - [ ] `app/dashboard/products/[id]/page.tsx` (detail)
  - [ ] `app/dashboard/products/[id]/edit/page.tsx` (edit)
  - [ ] All wrapped in `PageContainer`
  - [ ] Suspense boundaries with loading skeletons
- [ ] Database migration created:
  - [ ] `supabase/migrations/002_create_products.sql`
  - [ ] RLS policies
  - [ ] Indexes
- [ ] Loading skeletons created:
  - [ ] `app/dashboard/products/loading.tsx`

**Verification Commands**:
```bash
# Check generated files
ls -la types/products.ts
ls -la lib/data/products.ts
ls -la app/actions/products.ts
ls -la app/dashboard/products/

# Test TypeScript compilation
npx tsc --noEmit

# Check for syntax errors
npx eslint app/dashboard/products/
```

**Manual Verification**:
1. Run the migration in Supabase
2. Add to navigation config (`config/nav-config.ts`):
   ```ts
   {
     title: 'Products',
     href: '/dashboard/products',
     icon: Package,
     permissions: ['read:products'],
   }
   ```
3. Start dev server and test CRUD operations:
   ```bash
   npm run dev
   # Visit http://localhost:3000/dashboard/products
   ```

**Expected Behavior**:
- [ ] List page shows data table with sorting/filtering
- [ ] Create page shows form with validation
- [ ] Edit page pre-fills form
- [ ] Delete triggers cache invalidation
- [ ] Loading skeletons appear during async operations

**Common Issues**:
- **Issue**: Import errors in generated files
  - **Fix**: Ensure `@/components/ui/*` paths are correct
- **Issue**: FormInput not found
  - **Fix**: Copy form components from templates first
- **Issue**: useDataTable hook errors
  - **Fix**: Install nuqs: `npm install nuqs`

---

## 2. Template Compilation Testing

### Test All TypeScript Templates

**Command**:
```bash
cd /path/to/skill/templates/
npx tsc --noEmit --jsx react-jsx **/*.tsx **/*.ts
```

**Templates to Verify**:

**Dashboard Layout** (7 files):
- [ ] `dashboard-layout/app-sidebar.tsx`
- [ ] `dashboard-layout/header.tsx`
- [ ] `dashboard-layout/page-container.tsx`
- [ ] `dashboard-layout/info-sidebar.tsx`
- [ ] `dashboard-layout/layout.tsx`
- [ ] `dashboard-layout/providers.tsx`
- [ ] `dashboard-layout/README.md`

**Form Components** (12 files):
- [ ] `form-components/base-form-field-props.ts`
- [ ] `form-components/form-input.tsx`
- [ ] `form-components/form-select.tsx`
- [ ] `form-components/form-checkbox.tsx`
- [ ] `form-components/form-radio-group.tsx`
- [ ] `form-components/form-date-picker.tsx`
- [ ] `form-components/form-textarea.tsx`
- [ ] `form-components/form-slider.tsx`
- [ ] `form-components/form-switch.tsx`
- [ ] `form-components/form-file-upload.tsx`
- [ ] `form-components/form-checkbox-group.tsx`
- [ ] `form-components/form-otp.tsx`

**Data Table Components** (8 files):
- [ ] `data-table/use-data-table.ts`
- [ ] `data-table/data-table.tsx`
- [ ] `data-table/data-table-toolbar.tsx`
- [ ] `data-table/data-table-pagination.tsx`
- [ ] `data-table/data-table-column-header.tsx`
- [ ] `data-table/data-table-faceted-filter.tsx`
- [ ] `data-table/data-table-view-options.tsx`
- [ ] `data-table/README.md`

**Auth Components** (7 files):
- [ ] `auth/middleware.ts`
- [ ] `auth/auth-context.tsx`
- [ ] `auth/protected-route.tsx`
- [ ] `auth/user-dropdown.tsx`
- [ ] `auth/auth-pages/sign-in.tsx`
- [ ] `auth/auth-pages/sign-up.tsx`
- [ ] `auth/README.md`

**Expected Results**:
- All files compile without TypeScript errors
- No missing imports
- No type mismatches

**Common Issues**:
- **Issue**: Cannot find module '@/components/ui/...'
  - **Expected**: This is normal in templates; they're designed to be copied into a project with Shadcn UI installed
- **Issue**: Cannot find module 'next/...'
  - **Expected**: Templates need Next.js context to compile fully

---

## 3. Documentation Completeness

### Verify All Documentation Files

**Module Documentation**:
- [ ] `modules/01-frontend/README.md` (overview, 10 patterns)
- [ ] `modules/01-frontend/project-setup.md` (initialization)
- [ ] `modules/01-frontend/layout-system.md` (~6KB)
- [ ] `modules/01-frontend/form-patterns.md` (~18KB)
- [ ] `modules/01-frontend/data-table-patterns.md` (~20KB)
- [ ] `modules/01-frontend/rbac-navigation.md` (~14KB)
- [ ] `modules/01-frontend/command-palette.md` (~5KB)
- [ ] `modules/01-frontend/charts-analytics.md` (~5KB)
- [ ] `modules/01-frontend/drag-drop-patterns.md` (~5KB)
- [ ] `modules/01-frontend/file-upload-patterns.md` (~5KB)
- [ ] `modules/01-frontend/theme-system.md` (~5KB)
- [ ] `modules/02-backend/README.md` (overview, patterns)
- [ ] `modules/02-backend/patterns/pattern-00-connection.md` through `pattern-10-cache-nesting.md`
- [ ] `modules/02-backend/database-layer.md`

**Workflow Documentation**:
- [ ] `workflows/complete-workflow.md` (~6KB, 6 phases)
- [ ] `workflows/module-builder-workflow.md` (~15KB, 7 steps)
- [ ] `workflows/auth-integration-workflow.md` (~12KB, 11 steps)

**Reference Documentation**:
- [ ] `references/supabase-auth-patterns.md` (~15KB)
- [ ] `references/shadcn-ui-guide.md` (~7KB)
- [ ] `references/tech-stack-reference.md` (~9KB)

**Asset Files**:
- [ ] `assets/shadcn-components-list.md` (45+ components)
- [ ] `assets/tailwind.config.dashboard.ts`

**Root Files**:
- [ ] `SKILL.md` (restructured)
- [ ] `README.md` (version 3.0.0)

### Check Cross-References

**Verify all internal links work**:
```bash
cd /path/to/skill/
grep -r "\[.*\](.*.md)" --include="*.md" | \
  while read -r line; do
    file=$(echo "$line" | cut -d: -f1)
    link=$(echo "$line" | sed 's/.*(\(.*\.md\)).*/\1/')
    if [ -f "$(dirname "$file")/$link" ]; then
      echo "✓ $file -> $link"
    else
      echo "✗ $file -> $link (BROKEN)"
    fi
  done
```

**Expected Cross-References**:
- Frontend module → Backend patterns
- Workflows → Module docs
- References → Workflow guides
- Templates → Pattern docs

---

## 4. End-to-End Workflow Test

### Complete Dashboard Build Test

**Scenario**: Build a "Products Management" dashboard from scratch

**Phase 1: Project Initialization** (10 minutes)
```bash
# 1. Create new Next.js project
npx create-next-app@latest my-dashboard --typescript --tailwind --app
cd my-dashboard

# 2. Run init_dashboard.sh
bash /path/to/skill/scripts/init_dashboard.sh

# Expected: All dependencies installed, Shadcn UI configured
```

**Verification**:
- [ ] `npm run dev` starts successfully
- [ ] No console errors
- [ ] Tailwind CSS working
- [ ] TypeScript compiling

**Phase 2: Dashboard Layout Setup** (15 minutes)
```bash
# 1. Copy layout templates
cp -r /path/to/skill/templates/dashboard-layout/* app/

# 2. Copy navigation config
mkdir -p config
cp /path/to/skill/templates/navigation/nav-config.ts config/

# 3. Update app/layout.tsx with providers
```

**Verification**:
- [ ] Sidebar renders
- [ ] Sidebar collapse/expand works
- [ ] Breadcrumbs show
- [ ] Theme toggle works
- [ ] Responsive layout works

**Phase 3: Auth Integration** (20 minutes)
```bash
# 1. Run setup_auth.sh
bash /path/to/skill/scripts/setup_auth.sh

# 2. Update .env.local with Supabase credentials

# 3. Run migration in Supabase

# 4. Add AuthProvider to layout
```

**Verification**:
- [ ] Sign-up page works
- [ ] Sign-in page works
- [ ] OAuth buttons render
- [ ] Protected routes redirect
- [ ] User dropdown shows after login
- [ ] Sign-out works

**Phase 4: Generate Products Module** (10 minutes)
```bash
# 1. Run generate_module.py
python /path/to/skill/scripts/generate_module.py
# Module: products
# Fields: name (string), description (text), price (number), active (boolean)

# 2. Run migration

# 3. Add to navigation config
```

**Verification**:
- [ ] List page renders
- [ ] Table shows columns
- [ ] Search works
- [ ] Sorting works
- [ ] Pagination works
- [ ] Create form renders
- [ ] Form validation works
- [ ] Create saves to database
- [ ] Edit pre-fills form
- [ ] Update saves changes
- [ ] Delete works
- [ ] Cache invalidates on mutations

**Phase 5: Generate Orders Module** (10 minutes)
```bash
# 1. Generate second module
python /path/to/skill/scripts/generate_module.py
# Module: orders
# Fields: product_id (reference), quantity (number), total (number), status (select)

# 2. Run migration

# 3. Add to navigation config
```

**Verification**:
- [ ] Two modules coexist
- [ ] Navigation shows both
- [ ] Independent CRUD operations
- [ ] No interference

**Phase 6: Deploy** (Optional)
```bash
# 1. Build production
npm run build

# 2. Test production locally
npm start

# 3. Deploy to Vercel
vercel deploy
```

**Verification**:
- [ ] Build succeeds
- [ ] No build errors
- [ ] Production runs locally
- [ ] Deployment successful

**Total Time**: ~65 minutes from zero to deployed dashboard

---

## 5. Integration Point Testing

### Frontend ↔ Backend Integration

**Test 1: Form → Server Action → Cache Invalidation**
```tsx
// Create a product
// 1. Fill form (Frontend: FormInput)
// 2. Submit triggers Server Action
// 3. Server Action updates database
// 4. updateTag() invalidates cache
// 5. List page re-fetches instantly
```

**Expected Flow**:
- [ ] Form validation works (Zod)
- [ ] Loading state shows (`useFormStatus()`)
- [ ] Server Action receives data
- [ ] Database updated
- [ ] Cache tag invalidated
- [ ] List page shows new item immediately

**Test 2: Data Table → URL State → Data Fetching**
```tsx
// Filter products table
// 1. Type in search box (Frontend: DataTableToolbar)
// 2. URL updates with Nuqs
// 3. useDataTable hook detects change
// 4. Triggers re-fetch with new filters
// 5. Table updates
```

**Expected Flow**:
- [ ] URL updates on search input
- [ ] Browser back/forward works
- [ ] Shareable filtered URLs
- [ ] Data fetches with filters
- [ ] Table rerenders with new data

**Test 3: Auth Context → Protected Routes → RBAC Navigation**
```tsx
// Sign in as user with limited permissions
// 1. Sign in (Frontend: sign-in page)
// 2. AuthContext updates (Frontend: auth-context)
// 3. Middleware checks route (Backend: middleware)
// 4. Navigation filters by role (Frontend: useFilteredNav)
```

**Expected Flow**:
- [ ] Login updates user state
- [ ] Protected routes accessible
- [ ] Non-permitted routes redirect
- [ ] Navigation shows only allowed items
- [ ] Role changes update navigation

---

## 6. Performance Testing

### Cache Hit Verification

**Test Cache Components**:
```tsx
// Check if cacheLife profiles work
// 1. Visit products list page
// 2. Check Network tab (should cache)
// 3. Revisit page (should use cache)
// 4. Create new product (should invalidate)
// 5. List updates instantly
```

**Expected Metrics**:
- [ ] Initial load: Database query
- [ ] Subsequent loads: Cache hit (no query)
- [ ] After mutation: Cache invalidated
- [ ] List updates: <100ms

**Monitor with Next.js DevTools**:
```bash
npm run dev
# Open http://localhost:3000
# Check Console for cache logs
```

---

## 7. Common Issues & Solutions

### Issue: Build Fails

**Symptoms**: `npm run build` fails with errors

**Possible Causes**:
1. TypeScript errors in generated code
2. Missing dependencies
3. Import path issues

**Solutions**:
```bash
# 1. Check TypeScript
npx tsc --noEmit

# 2. Verify dependencies
npm list next react @supabase/ssr

# 3. Check import paths
grep -r "@/" --include="*.tsx" | grep "import"
```

### Issue: Auth Not Working

**Symptoms**: Login fails, redirects don't work

**Possible Causes**:
1. Missing environment variables
2. Supabase project not configured
3. Middleware not running

**Solutions**:
```bash
# 1. Check .env.local
cat .env.local | grep SUPABASE

# 2. Verify middleware.ts exists in root
ls -la middleware.ts

# 3. Test Supabase connection
# Add console.log in lib/supabase/server.ts
```

### Issue: Cache Not Invalidating

**Symptoms**: Data doesn't update after mutations

**Possible Causes**:
1. Missing `updateTag()` in Server Action
2. Wrong cache tag name
3. Not using `'use cache'` directive

**Solutions**:
```bash
# 1. Check Server Action
grep -A 5 "updateTag" app/actions/*.ts

# 2. Verify cache tags match
grep "cacheTag" lib/data/*.ts
grep "updateTag" app/actions/*.ts

# 3. Check 'use cache' directive
grep "'use cache'" lib/data/*.ts
```

---

## 8. Validation Checklist

### Pre-Release Validation

**Skill Structure**:
- [ ] All documentation files present
- [ ] All template files valid TypeScript
- [ ] All scripts executable
- [ ] Cross-references work
- [ ] No broken links

**Functionality**:
- [ ] `init_dashboard.sh` creates working project
- [ ] `setup_auth.sh` configures auth correctly
- [ ] `generate_module.py` creates valid CRUD module
- [ ] All templates compile
- [ ] End-to-end workflow succeeds

**Documentation**:
- [ ] Complete workflow documented
- [ ] All patterns explained
- [ ] Code examples tested
- [ ] Common errors documented
- [ ] Integration points clear

**Quality**:
- [ ] No TypeScript errors
- [ ] No ESLint errors
- [ ] Follows Next.js 16 best practices
- [ ] Follows React 19 patterns
- [ ] Production-ready code

---

## Success Criteria

**The skill is production-ready when**:

1. ✅ New user can create dashboard in <30 minutes
2. ✅ Generated modules work without modifications
3. ✅ All CRUD operations work correctly
4. ✅ Cache invalidation works instantly
5. ✅ Auth integration works out of the box
6. ✅ Documentation is complete and accurate
7. ✅ No errors in console during normal operation
8. ✅ Production build succeeds
9. ✅ Responsive design works on all devices
10. ✅ Can deploy to Vercel without issues

---

## Continuous Testing

### Regression Testing

After any changes to the skill:

```bash
# 1. Test scripts
bash scripts/init_dashboard.sh
bash scripts/setup_auth.sh
python scripts/generate_module.py

# 2. Compile templates
cd templates && npx tsc --noEmit **/*.tsx

# 3. Validate documentation
# Check all markdown files render correctly

# 4. End-to-end test
# Build a test dashboard from scratch
```

### Version Testing

Test with different versions:

- Next.js 16.0.0, 16.1.0, 16.2.0+
- React 19.2.0+
- Node.js 18, 20, 22
- npm, pnpm, yarn, bun

---

## Reporting Issues

If you find issues during testing:

1. **Document the issue**:
   - What you were doing
   - What you expected
   - What actually happened
   - Error messages
   - Environment details

2. **Create reproduction steps**:
   - Minimal steps to reproduce
   - Test data used
   - Configuration used

3. **Check existing solutions**:
   - Review Common Issues section
   - Check workflow documentation
   - Search pattern references

4. **File an issue** (if using version control):
   - Use issue template
   - Include reproduction steps
   - Attach error logs
   - Tag appropriately

---

## See Also

- [Complete Workflow](workflows/complete-workflow.md)
- [Module Builder Workflow](workflows/module-builder-workflow.md)
- [Tech Stack Reference](references/tech-stack-reference.md)
