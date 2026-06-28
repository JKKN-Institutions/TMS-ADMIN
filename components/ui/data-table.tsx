'use client';

import * as React from 'react';
import {
  type ColumnDef, type ColumnFiltersState, type RowSelectionState, type SortingState, type VisibilityState,
  flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useReactTable,
} from '@tanstack/react-table';
import {
  Check, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Database, Loader2, Search, Settings2, SlidersHorizontal, X,
} from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';

export interface DataTableFilter {
  columnId: string;
  title: string;
  options: { label: string; value: string }[];
}

export interface ToolbarActionContext<TData> {
  selectedRows: TData[];
  resetSelection: () => void;
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchPlaceholder?: string;
  globalSearch?: boolean;
  filters?: DataTableFilter[];
  pageSize?: number;
  /** Plural noun for the summary line, e.g. "drivers". */
  entityName?: string;
  /** Show skeleton rows instead of data. */
  isLoading?: boolean;
  /** Enable checkbox row selection (columns must include a `select` column). */
  enableRowSelection?: boolean;
  /** Stable row id so selection survives sort/filter (e.g. (d) => d.id). */
  getRowId?: (originalRow: TData, index: number) => string;
  /** Right-side toolbar controls; receives current selection. */
  toolbarActions?: (ctx: ToolbarActionContext<TData>) => React.ReactNode;
}

// "licenseNumber" -> "License Number" for the column-visibility menu.
function prettifyColumnId(id: string) {
  return id.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}

export function DataTable<TData, TValue>({
  columns, data, searchPlaceholder = 'Search...', globalSearch = true, filters = [], pageSize = 10,
  entityName = 'rows', isLoading = false, enableRowSelection = false, getRowId, toolbarActions,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});

  const table = useReactTable({
    data, columns,
    state: { sorting, columnFilters, columnVisibility, globalFilter, rowSelection },
    enableRowSelection,
    getRowId,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });

  const totalRows = data.length;
  const filteredCount = table.getFilteredRowModel().rows.length;
  const pageRowCount = table.getRowModel().rows.length;
  const { pageIndex, pageSize: currentPageSize } = table.getState().pagination;
  const pageCount = table.getPageCount() || 1;
  const selectedCount = table.getFilteredSelectedRowModel().rows.length;
  const isFiltered = globalFilter.length > 0 || columnFilters.length > 0;
  const seenSoFar = Math.min((pageIndex + 1) * currentPageSize, filteredCount);
  const percentOfTotal = filteredCount > 0 ? Math.round((seenSoFar / filteredCount) * 100) : 0;
  const hideableColumns = table.getAllColumns().filter((c) => c.getCanHide());
  const hasHiddenColumns = hideableColumns.some((c) => !c.getIsVisible());

  const resetSelection = () => table.resetRowSelection();
  const resetFilters = () => {
    setGlobalFilter('');
    table.resetColumnFilters();
  };

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="rounded-xl border border-gray-200 bg-white p-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <span className="flex items-center gap-2 text-gray-600">
              <Database className="h-4 w-4 text-gray-400" />
              Showing <span className="font-medium text-gray-900">{pageRowCount}</span> of{' '}
              <span className="font-bold text-green-600">{filteredCount.toLocaleString()}</span> {entityName}
              {filteredCount !== totalRows ? <span className="text-gray-400">(of {totalRows.toLocaleString()})</span> : null}
            </span>
            <span className="text-gray-500">Page <span className="font-medium text-gray-700">{pageIndex + 1}</span> of {pageCount}</span>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">{percentOfTotal}% of total</span>
            {selectedCount > 0 && (
              <span className="font-medium text-green-600">Selected: {selectedCount.toLocaleString()}</span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs">
            {isFiltered && <span className="rounded-md bg-green-50 px-2 py-1 text-green-600 dark:bg-green-500/15 dark:text-green-300">Filtered</span>}
            {isLoading && <Loader2 className="h-4 w-4 animate-spin text-green-600" />}
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {globalSearch && (
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                placeholder={searchPlaceholder}
                className="input h-[38px] pl-10!"
              />
            </div>
          )}
          {filters.map((f) => (
            <FilterSelect
              key={f.columnId}
              title={f.title}
              value={(table.getColumn(f.columnId)?.getFilterValue() as string) ?? ''}
              options={f.options}
              onChange={(v) => table.getColumn(f.columnId)?.setFilterValue(v)}
            />
          ))}
          {isFiltered && (
            <button onClick={resetFilters} className="inline-flex h-[38px] shrink-0 items-center gap-1 rounded-lg px-2 text-sm text-gray-600 hover:bg-gray-100">
              Reset <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
          {toolbarActions?.({ selectedRows: table.getFilteredSelectedRowModel().rows.map((r) => r.original), resetSelection })}
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-[38px] items-center gap-2 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50">
              <SlidersHorizontal className="h-4 w-4" /> View
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
              {hideableColumns.map((column) => (
                <DropdownMenuCheckboxItem key={column.id} checked={column.getIsVisible()} onCheckedChange={(v) => column.toggleVisibility(!!v)}>
                  {prettifyColumnId(column.id)}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger
              className="inline-flex h-[38px] items-center justify-center rounded-lg border border-gray-300 px-2.5 text-gray-700 transition-colors hover:bg-gray-50"
              aria-label="Table settings"
            >
              <Settings2 className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Table settings</DropdownMenuLabel>
              {enableRowSelection && (
                <DropdownMenuItem onSelect={resetSelection} disabled={selectedCount === 0}>
                  Clear selection
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => table.resetColumnVisibility()} disabled={!hasHiddenColumns}>
                Show all columns
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={resetFilters} disabled={!isFiltered}>
                Reset filters
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <Table>
          <TableHeader className="bg-gray-50">
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-gray-50">
                {hg.headers.map((header) => (
                  <TableHead key={header.id} style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: pageSize }).map((_, i) => (
                <TableRow key={`sk-${i}`}>
                  {table.getAllLeafColumns().map((col) => (
                    <TableCell key={col.id}><Skeleton className="h-6 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() ? 'selected' : undefined} className="data-[state=selected]:bg-green-50 dark:data-[state=selected]:bg-green-500/10">
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

      {/* Pagination */}
      <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
        <div className="flex-1 text-sm text-gray-500">
          {enableRowSelection ? `${selectedCount} of ${filteredCount} row(s) selected.` : `${filteredCount} row(s).`}
        </div>
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span className="whitespace-nowrap">Rows per page</span>
            <PageSizeSelect value={currentPageSize} onChange={(s) => table.setPageSize(s)} />
          </div>
          <span className="text-sm font-medium text-gray-700">Page {pageIndex + 1} of {pageCount}</span>
          <div className="flex items-center gap-1">
            <PagerButton label="First page" onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()}><ChevronsLeft className="h-4 w-4" /></PagerButton>
            <PagerButton label="Previous page" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}><ChevronLeft className="h-4 w-4" /></PagerButton>
            <PagerButton label="Next page" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}><ChevronRight className="h-4 w-4" /></PagerButton>
            <PagerButton label="Last page" onClick={() => table.setPageIndex(pageCount - 1)} disabled={!table.getCanNextPage()}><ChevronsRight className="h-4 w-4" /></PagerButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function PagerButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled: boolean; children: React.ReactNode }) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-300 text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

// Styled replacement for the native <select> column filters so the open menu
// gets the same rounded corners + green hover as every other Radix dropdown
// (native <select> popups can't be styled). Shared here → applies to all tables.
// Exported so pages with their own (non-column) filters can match the look.
export function FilterSelect({
  title,
  value,
  options,
  onChange,
}: {
  title: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (v: string | undefined) => void;
}) {
  const selected = options.find((o) => o.value === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex h-[38px] basis-40 min-w-0 items-center justify-between gap-2 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50">
        <span className="truncate">{selected ? selected.label : `${title}: All`}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[10rem]">
        <DropdownMenuItem onSelect={() => onChange(undefined)}>
          <Check className={value ? 'opacity-0' : 'opacity-100'} /> {title}: All
        </DropdownMenuItem>
        {options.map((o) => (
          <DropdownMenuItem key={o.value} onSelect={() => onChange(o.value)}>
            <Check className={value === o.value ? 'opacity-100' : 'opacity-0'} /> {o.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Styled rows-per-page selector (replaces a native <select>).
function PageSizeSelect({ value, onChange }: { value: number; onChange: (s: number) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex h-9 items-center gap-1 rounded-lg border border-gray-300 px-2.5 text-sm text-gray-700 transition-colors hover:bg-gray-50">
        {value} <ChevronDown className="h-4 w-4 text-gray-400" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[5rem]">
        {[10, 20, 30, 50, 100].map((s) => (
          <DropdownMenuItem key={s} onSelect={() => onChange(s)}>
            <Check className={value === s ? 'opacity-100' : 'opacity-0'} /> {s}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
