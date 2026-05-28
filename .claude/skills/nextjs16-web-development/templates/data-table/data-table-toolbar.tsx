'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { type Table } from '@tanstack/react-table'
import { X } from 'lucide-react'
import { DataTableFacetedFilter } from './data-table-faceted-filter'
import { DataTableViewOptions } from './data-table-view-options'

interface DataTableToolbarProps<TData> {
  table: Table<TData>
  searchKey?: string
  searchPlaceholder?: string
  filters?: Array<{
    column: string
    title: string
    options: Array<{ label: string; value: string; icon?: React.ComponentType<{ className?: string }> }>
  }>
}

export function DataTableToolbar<TData>({
  table,
  searchKey = 'name',
  searchPlaceholder = 'Search...',
  filters = [],
}: DataTableToolbarProps<TData>) {
  const isFiltered = table.getState().columnFilters.length > 0

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex flex-1 items-center gap-2">
        {/* Global search */}
        <Input
          placeholder={searchPlaceholder}
          value={(table.getState().globalFilter as string) ?? ''}
          onChange={(event) => table.setGlobalFilter(event.target.value)}
          className="h-9 w-full md:w-[300px]"
        />

        {/* Faceted filters */}
        {filters.map((filter) => {
          const column = table.getColumn(filter.column)
          return column ? (
            <DataTableFacetedFilter
              key={filter.column}
              column={column}
              title={filter.title}
              options={filter.options}
            />
          ) : null
        })}

        {/* Clear filters */}
        {isFiltered && (
          <Button
            variant="ghost"
            onClick={() => table.resetColumnFilters()}
            className="h-9 px-2 lg:px-3"
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
