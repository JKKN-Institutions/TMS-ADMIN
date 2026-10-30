'use client';

import * as React from 'react';
import {
  type ColumnDef, type ColumnFiltersState, type OnChangeFn, type Row, type RowData, type RowSelectionState,
  type SortingState, type VisibilityState,
  flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useReactTable,
} from '@tanstack/react-table';
import {
  Check, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Columns3, ListFilter, Loader2,
  Search, Settings2, X,
} from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Readable column name for the card view and the Columns menu (headers are often components). */
    label?: string;
    /** Leave this column out of the narrow-screen card view. */
    hideInCard?: boolean;
  }
}

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
  /** Per-row selectability; defaults to every row when enableRowSelection is on. */
  canSelectRow?: (row: TData) => boolean;
  /** Stable row id so selection survives sort/filter (e.g. (d) => d.id). */
  getRowId?: (originalRow: TData, index: number) => string;
  /** Right-side toolbar controls; receives current selection. */
  toolbarActions?: (ctx: ToolbarActionContext<TData>) => React.ReactNode;
  /**
   * Reports the rows left after search + column filters, for callers that render
   * their own totals above the table.
   *
   * Filter state lives inside this component, so without this a summary computed
   * by the parent silently ignores every filter the user applies — the numbers
   * sit still while the rows beneath them change.
   */
  onFilteredRowsChange?: (rows: TData[], isFiltered: boolean) => void;
  /**
   * Columns hidden on first render, e.g. { route: false }. Lets a column exist
   * purely to power a filter without widening the table, while staying available
   * in the column-visibility menu. Defaults to everything visible.
   */
  initialColumnVisibility?: VisibilityState;
  /** Column filters applied on first render (e.g. grievances default to open). */
  initialColumnFilters?: ColumnFiltersState;
  /**
   * Controlled column filters. Pass together with onColumnFiltersChange when
   * something outside the table — a summary card — needs to set a filter.
   */
  columnFilters?: ColumnFiltersState;
  onColumnFiltersChange?: (filters: ColumnFiltersState) => void;
  /** Keep the first data column (and the checkbox) visible while scrolling sideways, 900px and up. Default on. */
  pinFirstColumn?: boolean;
  /** Below 900px render each row as a card. Default OFF: the user wants the table format everywhere (on a phone every column scrolls sideways together). */
  mobileCards?: boolean;
  /**
   * Small embedded table (a breakdown inside a detail page or dialog): no
   * toolbar, and the count/pagination footer only appears when there is more
   * than one page. Sorting, pinning and the phone card view still apply.
   */
  compact?: boolean;
  /** Text shown when there are no rows. */
  emptyMessage?: React.ReactNode;
}

const PAGE_SIZES = [10, 25, 50, 100];
const UTILITY_COLUMNS = new Set(['select', 'actions']);

// "licenseNumber" -> "License Number" for the column-visibility menu.
function prettifyColumnId(id: string) {
  // snake_case ids are as common here as camelCase ones ('academic_year',
  // 'payment_mode'), and without the underscore pass the View menu listed them
  // verbatim as "Academic_year".
  return id
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
}

export function DataTable<TData, TValue>({
  columns, data, searchPlaceholder = 'Search...', globalSearch = true, filters = [], pageSize = 10,
  entityName = 'rows', isLoading = false, enableRowSelection = false, canSelectRow, getRowId, toolbarActions,
  onFilteredRowsChange, initialColumnVisibility, initialColumnFilters, columnFilters: controlledFilters,
  onColumnFiltersChange, pinFirstColumn = true, mobileCards = false, compact = false, emptyMessage = 'No results.',
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [innerFilters, setInnerFilters] = React.useState<ColumnFiltersState>(initialColumnFilters ?? []);
  const columnFilters = controlledFilters ?? innerFilters;
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>(
    initialColumnVisibility ?? {}
  );
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});

  const setColumnFilters: OnChangeFn<ColumnFiltersState> = (updater) => {
    const next = typeof updater === 'function' ? updater(columnFilters) : updater;
    if (!controlledFilters) setInnerFilters(next);
    onColumnFiltersChange?.(next);
  };

  const table = useReactTable({
    data, columns,
    state: { sorting, columnFilters, columnVisibility, globalFilter, rowSelection },
    enableRowSelection: enableRowSelection
      ? (canSelectRow ? (row) => canSelectRow(row.original) : true)
      : false,
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
  const pageRows = table.getRowModel().rows;
  const { pageIndex, pageSize: currentPageSize } = table.getState().pagination;
  const pageCount = table.getPageCount() || 1;
  const selectedCount = table.getFilteredSelectedRowModel().rows.length;
  const isFiltered = globalFilter.length > 0 || columnFilters.length > 0;
  // Keyed on the inputs to filtering, NOT on the row array itself:
  // getFilteredRowModel() returns a fresh array every render, so depending on it
  // would re-fire on any parent re-render and loop through the parent's setState.
  React.useEffect(() => {
    if (!onFilteredRowsChange) return;
    onFilteredRowsChange(
      table.getFilteredRowModel().rows.map((r) => r.original),
      isFiltered,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, columnFilters, globalFilter, isFiltered, onFilteredRowsChange]);

  const firstShown = filteredCount === 0 ? 0 : pageIndex * currentPageSize + 1;
  const lastShown = Math.min((pageIndex + 1) * currentPageSize, filteredCount);
  const hideableColumns = table.getAllColumns().filter((c) => c.getCanHide());
  const hasHiddenColumns = hideableColumns.some((c) => !c.getIsVisible());
  const columnLabel = (id: string) => table.getColumn(id)?.columnDef.meta?.label ?? prettifyColumnId(id);

  // Pinned columns: the checkbox (if any) plus the first real data column.
  // Offsets are measured from the declared sizes so the second sticky column
  // starts exactly where the checkbox column ends. Pinning is 900px-and-up only:
  // on a phone a pinned name column eats most of the screen, so there every
  // column scrolls together (the inline `left` is inert on a non-sticky cell).
  const visibleLeaf = table.getVisibleLeafColumns();
  const pinned = new Map<string, number>();
  if (pinFirstColumn) {
    let left = 0;
    for (const col of visibleLeaf) {
      pinned.set(col.id, left);
      if (col.id !== 'select') break;
      left += col.getSize();
    }
  }
  const pinClass = (id: string, header = false) => {
    if (!pinned.has(id)) return undefined;
    const last = [...pinned.keys()].pop() === id;
    return cn(
      'min-[900px]:sticky min-[900px]:z-[1]',
      // Prefixed classes (min-[900px]:bg-white) escape the global `.dark .bg-white`
      // remap in globals.css, so the dark surfaces are spelled out here. Opaque on
      // purpose: a sticky cell must hide the columns scrolling beneath it.
      header
        ? 'min-[900px]:bg-gray-50 min-[900px]:dark:bg-[#1f2430]'
        : 'min-[900px]:bg-white min-[900px]:group-hover:bg-gray-50 min-[900px]:group-data-[state=selected]:bg-green-50 min-[900px]:dark:bg-[#161922] min-[900px]:dark:group-hover:bg-[#1f2430] min-[900px]:dark:group-data-[state=selected]:bg-[#172a28]',
      last && 'min-[900px]:shadow-[inset_-1px_0_0_rgb(229_231_235)] min-[900px]:dark:shadow-[inset_-1px_0_0_rgb(55_65_81)]',
    );
  };
  const pinStyle = (id: string, width?: number): React.CSSProperties | undefined => {
    const left = pinned.get(id);
    if (left === undefined) return width ? { width } : undefined;
    return { left, ...(width ? { width } : {}) };
  };

  const resetSelection = () => table.resetRowSelection();
  const resetFilters = () => {
    setGlobalFilter('');
    table.resetColumnFilters();
  };

  // One chip per active column filter, labelled from the filter definition when
  // the page declared one, otherwise from the column itself (summary cards can
  // filter on columns that have no dropdown).
  const chips = columnFilters.map((f) => {
    const def = filters.find((d) => d.columnId === f.id);
    const raw = String(f.value);
    const valueLabel = def?.options.find((o) => o.value === raw)?.label ?? raw;
    return { id: f.id, label: def?.title ?? columnLabel(f.id), valueLabel };
  });

  const tableCls = mobileCards ? 'hidden min-[900px]:block' : '';

  return (
    // Own provider: the table is also used by portals whose layouts have none.
    <TooltipProvider delayDuration={300}>
    <div className="space-y-3">
      {/* Toolbar */}
      {!compact && (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {globalSearch && (
            // NEVER `flex-1` here. `flex-1` is `flex: 1 1 0%` -- a ZERO basis -- so the
            // search claims no space of its own and is left with whatever its siblings
            // decline. basis-full gives it the whole line below sm; basis-56 keeps a
            // 224px floor above sm so wrapping, not crushing, absorbs any shortfall.
            // max-w-xs still caps it on wide screens.
            <div className="relative min-w-0 basis-full sm:basis-56 sm:grow sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                placeholder={searchPlaceholder}
                className="input h-[38px] pl-10!"
              />
            </div>
          )}
          {/* A single filter stays a plain dropdown; two or more collapse into one
              "Filters" button so the toolbar never wraps onto a second line. */}
          {filters.length === 1 && (
            <FilterSelect
              title={filters[0].title}
              value={(table.getColumn(filters[0].columnId)?.getFilterValue() as string) ?? ''}
              options={filters[0].options}
              onChange={(v) => table.getColumn(filters[0].columnId)?.setFilterValue(v)}
            />
          )}
          {filters.length > 1 && (
            <FiltersMenu
              filters={filters}
              activeCount={columnFilters.length}
              getValue={(id) => (table.getColumn(id)?.getFilterValue() as string) ?? ''}
              setValue={(id, v) => table.getColumn(id)?.setFilterValue(v)}
            />
          )}
          {isLoading && <Loader2 className="h-4 w-4 animate-spin text-green-600" aria-label="Loading" />}
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
          {toolbarActions?.({ selectedRows: table.getFilteredSelectedRowModel().rows.map((r) => r.original), resetSelection })}
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger className="inline-flex h-[38px] items-center gap-2 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50">
                  <Columns3 className="h-4 w-4" /> Columns
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Show or hide columns</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto">
              <DropdownMenuLabel>Show columns</DropdownMenuLabel>
              {hideableColumns.map((column) => (
                <DropdownMenuCheckboxItem key={column.id} checked={column.getIsVisible()} onCheckedChange={(v) => column.toggleVisibility(!!v)}>
                  {columnLabel(column.id)}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger
                  className="inline-flex h-[38px] items-center justify-center rounded-lg border border-gray-300 px-2.5 text-gray-700 transition-colors hover:bg-gray-50"
                  aria-label="Table settings"
                >
                  <Settings2 className="h-4 w-4" />
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Table settings</TooltipContent>
            </Tooltip>
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
      )}

      {/* Active filter chips */}
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <span
              key={c.id}
              className="inline-flex items-center gap-1 rounded-full border border-green-600/30 bg-green-50 py-0.5 pl-3 pr-1 text-xs text-gray-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-gray-200"
            >
              {c.label}: <span className="font-semibold text-green-700 dark:text-green-400">{c.valueLabel}</span>
              <button
                onClick={() => table.getColumn(c.id)?.setFilterValue(undefined)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-green-100 dark:hover:bg-green-500/20"
                aria-label={`Remove ${c.label} filter`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
          <button onClick={resetFilters} className="text-xs font-medium text-gray-500 hover:text-gray-800 hover:underline">
            Clear all
          </button>
        </div>
      )}

      {/* Table (900px and up, or always when cards are off) */}
      <div className={cn('overflow-x-auto rounded-xl border border-gray-200 bg-white', tableCls)}>
        <Table>
          <TableHeader className="bg-gray-50">
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-gray-50">
                {hg.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={pinClass(header.column.id, true)}
                    style={pinStyle(header.column.id, header.getSize() !== 150 ? header.getSize() : undefined)}
                  >
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: Math.min(currentPageSize, 10) }).map((_, i) => (
                <TableRow key={`sk-${i}`}>
                  {table.getVisibleLeafColumns().map((col) => (
                    <TableCell key={col.id}><Skeleton className="h-6 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : pageRows.length ? (
              pageRows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                  className="group data-[state=selected]:bg-green-50 dark:data-[state=selected]:bg-green-500/10"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className={pinClass(cell.column.id)} style={pinStyle(cell.column.id)}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow><TableCell colSpan={visibleLeaf.length || columns.length} className="h-24 text-center text-gray-500">{emptyMessage}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Card list (below 900px) */}
      {mobileCards && (
        <div className="space-y-2 min-[900px]:hidden">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={`skc-${i}`} className="h-28 w-full rounded-xl" />)
          ) : pageRows.length ? (
            pageRows.map((row) => <RowCard key={row.id} row={row} columnLabel={columnLabel} />)
          ) : (
            <div className="rounded-xl border border-gray-200 bg-white py-10 text-center text-sm text-gray-500">{emptyMessage}</div>
          )}
        </div>
      )}

      {/* Count + pagination */}
      {(!compact || pageCount > 1) && (
      <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
        <div className="flex-1 text-sm text-gray-600">
          Showing <span className="font-medium text-gray-900">{firstShown.toLocaleString()}–{lastShown.toLocaleString()}</span> of{' '}
          <span className="font-medium text-gray-900">{filteredCount.toLocaleString()}</span> {entityName}
          {filteredCount !== totalRows && <span className="text-gray-400"> (filtered from {totalRows.toLocaleString()})</span>}
          {enableRowSelection && selectedCount > 0 && (
            <span className="ml-2 font-medium text-green-700 dark:text-green-400">· {selectedCount.toLocaleString()} selected</span>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
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
      )}
    </div>
    </TooltipProvider>
  );
}

// One row as a card for narrow screens: checkbox and the first column on top,
// the row's actions menu top-right, every other visible column as label/value.
function RowCard<TData>({ row, columnLabel }: { row: Row<TData>; columnLabel: (id: string) => string }) {
  const cells = row.getVisibleCells();
  const select = cells.find((c) => c.column.id === 'select');
  const actions = cells.find((c) => c.column.id === 'actions');
  const rest = cells.filter((c) => !UTILITY_COLUMNS.has(c.column.id) && !c.column.columnDef.meta?.hideInCard);
  const [primary, ...details] = rest;
  return (
    <div
      data-state={row.getIsSelected() ? 'selected' : undefined}
      className="rounded-xl border border-gray-200 bg-white p-3 text-sm data-[state=selected]:border-green-600/40 data-[state=selected]:bg-green-50 dark:data-[state=selected]:bg-green-500/10"
    >
      <div className="flex items-start gap-3">
        {select && <div className="pt-0.5">{flexRender(select.column.columnDef.cell, select.getContext())}</div>}
        <div className="min-w-0 flex-1">{primary && flexRender(primary.column.columnDef.cell, primary.getContext())}</div>
        {actions && <div className="shrink-0">{flexRender(actions.column.columnDef.cell, actions.getContext())}</div>}
      </div>
      {details.length > 0 && (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
          {details.map((cell) => (
            <div key={cell.id} className="min-w-0">
              <dt className="text-xs text-gray-500">{columnLabel(cell.column.id)}</dt>
              <dd className="truncate text-gray-800 dark:text-gray-200">{flexRender(cell.column.columnDef.cell, cell.getContext())}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

// Every filter behind one button; each filter is a submenu of its options.
function FiltersMenu({
  filters, activeCount, getValue, setValue,
}: {
  filters: DataTableFilter[];
  activeCount: number;
  getValue: (columnId: string) => string;
  setValue: (columnId: string, v: string | undefined) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'inline-flex h-[38px] shrink-0 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors',
          activeCount > 0
            ? 'border-green-600/40 bg-green-50 text-gray-900 hover:bg-green-100 dark:border-green-500/40 dark:bg-green-500/10 dark:text-gray-100'
            : 'border-gray-300 text-gray-700 hover:bg-gray-50',
        )}
      >
        <ListFilter className="h-4 w-4" /> Filters
        {activeCount > 0 && (
          <span className="rounded-full bg-green-600 px-1.5 text-xs font-semibold text-white">{activeCount}</span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[13rem]">
        {filters.map((f) => {
          const value = getValue(f.columnId);
          const selected = f.options.find((o) => o.value === value);
          return (
            <DropdownMenuSub key={f.columnId}>
              <DropdownMenuSubTrigger>
                <span className="truncate">{f.title}</span>
                {selected && <span className="ml-2 max-w-[7rem] truncate text-xs font-semibold text-green-700 dark:text-green-400">{selected.label}</span>}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-[min(24rem,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto">
                <DropdownMenuItem onSelect={() => setValue(f.columnId, undefined)}>
                  <Check className={value ? 'opacity-0' : 'opacity-100'} /> All
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {f.options.map((o) => (
                  <DropdownMenuItem key={o.value} onSelect={() => setValue(f.columnId, o.value)}>
                    <Check className={value === o.value ? 'opacity-100' : 'opacity-0'} /> {o.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
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
      <DropdownMenuTrigger
        aria-label={selected ? `${title}: ${selected.label}` : `Filter by ${title.toLowerCase()}`}
        className={`inline-flex h-[38px] min-w-[7.5rem] max-w-[15rem] shrink-0 basis-auto items-center justify-between gap-2 rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600 ${
          selected
            ? 'border-green-600/40 bg-green-50 text-gray-900 hover:bg-green-100 dark:border-green-500/40 dark:bg-green-500/10 dark:text-gray-100 dark:hover:bg-green-500/20'
            : 'border-gray-300 text-gray-700 hover:bg-gray-50'
        }`}
      >
        {/* The title STAYS when a value is picked. Showing the value alone
            ("Cash") left a row of orphan words with no clue which dropdown each
            belonged to — unreadable once a table carried five filters.
            Grouped in one flex box so justify-between splits label-from-chevron
            and never pushes the divider away from the value it separates. */}
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">{title}</span>
          {selected && (
            <>
              <span aria-hidden className="h-4 w-px shrink-0 bg-green-600/30 dark:bg-green-400/30" />
              <span className="truncate font-semibold text-green-700 dark:text-green-400">{selected.label}</span>
            </>
          )}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 ${selected ? 'text-green-700/70 dark:text-green-400/70' : 'text-gray-400'}`} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-[10rem] overflow-y-auto">
        <DropdownMenuItem onSelect={() => onChange(undefined)}>
          <Check className={value ? 'opacity-0' : 'opacity-100'} /> All
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
  const sizes = PAGE_SIZES.includes(value) ? PAGE_SIZES : [...PAGE_SIZES, value].sort((a, b) => a - b);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex h-9 items-center gap-1 rounded-lg border border-gray-300 px-2.5 text-sm text-gray-700 transition-colors hover:bg-gray-50">
        {value} <ChevronDown className="h-4 w-4 text-gray-400" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[5rem]">
        {sizes.map((s) => (
          <DropdownMenuItem key={s} onSelect={() => onChange(s)}>
            <Check className={value === s ? 'opacity-100' : 'opacity-0'} /> {s}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
