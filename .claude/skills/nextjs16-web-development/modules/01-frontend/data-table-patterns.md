# Data Table Patterns

TanStack Table v8 with URL state management for server-side filtering, sorting, and pagination.

## Overview

This module provides a complete data table solution using:
- **TanStack React Table 8.x**: Headless table library
- **Nuqs 2.x**: Type-safe URL state management
- **Shadcn UI**: Table components
- **Server-side features**: Search, filter, sort, paginate

## Key Features

- URL-based state (shareable links)
- Server-side pagination
- Column sorting and filtering
- Faceted filters (multi-select)
- Search functionality
- Column visibility toggle
- Responsive design
- Loading states

---

## Installation

```bash
npm install @tanstack/react-table nuqs
```

---

## useDataTable Hook

### Core Hook with URL State

```typescript
// hooks/use-data-table.ts
'use client'

import { useCallback, useMemo, useState } from 'react'
import {
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type PaginationState,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table'
import { useQueryState, parseAsInteger, parseAsString } from 'nuqs'

interface UseDataTableProps<TData, TValue> {
  data: TData[]
  columns: ColumnDef<TData, TValue>[]
  pageCount?: number
  defaultPerPage?: number
  filterFields?: FilterField[]
}

interface FilterField {
  id: string
  label: string
  placeholder?: string
  options?: Array<{ label: string; value: string }>
}

export function useDataTable<TData, TValue>({
  data,
  columns,
  pageCount = -1,
  defaultPerPage = 10,
  filterFields = [],
}: UseDataTableProps<TData, TValue>) {
  // URL state for pagination
  const [page, setPage] = useQueryState(
    'page',
    parseAsInteger.withDefault(1)
  )
  const [perPage, setPerPage] = useQueryState(
    'per_page',
    parseAsInteger.withDefault(defaultPerPage)
  )

  // URL state for sorting
  const [sortBy, setSortBy] = useQueryState(
    'sort_by',
    parseAsString.withDefault('')
  )
  const [sortOrder, setSortOrder] = useQueryState(
    'sort_order',
    parseAsString.withDefault('')
  )

  // URL state for search
  const [search, setSearch] = useQueryState(
    'search',
    parseAsString.withDefault('')
  )

  // Local state for column visibility
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})

  // Convert URL state to TanStack Table format
  const pagination: PaginationState = useMemo(
    () => ({
      pageIndex: page - 1,
      pageSize: perPage,
    }),
    [page, perPage]
  )

  const sorting: SortingState = useMemo(
    () =>
      sortBy && sortOrder
        ? [{ id: sortBy, desc: sortOrder === 'desc' }]
        : [],
    [sortBy, sortOrder]
  )

  // Column filters from URL
  const columnFilters: ColumnFiltersState = useMemo(() => {
    const filters: ColumnFiltersState = []

    // Add search filter
    if (search && filterFields.length > 0) {
      filters.push({
        id: filterFields[0].id,
        value: search,
      })
    }

    // Add faceted filters from URL
    filterFields.forEach((field) => {
      if (field.options) {
        const value = new URLSearchParams(window.location.search).get(field.id)
        if (value) {
          filters.push({
            id: field.id,
            value: value.split('.'),
          })
        }
      }
    })

    return filters
  }, [search, filterFields])

  const table = useReactTable({
    data,
    columns,
    pageCount,
    state: {
      pagination,
      sorting,
      columnVisibility,
      columnFilters,
    },
    onPaginationChange: (updater) => {
      const newPagination =
        typeof updater === 'function' ? updater(pagination) : updater

      setPage(newPagination.pageIndex + 1)
      setPerPage(newPagination.pageSize)
    },
    onSortingChange: (updater) => {
      const newSorting = typeof updater === 'function' ? updater(sorting) : updater

      if (newSorting.length > 0) {
        setSortBy(newSorting[0].id)
        setSortOrder(newSorting[0].desc ? 'desc' : 'asc')
      } else {
        setSortBy('')
        setSortOrder('')
      }
    },
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    manualPagination: pageCount !== -1,
    manualSorting: pageCount !== -1,
    manualFiltering: pageCount !== -1,
  })

  // Search handler
  const handleSearch = useCallback(
    (value: string) => {
      setSearch(value || '')
      setPage(1) // Reset to first page
    },
    [setSearch, setPage]
  )

  return {
    table,
    search,
    setSearch: handleSearch,
  }
}
```

---

## Data Table Components

### 1. Main Table Component

```tsx
// components/data-table/data-table.tsx
'use client'

import { flexRender, type Table as TanStackTable } from '@tanstack/react-table'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface DataTableProps<TData> {
  table: TanStackTable<TData>
}

export function DataTable<TData>({ table }: DataTableProps<TData>) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && 'selected'}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell
                colSpan={table.getAllColumns().length}
                className="h-24 text-center"
              >
                No results.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
```

### 2. Table Toolbar

```tsx
// components/data-table/data-table-toolbar.tsx
'use client'

import { X } from 'lucide-react'
import { type Table } from '@tanstack/react-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DataTableViewOptions } from './data-table-view-options'
import { DataTableFacetedFilter } from './data-table-faceted-filter'

interface DataTableToolbarProps<TData> {
  table: Table<TData>
  search?: string
  setSearch?: (value: string) => void
  filterFields?: Array<{
    id: string
    label: string
    options?: Array<{ label: string; value: string }>
  }>
}

export function DataTableToolbar<TData>({
  table,
  search = '',
  setSearch,
  filterFields = [],
}: DataTableToolbarProps<TData>) {
  const isFiltered = table.getState().columnFilters.length > 0

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex flex-1 items-center gap-2">
        {/* Search input */}
        {setSearch && (
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-[150px] lg:w-[250px]"
          />
        )}

        {/* Faceted filters */}
        {filterFields.map((field) => {
          const column = table.getColumn(field.id)
          if (!column || !field.options) return null

          return (
            <DataTableFacetedFilter
              key={field.id}
              column={column}
              title={field.label}
              options={field.options}
            />
          )
        })}

        {/* Reset filters */}
        {isFiltered && (
          <Button
            variant="ghost"
            onClick={() => table.resetColumnFilters()}
            className="h-8 px-2 lg:px-3"
          >
            Reset
            <X className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>

      {/* View options */}
      <DataTableViewOptions table={table} />
    </div>
  )
}
```

### 3. Column Header (Sortable)

```tsx
// components/data-table/data-table-column-header.tsx
'use client'

import { ArrowDown, ArrowUp, ChevronsUpDown, EyeOff } from 'lucide-react'
import { type Column } from '@tanstack/react-table'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface DataTableColumnHeaderProps<TData, TValue>
  extends React.HTMLAttributes<HTMLDivElement> {
  column: Column<TData, TValue>
  title: string
}

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort()) {
    return <div className={cn(className)}>{title}</div>
  }

  return (
    <div className={cn('flex items-center space-x-2', className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8 data-[state=open]:bg-accent"
          >
            <span>{title}</span>
            {column.getIsSorted() === 'desc' ? (
              <ArrowDown className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === 'asc' ? (
              <ArrowUp className="ml-2 h-4 w-4" />
            ) : (
              <ChevronsUpDown className="ml-2 h-4 w-4" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => column.toggleSorting(false)}>
            <ArrowUp className="mr-2 h-3.5 w-3.5 text-muted-foreground/70" />
            Asc
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => column.toggleSorting(true)}>
            <ArrowDown className="mr-2 h-3.5 w-3.5 text-muted-foreground/70" />
            Desc
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => column.toggleVisibility(false)}>
            <EyeOff className="mr-2 h-3.5 w-3.5 text-muted-foreground/70" />
            Hide
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
```

### 4. Faceted Filter

```tsx
// components/data-table/data-table-faceted-filter.tsx
'use client'

import { Check, PlusCircle } from 'lucide-react'
import { type Column } from '@tanstack/react-table'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'

interface DataTableFacetedFilterProps<TData, TValue> {
  column?: Column<TData, TValue>
  title?: string
  options: Array<{
    label: string
    value: string
    icon?: React.ComponentType<{ className?: string }>
  }>
}

export function DataTableFacetedFilter<TData, TValue>({
  column,
  title,
  options,
}: DataTableFacetedFilterProps<TData, TValue>) {
  const facets = column?.getFacetedUniqueValues()
  const selectedValues = new Set(column?.getFilterValue() as string[])

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 border-dashed">
          <PlusCircle className="mr-2 h-4 w-4" />
          {title}
          {selectedValues?.size > 0 && (
            <>
              <Separator orientation="vertical" className="mx-2 h-4" />
              <Badge
                variant="secondary"
                className="rounded-sm px-1 font-normal lg:hidden"
              >
                {selectedValues.size}
              </Badge>
              <div className="hidden space-x-1 lg:flex">
                {selectedValues.size > 2 ? (
                  <Badge
                    variant="secondary"
                    className="rounded-sm px-1 font-normal"
                  >
                    {selectedValues.size} selected
                  </Badge>
                ) : (
                  options
                    .filter((option) => selectedValues.has(option.value))
                    .map((option) => (
                      <Badge
                        variant="secondary"
                        key={option.value}
                        className="rounded-sm px-1 font-normal"
                      >
                        {option.label}
                      </Badge>
                    ))
                )}
              </div>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align="start">
        <Command>
          <CommandInput placeholder={title} />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selectedValues.has(option.value)
                return (
                  <CommandItem
                    key={option.value}
                    onSelect={() => {
                      if (isSelected) {
                        selectedValues.delete(option.value)
                      } else {
                        selectedValues.add(option.value)
                      }
                      const filterValues = Array.from(selectedValues)
                      column?.setFilterValue(
                        filterValues.length ? filterValues : undefined
                      )
                    }}
                  >
                    <div
                      className={cn(
                        'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                        isSelected
                          ? 'bg-primary text-primary-foreground'
                          : 'opacity-50 [&_svg]:invisible'
                      )}
                    >
                      <Check className={cn('h-4 w-4')} />
                    </div>
                    {option.icon && (
                      <option.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                    )}
                    <span>{option.label}</span>
                    {facets?.get(option.value) && (
                      <span className="ml-auto flex h-4 w-4 items-center justify-center font-mono text-xs">
                        {facets.get(option.value)}
                      </span>
                    )}
                  </CommandItem>
                )
              })}
            </CommandGroup>
            {selectedValues.size > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    onSelect={() => column?.setFilterValue(undefined)}
                    className="justify-center text-center"
                  >
                    Clear filters
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
```

### 5. Pagination

```tsx
// components/data-table/data-table-pagination.tsx
'use client'

import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react'
import { type Table } from '@tanstack/react-table'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface DataTablePaginationProps<TData> {
  table: Table<TData>
}

export function DataTablePagination<TData>({
  table,
}: DataTablePaginationProps<TData>) {
  return (
    <div className="flex items-center justify-between px-2">
      <div className="flex-1 text-sm text-muted-foreground">
        {table.getFilteredSelectedRowModel().rows.length} of{' '}
        {table.getFilteredRowModel().rows.length} row(s) selected.
      </div>
      <div className="flex items-center space-x-6 lg:space-x-8">
        <div className="flex items-center space-x-2">
          <p className="text-sm font-medium">Rows per page</p>
          <Select
            value={`${table.getState().pagination.pageSize}`}
            onValueChange={(value) => {
              table.setPageSize(Number(value))
            }}
          >
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue placeholder={table.getState().pagination.pageSize} />
            </SelectTrigger>
            <SelectContent side="top">
              {[10, 20, 30, 40, 50].map((pageSize) => (
                <SelectItem key={pageSize} value={`${pageSize}`}>
                  {pageSize}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex w-[100px] items-center justify-center text-sm font-medium">
          Page {table.getState().pagination.pageIndex + 1} of{' '}
          {table.getPageCount()}
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            className="hidden h-8 w-8 p-0 lg:flex"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
          >
            <span className="sr-only">Go to first page</span>
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <span className="sr-only">Go to previous page</span>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <span className="sr-only">Go to next page</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="hidden h-8 w-8 p-0 lg:flex"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
          >
            <span className="sr-only">Go to last page</span>
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
```

### 6. View Options

```tsx
// components/data-table/data-table-view-options.tsx
'use client'

import { Settings2 } from 'lucide-react'
import { type Table } from '@tanstack/react-table'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface DataTableViewOptionsProps<TData> {
  table: Table<TData>
}

export function DataTableViewOptions<TData>({
  table,
}: DataTableViewOptionsProps<TData>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto hidden h-8 lg:flex"
        >
          <Settings2 className="mr-2 h-4 w-4" />
          View
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[150px]">
        <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {table
          .getAllColumns()
          .filter(
            (column) =>
              typeof column.accessorFn !== 'undefined' && column.getCanHide()
          )
          .map((column) => {
            return (
              <DropdownMenuCheckboxItem
                key={column.id}
                className="capitalize"
                checked={column.getIsVisible()}
                onCheckedChange={(value) => column.toggleVisibility(!!value)}
              >
                {column.id}
              </DropdownMenuCheckboxItem>
            )
          })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

---

## Complete Example

### Columns Definition

```tsx
// app/(dashboard)/products/columns.tsx
'use client'

import { type ColumnDef } from '@tanstack/react-table'
import { Badge } from '@/components/ui/badge'
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
      const amount = parseFloat(row.getValue('price'))
      const formatted = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(amount)
      return <div className="font-medium">{formatted}</div>
    },
  },
  {
    accessorKey: 'category',
    header: 'Category',
    cell: ({ row }) => row.original.category?.name || 'N/A',
  },
  {
    accessorKey: 'is_published',
    header: 'Status',
    cell: ({ row }) => {
      const isPublished = row.getValue('is_published')
      return (
        <Badge variant={isPublished ? 'default' : 'secondary'}>
          {isPublished ? 'Published' : 'Draft'}
        </Badge>
      )
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id))
    },
  },
]
```

### Page Implementation

```tsx
// app/(dashboard)/products/page.tsx
import { Suspense } from 'react'
import { getProducts } from '@/lib/data/products'
import { ProductsTable } from './products-table'
import { ProductsTableSkeleton } from './skeletons'

interface PageProps {
  searchParams: Promise<{
    page?: string
    per_page?: string
    sort_by?: string
    sort_order?: string
    search?: string
    is_published?: string
  }>
}

export default async function ProductsPage({ searchParams }: PageProps) {
  const params = await searchParams

  return (
    <div className="space-y-4">
      <Suspense fallback={<ProductsTableSkeleton />}>
        <ProductsList searchParams={params} />
      </Suspense>
    </div>
  )
}

async function ProductsList({ searchParams }: { searchParams: any }) {
  const { data, total } = await getProducts({
    page: Number(searchParams.page) || 1,
    perPage: Number(searchParams.per_page) || 10,
    sortBy: searchParams.sort_by,
    sortOrder: searchParams.sort_order,
    search: searchParams.search,
    isPublished: searchParams.is_published,
  })

  const pageCount = Math.ceil(total / (Number(searchParams.per_page) || 10))

  return <ProductsTable data={data} pageCount={pageCount} />
}
```

### Client Table Component

```tsx
// app/(dashboard)/products/products-table.tsx
'use client'

import { useDataTable } from '@/hooks/use-data-table'
import { DataTable } from '@/components/data-table/data-table'
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar'
import { DataTablePagination } from '@/components/data-table/data-table-pagination'
import { columns } from './columns'
import type { Product } from '@/types/product'

interface ProductsTableProps {
  data: Product[]
  pageCount: number
}

export function ProductsTable({ data, pageCount }: ProductsTableProps) {
  const { table, search, setSearch } = useDataTable({
    data,
    columns,
    pageCount,
    filterFields: [
      {
        id: 'name',
        label: 'Name',
        placeholder: 'Search products...',
      },
      {
        id: 'is_published',
        label: 'Status',
        options: [
          { label: 'Published', value: 'true' },
          { label: 'Draft', value: 'false' },
        ],
      },
    ],
  })

  return (
    <div className="space-y-4">
      <DataTableToolbar
        table={table}
        search={search}
        setSearch={setSearch}
        filterFields={[
          {
            id: 'is_published',
            label: 'Status',
            options: [
              { label: 'Published', value: 'true' },
              { label: 'Draft', value: 'false' },
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

---

## URL State Format

### Query Parameters

```
/products?page=2&per_page=20&sort_by=price&sort_order=desc&search=laptop&is_published=true
```

**Parameters**:
- `page`: Current page number (1-indexed)
- `per_page`: Items per page
- `sort_by`: Column ID to sort by
- `sort_order`: Sort direction (`asc` or `desc`)
- `search`: Search query
- `[filter_id]`: Faceted filter values (dot-separated for multi-select)

---

## Server-Side Integration

### Data Fetching with Filters

```typescript
// lib/data/products.ts
'use cache'

import { cacheTag, cacheLife } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'

interface GetProductsParams {
  page?: number
  perPage?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  search?: string
  isPublished?: string
}

export async function getProducts(params: GetProductsParams = {}) {
  cacheLife('warm')
  cacheTag('products')

  const {
    page = 1,
    perPage = 10,
    sortBy = 'created_at',
    sortOrder = 'desc',
    search,
    isPublished,
  } = params

  const supabase = await createServerSupabaseClient()

  let query = supabase
    .from('products')
    .select('*, category:categories(name)', { count: 'exact' })

  // Search
  if (search) {
    query = query.textSearch('name', search)
  }

  // Filters
  if (isPublished !== undefined) {
    query = query.eq('is_published', isPublished === 'true')
  }

  // Sorting
  query = query.order(sortBy, { ascending: sortOrder === 'asc' })

  // Pagination
  const from = (page - 1) * perPage
  const to = from + perPage - 1
  query = query.range(from, to)

  const { data, error, count } = await query

  if (error) throw error

  return {
    data: data || [],
    total: count || 0,
  }
}
```

---

## Best Practices

1. **URL State**: Always use Nuqs for shareable table states
2. **Server-Side**: Paginate, filter, and sort on the server
3. **Caching**: Cache table data with appropriate `cacheLife`
4. **Loading States**: Show skeletons while data loads
5. **Responsive**: Make tables scrollable on mobile
6. **Accessibility**: Use proper ARIA labels
7. **Type Safety**: Define column types explicitly

---

## Dependencies

```json
{
  "dependencies": {
    "@tanstack/react-table": "^8.11.0",
    "nuqs": "^2.0.0",
    "@radix-ui/react-dropdown-menu": "^2.0.0",
    "@radix-ui/react-select": "^2.0.0",
    "lucide-react": "^0.400.0"
  }
}
```

---

**Version**: 3.0.0
**Updated**: January 2026
