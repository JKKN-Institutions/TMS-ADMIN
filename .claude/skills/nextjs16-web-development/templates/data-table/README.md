# Data Table Templates

Production-ready data table with TanStack Table v8 + Nuqs URL state management.

## Components Included

1. **useDataTable** - TanStack Table hook with URL state
2. **DataTable** - Table component with loading states
3. **DataTableToolbar** - Search, filters, view options
4. **DataTablePagination** - Pagination controls
5. **DataTableColumnHeader** - Sortable column header
6. **DataTableFacetedFilter** - Multi-select faceted filter
7. **DataTableViewOptions** - Column visibility toggle

## Installation

1. Copy templates to `components/data-table/`

2. Install dependencies:
   ```bash
   npm install @tanstack/react-table nuqs
   npx shadcn@latest add table dropdown-menu select command badge popover
   ```

## Basic Usage

### 1. Define Columns

```tsx
// app/(dashboard)/products/columns.tsx
'use client'

import { type ColumnDef } from '@tanstack/react-table'
import { DataTableColumnHeader } from '@/components/data-table/data-table-column-header'
import { Badge } from '@/components/ui/badge'

export type Product = {
  id: string
  name: string
  price: number
  status: 'active' | 'draft' | 'archived'
  created_at: string
}

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
    accessorKey: 'status',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => {
      const status = row.getValue('status') as string
      return (
        <Badge variant={status === 'active' ? 'default' : 'secondary'}>
          {status}
        </Badge>
      )
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id))
    },
  },
]
```

### 2. Create Data Table Component

```tsx
// app/(dashboard)/products/products-table.tsx
'use client'

import { DataTable } from '@/components/data-table/data-table'
import { DataTablePagination } from '@/components/data-table/data-table-pagination'
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar'
import { useDataTable } from '@/components/data-table/use-data-table'
import { columns, type Product } from './columns'

interface ProductsTableProps {
  data: Product[]
  pageCount?: number
}

export function ProductsTable({ data, pageCount }: ProductsTableProps) {
  const { table } = useDataTable({
    data,
    columns,
    pageCount,
    defaultPerPage: 10,
    defaultSort: [{ id: 'created_at', desc: true }],
  })

  return (
    <div className="space-y-4">
      <DataTableToolbar
        table={table}
        searchPlaceholder="Search products..."
        filters={[
          {
            column: 'status',
            title: 'Status',
            options: [
              { label: 'Active', value: 'active' },
              { label: 'Draft', value: 'draft' },
              { label: 'Archived', value: 'archived' },
            ],
          },
        ]}
      />
      <DataTable table={table} />
      <DataTablePagination table={table} />
    </div>
  )
}
```

### 3. Use in Page

```tsx
// app/(dashboard)/products/page.tsx
import { getProducts } from '@/lib/data/products'
import { ProductsTable } from './products-table'

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: { page?: string; per_page?: string; search?: string }
}) {
  const page = Number(searchParams.page) || 1
  const perPage = Number(searchParams.per_page) || 10
  const search = searchParams.search || ''

  const { data, pageCount } = await getProducts({ page, perPage, search })

  return (
    <div className="container mx-auto py-10">
      <ProductsTable data={data} pageCount={pageCount} />
    </div>
  )
}
```

## Features

### URL State Management

All table state is synced to URL:
- `?page=2` - Current page
- `?per_page=20` - Items per page
- `?sort=name.asc` - Sorting (column.direction)
- `?search=laptop` - Global search
- `?status=active` - Column filters

Users can:
- Share filtered/sorted views via URL
- Bookmark specific table states
- Use browser back/forward to navigate table states

### Server-Side Pagination

```tsx
// lib/data/products.ts
'use cache'

export async function getProducts({
  page = 1,
  perPage = 10,
  search = '',
  sort = 'created_at.desc',
}: {
  page?: number
  perPage?: number
  search?: string
  sort?: string
}) {
  'use cache'
  cacheTag('products')

  const supabase = createClient()

  // Parse sort
  const [sortField, sortOrder] = sort.split('.')

  // Build query
  let query = supabase
    .from('products')
    .select('*', { count: 'exact' })
    .order(sortField, { ascending: sortOrder === 'asc' })
    .range((page - 1) * perPage, page * perPage - 1)

  // Apply search
  if (search) {
    query = query.ilike('name', `%${search}%`)
  }

  const { data, count, error } = await query

  if (error) throw error

  return {
    data: data || [],
    pageCount: Math.ceil((count || 0) / perPage),
  }
}
```

### Row Actions

```tsx
// columns.tsx
import { MoreHorizontal, Pencil, Trash } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'

export const columns: ColumnDef<Product>[] = [
  // ... other columns
  {
    id: 'actions',
    cell: ({ row }) => {
      const product = row.original

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem asChild>
              <Link href={`/products/${product.id}/edit`}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => handleDelete(product.id)}
            >
              <Trash className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  },
]
```

### Row Selection

```tsx
// columns.tsx
import { Checkbox } from '@/components/ui/checkbox'

export const columns: ColumnDef<Product>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  // ... other columns
]
```

### Custom Filters

```tsx
// useDataTable hook configuration
const [columnFilters, setColumnFilters] = useQueryStates({
  status: parseAsString,
  category: parseAsString,
  price_min: parseAsInteger,
  price_max: parseAsInteger,
})

// Toolbar filters
<DataTableToolbar
  table={table}
  filters={[
    {
      column: 'status',
      title: 'Status',
      options: statusOptions,
    },
    {
      column: 'category',
      title: 'Category',
      options: categoryOptions,
    },
  ]}
/>
```

## Advanced Patterns

### Loading States

```tsx
import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'

export default async function ProductsPage() {
  return (
    <Suspense fallback={<DataTableSkeleton />}>
      <ProductsTable />
    </Suspense>
  )
}

function DataTableSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-96 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  )
}
```

### Empty States

```tsx
// DataTable component
{rows?.length ? (
  // ... rows
) : (
  <TableRow>
    <TableCell colSpan={columns.length} className="h-64 text-center">
      <div className="flex flex-col items-center gap-2">
        <p className="text-muted-foreground">No products found</p>
        <Button asChild>
          <Link href="/products/new">Create Product</Link>
        </Button>
      </div>
    </TableCell>
  </TableRow>
)}
```

## Dependencies

- @tanstack/react-table v8
- nuqs v2 (URL state management)
- Shadcn UI components (table, dropdown-menu, select, command, etc.)
- Lucide React icons

## See Also

- [Data Table Patterns Documentation](../../modules/01-frontend/data-table-patterns.md)
- [Backend Module Pattern 1](../../modules/02-backend/patterns/pattern-01-cached-data.md)
- [Complete Workflow](../../workflows/complete-workflow.md)
