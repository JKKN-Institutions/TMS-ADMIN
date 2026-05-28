'use client'

import {
  type ColumnDef,
  type ColumnFiltersState,
  type PaginationState,
  type SortingState,
  type VisibilityState,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { parseAsInteger, parseAsString, useQueryStates } from 'nuqs'
import { useCallback, useMemo } from 'react'

interface UseDataTableProps<TData, TValue> {
  data: TData[]
  columns: ColumnDef<TData, TValue>[]
  pageCount?: number
  defaultPerPage?: number
  defaultSort?: SortingState
}

export function useDataTable<TData, TValue>({
  data,
  columns,
  pageCount,
  defaultPerPage = 10,
  defaultSort = [],
}: UseDataTableProps<TData, TValue>) {
  // URL state management with Nuqs
  const [{ page, per_page, sort, search }, setQuery] = useQueryStates(
    {
      page: parseAsInteger.withDefault(1),
      per_page: parseAsInteger.withDefault(defaultPerPage),
      sort: parseAsString.withDefault(
        defaultSort.map((s) => `${s.id}.${s.desc ? 'desc' : 'asc'}`).join(',')
      ),
      search: parseAsString.withDefault(''),
    },
    {
      history: 'push',
    }
  )

  // Parse sorting from URL
  const sorting: SortingState = useMemo(() => {
    if (!sort) return defaultSort

    return sort.split(',').map((item) => {
      const [id, order] = item.split('.')
      return { id, desc: order === 'desc' }
    })
  }, [sort, defaultSort])

  // Update sorting in URL
  const setSorting = useCallback(
    (updater: SortingState | ((old: SortingState) => SortingState)) => {
      const newSorting = typeof updater === 'function' ? updater(sorting) : updater
      const sortString = newSorting
        .map((s) => `${s.id}.${s.desc ? 'desc' : 'asc'}`)
        .join(',')

      setQuery({ sort: sortString || null, page: 1 })
    },
    [sorting, setQuery]
  )

  // Pagination state
  const pagination: PaginationState = useMemo(
    () => ({
      pageIndex: page - 1,
      pageSize: per_page,
    }),
    [page, per_page]
  )

  // Update pagination in URL
  const setPagination = useCallback(
    (updater: PaginationState | ((old: PaginationState) => PaginationState)) => {
      const newPagination = typeof updater === 'function' ? updater(pagination) : updater

      setQuery({
        page: newPagination.pageIndex + 1,
        per_page: newPagination.pageSize,
      })
    },
    [pagination, setQuery]
  )

  // Column filters
  const [columnFilters, setColumnFilters] = useQueryStates({
    // Add your column-specific filters here
    // Example: status: parseAsString.withDefault('')
  })

  // Column visibility
  const [columnVisibility, setColumnVisibility] = useQueryStates({
    // Add your column visibility state here
  })

  // Global filter (search)
  const setGlobalFilter = useCallback(
    (value: string) => {
      setQuery({ search: value || null, page: 1 })
    },
    [setQuery]
  )

  const table = useReactTable({
    data,
    columns,
    pageCount: pageCount ?? Math.ceil(data.length / per_page),
    state: {
      sorting,
      pagination,
      globalFilter: search,
      columnFilters: Object.entries(columnFilters)
        .filter(([, value]) => value !== null && value !== '')
        .map(([id, value]) => ({ id, value })),
      columnVisibility: Object.entries(columnVisibility).reduce(
        (acc, [key, value]) => ({ ...acc, [key]: value !== 'false' }),
        {} as VisibilityState
      ),
    },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: (updater) => {
      const newFilters =
        typeof updater === 'function' ? updater(table.getState().columnFilters) : updater

      const filtersObject = newFilters.reduce(
        (acc, filter) => ({ ...acc, [filter.id]: String(filter.value) || null }),
        {}
      )

      setColumnFilters({ ...filtersObject, page: 1 })
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    manualPagination: !!pageCount,
    manualSorting: !!pageCount,
    manualFiltering: !!pageCount,
  })

  return { table }
}
