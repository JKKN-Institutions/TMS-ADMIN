# Module Builder Workflow: Step-by-Step CRUD Module Creation

Detailed guide for building a complete CRUD module combining Frontend UI and Backend data patterns.

## Overview

This workflow provides a step-by-step process for creating a full-featured CRUD module (e.g., Products, Users, Orders) with:
- Database schema with RLS policies
- Type-safe data layer with caching
- Server Actions for mutations
- Form components with validation
- Data tables with filtering and sorting
- Responsive pages with Suspense boundaries

**Time Estimate**: 2-4 hours for first module, 1-2 hours for subsequent modules

---

## Prerequisites

Before starting, ensure you have:
- ✅ Dashboard layout set up (AppSidebar, Header, PageContainer)
- ✅ Authentication working (Supabase Auth)
- ✅ Core components installed (forms, data tables)
- ✅ Supabase database connection configured

If not, follow `complete-workflow.md` Phases 1-4 first.

---

## Step 1: Database Schema Design

### 1.1 Create Database Table

Create a migration file or use Supabase Dashboard:

```sql
-- Example: products table
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL,
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  category_id UUID REFERENCES categories(id),
  is_published BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id) NOT NULL
);

-- Add indexes for performance
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_user ON products(user_id);
CREATE INDEX idx_products_published ON products(is_published);

-- Enable RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
```

**Reference**: `references/database-patterns.md`

### 1.2 Create RLS Policies

```sql
-- Read policy: Published products viewable by everyone
CREATE POLICY "Public products are viewable"
  ON products FOR SELECT
  USING (is_published = true OR auth.uid() = user_id);

-- Insert policy: Users can create their own products
CREATE POLICY "Users can insert their own products"
  ON products FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Update policy: Users can update their own products
CREATE POLICY "Users can update their own products"
  ON products FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Delete policy: Users can delete their own products
CREATE POLICY "Users can delete their own products"
  ON products FOR DELETE
  USING (auth.uid() = user_id);
```

**Reference**: Backend Module `database-layer.md`

### 1.3 Add Automatic Timestamps

```sql
-- Trigger to update updated_at on row changes
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

**Verification**: Test queries in Supabase SQL Editor to ensure RLS works

---

## Step 2: Type Definitions

### 2.1 Create TypeScript Interface

Create `types/product.ts`:

```typescript
import { z } from 'zod'

// Database types
export interface Product {
  id: string
  name: string
  description: string | null
  price: number
  stock_quantity: number
  category_id: string | null
  is_published: boolean
  created_at: string
  updated_at: string
  user_id: string
}

// Zod schemas for validation
export const CreateProductSchema = z.object({
  name: z.string()
    .min(1, 'Name is required')
    .max(255, 'Name must be less than 255 characters'),
  description: z.string().optional(),
  price: z.coerce
    .number({ invalid_type_error: 'Price must be a number' })
    .positive('Price must be positive')
    .multipleOf(0.01, 'Price must have at most 2 decimal places'),
  stock_quantity: z.coerce
    .number()
    .int('Stock must be a whole number')
    .min(0, 'Stock cannot be negative'),
  category_id: z.string().uuid().optional(),
  is_published: z.boolean().default(false),
})

export const UpdateProductSchema = CreateProductSchema.partial()

export type CreateProductInput = z.infer<typeof CreateProductSchema>
export type UpdateProductInput = z.infer<typeof UpdateProductSchema>

// Filter types for data fetching
export interface ProductFilters {
  search?: string
  category_id?: string
  is_published?: boolean
  min_price?: number
  max_price?: number
}
```

**Reference**: Backend Module Pattern 4 (form-validation)

**Verification**: TypeScript compiler should have no errors

---

## Step 3: Data Layer (Cached Fetching)

### 3.1 Create Data Fetching Functions

Create `lib/data/products.ts`:

```typescript
'use cache'

import { cacheTag, cacheLife } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Product, ProductFilters } from '@/types/product'

export async function getProducts(filters?: ProductFilters) {
  cacheLife('warm') // 5-minute freshness
  cacheTag('products') // Base tag

  // Add granular tags for filtering
  if (filters?.category_id) {
    cacheTag(`products-category-${filters.category_id}`)
  }
  if (filters?.is_published !== undefined) {
    cacheTag(`products-published-${filters.is_published}`)
  }

  const supabase = await createServerSupabaseClient()

  let query = supabase
    .from('products')
    .select('*, category:categories(name)', { count: 'exact' })
    .order('created_at', { ascending: false })

  // Apply filters
  if (filters?.search) {
    query = query.textSearch('name', filters.search)
  }
  if (filters?.category_id) {
    query = query.eq('category_id', filters.category_id)
  }
  if (filters?.is_published !== undefined) {
    query = query.eq('is_published', filters.is_published)
  }
  if (filters?.min_price) {
    query = query.gte('price', filters.min_price)
  }
  if (filters?.max_price) {
    query = query.lte('price', filters.max_price)
  }

  const { data, error, count } = await query

  if (error) throw error

  return {
    data: data as Product[],
    total: count || 0
  }
}

export async function getProductById(id: string) {
  cacheLife('warm')
  cacheTag('products', `products-${id}`)

  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('products')
    .select('*, category:categories(name)')
    .eq('id', id)
    .single()

  if (error) throw error

  return data as Product
}
```

**References**:
- Backend Module Pattern 1 (cached-data)
- Backend Module Pattern 7 (cache-profiles)
- Backend Module Pattern 8 (cache-tags)

**Verification**: Functions should compile without errors

---

## Step 4: Server Actions (Mutations)

### 4.1 Create Server Actions

Create `app/actions/products.ts`:

```typescript
'use server'

import { updateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { CreateProductSchema, UpdateProductSchema } from '@/types/product'

export type FormState = {
  message?: string
  errors?: Record<string, string[]>
  success?: boolean
}

export async function createProduct(
  prevState: FormState,
  formData: FormData
): Promise<FormState> {
  // Validate input
  const validation = CreateProductSchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description'),
    price: formData.get('price'),
    stock_quantity: formData.get('stock_quantity'),
    category_id: formData.get('category_id') || undefined,
    is_published: formData.get('is_published') === 'true',
  })

  if (!validation.success) {
    return {
      errors: validation.error.flatten().fieldErrors,
      message: 'Invalid fields. Please check the form.',
    }
  }

  const supabase = await createServerSupabaseClient()

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { message: 'Unauthorized' }
  }

  // Insert product
  const { data, error } = await supabase
    .from('products')
    .insert([{ ...validation.data, user_id: user.id }])
    .select()
    .single()

  if (error) {
    return { message: 'Database error: Failed to create product.' }
  }

  // Instant cache invalidation
  updateTag('products')
  if (data.category_id) {
    updateTag(`products-category-${data.category_id}`)
  }

  redirect(`/dashboard/products/${data.id}`)
}

export async function updateProduct(
  id: string,
  prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const validation = UpdateProductSchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description'),
    price: formData.get('price'),
    stock_quantity: formData.get('stock_quantity'),
    category_id: formData.get('category_id') || undefined,
    is_published: formData.get('is_published') === 'true',
  })

  if (!validation.success) {
    return {
      errors: validation.error.flatten().fieldErrors,
      message: 'Invalid fields. Please check the form.',
    }
  }

  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('products')
    .update(validation.data)
    .eq('id', id)

  if (error) {
    return { message: 'Database error: Failed to update product.' }
  }

  // Invalidate caches
  updateTag('products')
  updateTag(`products-${id}`)

  revalidatePath(`/dashboard/products/${id}`)
  return { success: true, message: 'Product updated successfully!' }
}

export async function deleteProduct(id: string): Promise<FormState> {
  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', id)

  if (error) {
    return { message: 'Database error: Failed to delete product.' }
  }

  updateTag('products')
  updateTag(`products-${id}`)

  redirect('/dashboard/products')
}
```

**References**:
- Backend Module Pattern 2 (server-actions)
- Backend Module Pattern 4 (form-validation)

**Verification**: Server Actions should compile without errors

---

## Step 5: UI Components

### 5.1 Create Form Component

Create `components/products/product-form.tsx`:

```tsx
'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { createProduct, updateProduct } from '@/app/actions/products'
import { FormInput } from '@/components/forms/form-input'
import { FormTextarea } from '@/components/forms/form-textarea'
import { FormSelect } from '@/components/forms/form-select'
import { FormCheckbox } from '@/components/forms/form-checkbox'
import type { Product } from '@/types/product'

interface ProductFormProps {
  product?: Product
  categories: Array<{ id: string; name: string }>
}

export function ProductForm({ product, categories }: ProductFormProps) {
  const action = product
    ? updateProduct.bind(null, product.id)
    : createProduct

  const [state, formAction] = useActionState(action, {})

  return (
    <form action={formAction} className="space-y-6">
      {state.message && (
        <div className={`alert ${state.success ? 'alert-success' : 'alert-error'}`}>
          {state.message}
        </div>
      )}

      <FormInput
        label="Product Name"
        name="name"
        required
        defaultValue={product?.name}
        error={state.errors?.name?.[0]}
      />

      <FormTextarea
        label="Description"
        name="description"
        defaultValue={product?.description || ''}
        error={state.errors?.description?.[0]}
      />

      <div className="grid grid-cols-2 gap-4">
        <FormInput
          label="Price"
          name="price"
          type="number"
          step="0.01"
          required
          defaultValue={product?.price}
          error={state.errors?.price?.[0]}
        />

        <FormInput
          label="Stock Quantity"
          name="stock_quantity"
          type="number"
          required
          defaultValue={product?.stock_quantity}
          error={state.errors?.stock_quantity?.[0]}
        />
      </div>

      <FormSelect
        label="Category"
        name="category_id"
        options={categories.map(cat => ({
          value: cat.id,
          label: cat.name
        }))}
        defaultValue={product?.category_id || ''}
        error={state.errors?.category_id?.[0]}
      />

      <FormCheckbox
        label="Published"
        name="is_published"
        defaultChecked={product?.is_published}
      />

      <SubmitButton />
    </form>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn btn-primary"
    >
      {pending ? 'Saving...' : 'Save Product'}
    </button>
  )
}
```

**Reference**: Frontend Module `form-patterns.md`

### 5.2 Create Data Table Component

Create `components/products/products-table.tsx`:

```tsx
'use client'

import { useDataTable } from '@/hooks/use-data-table'
import { DataTable } from '@/components/data-table/data-table'
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar'
import { columns } from './columns'
import type { Product } from '@/types/product'

interface ProductsTableProps {
  data: Product[]
  total: number
}

export function ProductsTable({ data, total }: ProductsTableProps) {
  const table = useDataTable({
    data,
    columns,
    pageCount: Math.ceil(total / 10),
    filterFields: [
      {
        id: 'name',
        label: 'Name',
        placeholder: 'Search products...',
      },
      {
        id: 'category_id',
        label: 'Category',
        options: [
          { value: 'cat1', label: 'Category 1' },
          { value: 'cat2', label: 'Category 2' },
        ],
      },
    ],
  })

  return (
    <div className="space-y-4">
      <DataTableToolbar table={table} />
      <DataTable table={table} />
    </div>
  )
}
```

Create `components/products/columns.tsx`:

```tsx
'use client'

import { ColumnDef } from '@tanstack/react-table'
import { DataTableColumnHeader } from '@/components/data-table/data-table-column-header'
import type { Product } from '@/types/product'

export const columns: ColumnDef<Product>[] = [
  {
    accessorKey: 'name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Name" />
    ),
  },
  {
    accessorKey: 'price',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Price" />
    ),
    cell: ({ row }) => {
      const price = parseFloat(row.getValue('price'))
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(price)
    },
  },
  {
    accessorKey: 'stock_quantity',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Stock" />
    ),
  },
  {
    accessorKey: 'is_published',
    header: 'Status',
    cell: ({ row }) => (
      <span className={row.getValue('is_published') ? 'badge-success' : 'badge-warning'}>
        {row.getValue('is_published') ? 'Published' : 'Draft'}
      </span>
    ),
  },
  {
    id: 'actions',
    cell: ({ row }) => (
      <div className="flex gap-2">
        <a href={`/dashboard/products/${row.original.id}`} className="btn-sm">
          View
        </a>
        <a href={`/dashboard/products/${row.original.id}/edit`} className="btn-sm">
          Edit
        </a>
      </div>
    ),
  },
]
```

**Reference**: Frontend Module `data-table-patterns.md`

### 5.3 Create Loading Skeletons

Create `components/products/skeletons.tsx`:

```tsx
export function ProductFormSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-10 bg-gray-200 rounded w-full" />
      <div className="h-24 bg-gray-200 rounded w-full" />
      <div className="grid grid-cols-2 gap-4">
        <div className="h-10 bg-gray-200 rounded" />
        <div className="h-10 bg-gray-200 rounded" />
      </div>
      <div className="h-10 bg-gray-200 rounded w-full" />
    </div>
  )
}

export function ProductsTableSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-10 bg-gray-200 rounded w-full" />
      <div className="h-64 bg-gray-200 rounded w-full" />
    </div>
  )
}
```

---

## Step 6: Pages and Routes

### 6.1 List Page

Create `app/(dashboard)/dashboard/products/page.tsx`:

```tsx
import { Suspense } from 'react'
import { ProductsTable } from '@/components/products/products-table'
import { ProductsTableSkeleton } from '@/components/products/skeletons'
import { getProducts } from '@/lib/data/products'
import type { ProductFilters } from '@/types/product'

interface PageProps {
  searchParams: Promise<{
    search?: string
    category_id?: string
    is_published?: string
  }>
}

export default async function ProductsPage({ searchParams }: PageProps) {
  const params = await searchParams

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Products</h1>
        <a href="/dashboard/products/new" className="btn btn-primary">
          Create Product
        </a>
      </div>

      <Suspense fallback={<ProductsTableSkeleton />}>
        <ProductsList filters={params} />
      </Suspense>
    </div>
  )
}

async function ProductsList({ filters }: { filters: ProductFilters }) {
  const { data, total } = await getProducts(filters)
  return <ProductsTable data={data} total={total} />
}
```

**Reference**: Backend Module Pattern 3 (streaming)

### 6.2 Create Page

Create `app/(dashboard)/dashboard/products/new/page.tsx`:

```tsx
import { Suspense } from 'react'
import { ProductForm } from '@/components/products/product-form'
import { ProductFormSkeleton } from '@/components/products/skeletons'
import { getCategories } from '@/lib/data/categories'

export default async function NewProductPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Create Product</h1>

      <Suspense fallback={<ProductFormSkeleton />}>
        <ProductFormWrapper />
      </Suspense>
    </div>
  )
}

async function ProductFormWrapper() {
  const categories = await getCategories()
  return <ProductForm categories={categories} />
}
```

### 6.3 Detail Page

Create `app/(dashboard)/dashboard/products/[id]/page.tsx`:

```tsx
import { Suspense } from 'react'
import { getProductById } from '@/lib/data/products'
import { notFound } from 'next/navigation'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ProductDetailPage({ params }: PageProps) {
  const { id } = await params

  return (
    <div className="space-y-6">
      <Suspense fallback={<div>Loading...</div>}>
        <ProductDetail id={id} />
      </Suspense>
    </div>
  )
}

async function ProductDetail({ id }: { id: string }) {
  const product = await getProductById(id).catch(() => notFound())

  return (
    <div>
      <h1 className="text-3xl font-bold">{product.name}</h1>
      <p>{product.description}</p>
      <p>Price: ${product.price}</p>
      <p>Stock: {product.stock_quantity}</p>
      <a href={`/dashboard/products/${id}/edit`} className="btn">
        Edit
      </a>
    </div>
  )
}
```

### 6.4 Edit Page

Create `app/(dashboard)/dashboard/products/[id]/edit/page.tsx`:

```tsx
import { Suspense } from 'react'
import { ProductForm } from '@/components/products/product-form'
import { ProductFormSkeleton } from '@/components/products/skeletons'
import { getProductById } from '@/lib/data/products'
import { getCategories } from '@/lib/data/categories'
import { notFound } from 'next/navigation'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EditProductPage({ params }: PageProps) {
  const { id } = await params

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Edit Product</h1>

      <Suspense fallback={<ProductFormSkeleton />}>
        <ProductFormWrapper id={id} />
      </Suspense>
    </div>
  )
}

async function ProductFormWrapper({ id }: { id: string }) {
  const [product, categories] = await Promise.all([
    getProductById(id).catch(() => notFound()),
    getCategories(),
  ])

  return <ProductForm product={product} categories={categories} />
}
```

### 6.5 Add to Navigation

Update `config/nav-config.ts`:

```typescript
export const navConfig = {
  mainNav: [
    // ... other items
    {
      title: 'Products',
      href: '/dashboard/products',
      icon: 'Package',
      items: [
        {
          title: 'All Products',
          href: '/dashboard/products',
        },
        {
          title: 'Create Product',
          href: '/dashboard/products/new',
        },
      ],
    },
  ],
}
```

**Reference**: Frontend Module `rbac-navigation.md`

---

## Step 7: Testing

### 7.1 Test CRUD Operations
- Create a new product → Verify it appears in the list
- Edit the product → Verify changes are saved
- Delete the product → Verify it's removed from the list

### 7.2 Test Cache Invalidation
- Create a product → List should update instantly (no refresh needed)
- Edit a product → Detail page should update instantly
- Check browser Network tab → Verify cache tags are working

### 7.3 Test Form Validation
- Submit form with empty fields → Verify errors appear
- Submit form with invalid data → Verify specific error messages
- Submit valid form → Verify success message

### 7.4 Test Responsive Design
- Open on mobile → Verify table is scrollable
- Test sidebar collapse → Verify works on mobile
- Test form fields → Verify they stack on mobile

---

## Automation: Generate Module Boilerplate

Instead of manual creation, use the automation script:

```bash
python scripts/generate_module.py products

# This generates:
# - types/product.ts
# - lib/data/products.ts
# - app/actions/products.ts
# - components/products/product-form.tsx
# - components/products/products-table.tsx
# - components/products/columns.tsx
# - components/products/skeletons.tsx
# - app/(dashboard)/dashboard/products/page.tsx
# - app/(dashboard)/dashboard/products/new/page.tsx
# - app/(dashboard)/dashboard/products/[id]/page.tsx
# - app/(dashboard)/dashboard/products/[id]/edit/page.tsx
```

Then customize the generated code for your specific needs.

---

## Common Issues

### "Cannot read property of undefined"
**Cause**: Forgot to await searchParams or params
**Solution**: Always `await searchParams` and `await params`

### "Cache hit rate is low"
**Cause**: Caching on user ID or high-cardinality dimension
**Solution**: Review Backend Module Pattern 6 for optimization

### "Form doesn't show errors"
**Cause**: useActionState state not passed to form components
**Solution**: Pass `error={state.errors?.fieldName?.[0]}` to FormInput

### "Table not filtering"
**Cause**: useDataTable not configured with filterFields
**Solution**: Add filterFields configuration to useDataTable hook

---

## Next Steps

After completing your first CRUD module:
1. Review Performance → Check cache hit rates in production
2. Add More Modules → Repeat this workflow for other features
3. Customize UI → Enhance with charts, analytics, or advanced filters
4. Add Testing → Write integration tests for Server Actions
5. Monitor Errors → Set up Sentry for error tracking

---

**Version**: 3.0.0
**Updated**: January 2026
