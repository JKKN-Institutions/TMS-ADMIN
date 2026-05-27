'use client';

import * as React from 'react';
import {
  type ColumnDef, type ColumnFiltersState, type SortingState, type VisibilityState,
  flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useReactTable,
} from '@tanstack/react-table';
import { ChevronDown, Search } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export interface DataTableFilter {
  columnId: string;
  title: string;
  options: { label: string; value: string }[];
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchPlaceholder?: string;
  globalSearch?: boolean;
  filters?: DataTableFilter[];
  pageSize?: number;
}

export function DataTable<TData, TValue>({
  columns, data, searchPlaceholder = 'Search...', globalSearch = true, filters = [], pageSize = 10,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [globalFilter, setGlobalFilter] = React.useState('');

  const table = useReactTable({
    data, columns,
    state: { sorting, columnFilters, columnVisibility, globalFilter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col sm:flex-row gap-3">
          {globalSearch && (
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input value={globalFilter} onChange={(e) => setGlobalFilter(e.target.value)} placeholder={searchPlaceholder} className="input pl-10 w-full" />
            </div>
          )}
          {filters.map((f) => (
            <select
              key={f.columnId}
              className="input w-full sm:w-auto"
              value={(table.getColumn(f.columnId)?.getFilterValue() as string) ?? ''}
              onChange={(e) => table.getColumn(f.columnId)?.setFilterValue(e.target.value || undefined)}
            >
              <option value="">{f.title}: All</option>
              {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ))}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
            Columns <ChevronDown className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
            {table.getAllColumns().filter((c) => c.getCanHide()).map((column) => (
              <DropdownMenuCheckboxItem key={column.id} className="capitalize" checked={column.getIsVisible()} onCheckedChange={(v) => column.toggleVisibility(!!v)}>
                {column.id}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow><TableCell colSpan={columns.length} className="h-24 text-center text-gray-500">No results.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{table.getFilteredRowModel().rows.length} row(s)</p>
        <div className="flex items-center gap-2">
          <select className="input" value={table.getState().pagination.pageSize} onChange={(e) => table.setPageSize(Number(e.target.value))}>
            {[10, 20, 30, 50].map((s) => <option key={s} value={s}>{s} / page</option>)}
          </select>
          <button className="btn-secondary disabled:opacity-50" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>Previous</button>
          <span className="text-sm text-gray-600">Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount() || 1}</span>
          <button className="btn-secondary disabled:opacity-50" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>Next</button>
        </div>
      </div>
    </div>
  );
}
