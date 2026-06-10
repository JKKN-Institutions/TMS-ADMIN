---
name: advanced-data-table
description: >-
  Build the project's advanced admin list table — a TanStack-Table engine
  (components/ui/data-table.tsx) driven by a per-module columns.tsx factory with
  sortable headers, status badges, dropdown filters, global search, pagination,
  row selection, and an actions menu. Use this skill whenever building or
  updating ANY admin list/index/grid view: when the user says "add a data
  table", "create the columns", "show <entity> in a table", "make a list page
  for <entity>", "add sorting/filtering/search/pagination/row-selection",
  "advanced table format", or names a new admin module that lists records
  (vehicles, drivers, routes, passengers, devices, notifications, etc.). Also
  use when reusing the table format across modules, or bootstrapping the shared
  DataTable engine into a project that doesn't have it yet. Produces a
  columns.tsx file plus the <DataTable> usage snippet; the surrounding page
  shell (data fetch, stats, header) is left to the caller.
---

# Advanced Data Table

This is the standard admin list table. It is a **three-layer convention**:

| Layer | File | Who owns it | This skill |
|-------|------|-------------|-----------|
| **Engine** | `components/ui/data-table.tsx` + `data-table-column-header.tsx` | Shared, stable, rarely edited | Ensures it exists (Step 1) |
| **Columns** | `app/(admin)/<module>/columns.tsx` | Per module | **Authors it (Step 2)** |
| **Usage** | `<DataTable .../>` inside the page | Per module | **Wires it (Step 3)** |

This skill produces the **columns file** and the **`<DataTable>` snippet**. It
deliberately does *not* generate the full page shell (data fetching, stat cards,
header buttons, CRUD handlers) — drop the snippet into whatever page component
you're building.

The win of this convention: the engine does all the table mechanics once, so a
new module only describes *its* columns. Keep the per-module file thin — push
anything reusable down into the engine or a shared helper, not into every
columns file.

---

## Step 1 — Ensure the engine exists

Check for the two engine files before writing any columns:

```
components/ui/data-table.tsx
components/ui/data-table-column-header.tsx
```

**If both exist** (the normal case in this project): use them as-is. Do not
modify or duplicate them — they're shared by every table, so a tweak for one
module silently changes all the others. If a module genuinely needs new engine
behavior (a new prop, a new toolbar slot), add it to the engine in a
backward-compatible way and say so.

**If they're missing** (using this skill in another project): copy them from
this skill's `assets/` folder into `components/ui/`, then confirm the peer
dependencies are present:

- `@tanstack/react-table` (^8) — the table engine
- `lucide-react` — icons
- shadcn/ui primitives: `components/ui/table.tsx`, `dropdown-menu.tsx`,
  `checkbox.tsx`, `skeleton.tsx` (add any missing one with `npx shadcn@latest add <name>`)
- `cn` from `@/lib/utils` (clsx + tailwind-merge)
- A `.input` utility class in global CSS (the search box uses `className="input ..."`)

The engine assumes a green brand accent and a light/dark theme — see the
gotchas at the end if your project differs.

---

## Step 2 — Write `columns.tsx`

The file exports a **factory function**, not a static array. Why a factory: the
columns need the page's callbacks (`onView`, `onEdit`, `onDelete`, …) and the
current user's permission flags (`canManage`, `canDelete`), and those only exist
at render time. The page calls the factory inside `useMemo` and passes the
result to `<DataTable columns={...} />`.

### Skeleton

```tsx
'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Eye, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// 1. Row type — the exact shape of one record as the API returns it.
export interface WidgetRow {
  id: string;
  name: string;
  category?: string | null;
  status?: string | null;
  created_at?: string | null;
}

// 2. Small presentational helpers (badges, formatters) live above the factory.
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString() : '—');

// 3. The factory. Take the callbacks + permission flags the page provides.
export function getWidgetColumns(
  onView: (w: WidgetRow) => void,
  onEdit: (w: WidgetRow) => void,
  onDelete: (w: WidgetRow) => void,
  canManage: boolean,
  canDelete: boolean
): ColumnDef<WidgetRow>[] {
  const selectColumn: ColumnDef<WidgetRow> = {
    id: 'select',
    enableSorting: false,
    enableHiding: false,
    size: 40,
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected() ? true : table.getIsSomePageRowsSelected() ? 'indeterminate' : false}
        onCheckedChange={(v) => table.toggleAllPageRowsSelected(v)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox checked={row.getIsSelected()} onCheckedChange={(v) => row.toggleSelected(v)} aria-label="Select row" />
    ),
  };

  return [
    ...(canManage ? [selectColumn] : []),
    {
      accessorKey: 'name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() => onView(row.original)}
          className="text-left font-semibold text-gray-900 hover:text-green-600 hover:underline dark:text-gray-100"
        >
          {row.original.name}
        </button>
      ),
    },
    {
      id: 'status',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      accessorFn: (w) => w.status ?? '',
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      cell: ({ row }) => <span className="capitalize">{row.original.status ?? '—'}</span>,
    },
    {
      accessorKey: 'created_at',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Created" />,
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">{fmtDate(row.original.created_at)}</span>
      ),
    },
    {
      id: 'actions',
      enableHiding: false,
      enableSorting: false,
      size: 60,
      header: () => <div className="text-right font-medium text-gray-500">Action</div>,
      cell: ({ row }) => {
        const w = row.original;
        // Defer to the next tick so Radix closes the menu before a dialog/route
        // grabs focus (avoids the pointer-events / focus race).
        const open = (fn: (w: WidgetRow) => void) => setTimeout(() => fn(w), 0);
        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
                  aria-label={`Actions for ${w.name}`}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[10rem]">
                <DropdownMenuLabel>Action</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => open(onView)}>
                  <Eye className="text-gray-500" /> View
                </DropdownMenuItem>
                {canManage && (
                  <DropdownMenuItem onSelect={() => open(onEdit)}>
                    <Pencil className="text-gray-500" /> Edit
                  </DropdownMenuItem>
                )}
                {canDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => open(onDelete)}
                      className="text-red-600 hover:bg-red-50 focus:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10 dark:focus:bg-red-500/10 [&>svg]:text-red-500"
                    >
                      <Trash2 /> Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];
}
```

### Column rules of thumb

- **First text column = the clickable entry to the detail view.** Make it a
  `button`/`Link` with green hover, wired to `onView`.
- **Plain sortable column:** `accessorKey` + `DataTableColumnHeader`. Always
  give a `—` fallback for empty values.
- **Column you want to filter on:** use an explicit `id` + `accessorFn` +
  `filterFn`, and match that `id` to the page's `filters` `columnId`. (This trips
  people up — see the cookbook.)
- **`size`** trims tight columns (checkbox 40, actions 60, status ~120). Leave
  data columns unset; the engine treats `150` as "auto".
- **Status / enum values → a badge helper** with light + `dark:` class pairs.
- **Actions column is last**, right-aligned, non-hideable, non-sortable, and
  defers every callback with `setTimeout(fn, 0)`.

For ready-made cell recipes (avatar+name, conditional/overdue cells, numeric
alignment, more badges), read `references/columns-cookbook.md`.

---

## Step 3 — Wire `<DataTable>` into the page

In the page component (a `'use client'` component), build the columns with
`useMemo` and render the table. Only the table-related lines are shown — the
data fetching and `loading` state are whatever the page already does.

```tsx
import { useMemo } from 'react';
import { DataTable } from '@/components/ui/data-table';
import { getWidgetColumns, type WidgetRow } from './columns';

// inside the component:
const columns = useMemo(
  () => getWidgetColumns(onView, onEdit, onDelete, canManage, canDelete),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [canManage, canDelete]
);

<DataTable
  columns={columns}
  data={widgets}                 // TData[] from your fetch
  entityName="widgets"           // plural noun for the summary line
  isLoading={loading}            // shows skeleton rows
  searchPlaceholder="Search name, category..."
  enableRowSelection={canManage} // needs the select column above + getRowId
  getRowId={(w) => w.id}         // stable id so selection survives sort/filter
  filters={[
    { columnId: 'status', title: 'Status', options: [
      { label: 'Active', value: 'active' },
      { label: 'Inactive', value: 'inactive' },
    ]},
  ]}
  toolbarActions={({ selectedRows, resetSelection }) =>
    canDelete && selectedRows.length > 0 ? (
      <button
        type="button"
        onClick={() => handleBulkDelete(selectedRows, resetSelection)}
        className="inline-flex h-[38px] items-center gap-2 rounded-lg bg-red-600 px-3 text-sm font-medium text-white transition-colors hover:bg-red-700"
      >
        <Trash2 className="h-4 w-4" /> Delete Selected ({selectedRows.length})
      </button>
    ) : null
  }
/>
```

### `<DataTable>` prop reference

| Prop | Type | Notes |
|------|------|-------|
| `columns` | `ColumnDef<T>[]` | from your factory, memoized |
| `data` | `T[]` | the rows |
| `entityName` | `string` | plural noun in "Showing X of Y **widgets**" |
| `isLoading` | `boolean` | renders skeleton rows |
| `searchPlaceholder` | `string` | global fuzzy search box hint |
| `globalSearch` | `boolean` | default `true`; set `false` to hide the search box |
| `pageSize` | `number` | default `10` |
| `filters` | `DataTableFilter[]` | each `columnId` MUST equal a filterable column's `id` |
| `enableRowSelection` | `boolean` | requires the `select` column + `getRowId` |
| `getRowId` | `(row, i) => string` | use the stable PK so selection survives sort/filter |
| `toolbarActions` | `(ctx) => ReactNode` | right-side slot; `ctx` has `selectedRows` + `resetSelection` |

---

## Gotchas (why things are the way they are)

- **Filter does nothing →** the column `id` and the page `filters` `columnId`
  don't match, or the column lacks `accessorFn` + `filterFn`. The toolbar looks
  up the column by id; no match = a dropdown that sets a filter on a phantom
  column.
- **Action click reopens/loses focus →** a callback ran synchronously inside
  `onSelect`. Wrap it: `setTimeout(() => fn(row), 0)`. Radix needs that tick to
  unmount the menu before a dialog or navigation takes focus.
- **Selection resets on sort/filter →** missing `getRowId`. Without a stable id,
  TanStack keys selection by row index, which changes when the view reorders.
- **Badges glare in dark mode →** a colored tint without a `dark:` pair. This
  app remaps neutrals globally, but solid color tints need explicit
  `dark:bg-…/15 dark:text-…` variants. Always ship both.
- **Don't fork the engine per module.** It's shared. Extend it
  backward-compatibly or add a shared helper instead — a one-off tweak there
  changes every table in the app.
- **Brand color is green** (`text-green-600`, `bg-green-600`). Clickable text,
  the active summary count, and the primary button all use it. Destructive
  actions use red.
