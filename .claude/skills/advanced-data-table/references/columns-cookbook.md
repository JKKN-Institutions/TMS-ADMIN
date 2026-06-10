# Columns Cookbook

Copy-paste cell recipes for `columns.tsx`. Every recipe is lifted from a shipping
module (vehicles, drivers, routes, passengers) so they already match the look,
dark-mode treatment, and accessibility of the rest of the app.

## Table of contents
- [Select column (row selection)](#select-column)
- [Sortable text column](#sortable-text-column)
- [Clickable name → detail page](#clickable-name)
- [Avatar + name cell](#avatar--name-cell)
- [Status badge (color-mapped)](#status-badge)
- [Filterable column (id + accessorFn + filterFn)](#filterable-column)
- [Date cell](#date-cell)
- [Numeric / tabular cell](#numeric-cell)
- [Conditional / "overdue" cell](#conditional-cell)
- [Actions dropdown column](#actions-dropdown-column)

---

## Select column

Add this **first** in the array, only when the page enables row selection. The
`size: 40` keeps the checkbox column tight. Both `enableSorting` and
`enableHiding` are off so it can't be sorted or hidden away.

```tsx
const selectColumn: ColumnDef<Row> = {
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

// then, in the returned array:
return [
  ...(canManage ? [selectColumn] : []),
  // ...rest of columns
];
```

Pair it with `enableRowSelection` + `getRowId` on `<DataTable>` (see SKILL.md).

---

## Sortable text column

The default column. `DataTableColumnHeader` gives it the Asc/Desc/Hide menu.
A `—` fallback keeps empty cells from looking broken.

```tsx
{
  accessorKey: 'model',
  header: ({ column }) => <DataTableColumnHeader column={column} title="Model" />,
  cell: ({ row }) => <span className="text-gray-700 dark:text-gray-300">{row.original.model || '—'}</span>,
},
```

---

## Clickable name

The first "name" column doubles as the entry point to the detail page. Use a
`<button>` + an `onView` callback (passed into the factory) so navigation stays
in the page component, or a `<Link>` for a plain route. Green hover + underline
is the house style for "this is clickable."

```tsx
{
  accessorKey: 'registration_number',
  header: ({ column }) => <DataTableColumnHeader column={column} title="Registration #" />,
  size: 150,
  cell: ({ row }) => (
    <button
      type="button"
      onClick={() => onView(row.original)}
      className="text-left font-semibold text-gray-900 hover:text-green-600 hover:underline dark:text-gray-100"
    >
      {row.original.registration_number}
    </button>
  ),
},
```

---

## Avatar + name cell

For people (drivers, staff, learners). Falls back to initials when there's no
photo. The whole thing is one `<Link>` so the avatar and name are a single click
target.

```tsx
{
  accessorKey: 'name',
  header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
  cell: ({ row }) => {
    const d = row.original;
    return (
      <Link href={`/drivers/${d.id}`} className="group flex items-center gap-3">
        {d.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={d.avatarUrl} alt={d.name} className="h-8 w-8 rounded-full object-cover" />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-xs font-semibold text-green-600 dark:bg-green-500/20 dark:text-green-300">
            {d.name.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate font-medium text-gray-900 group-hover:text-green-600 group-hover:underline">{d.name}</p>
          {d.designation ? <p className="truncate text-xs text-gray-500">{d.designation}</p> : null}
        </div>
      </Link>
    );
  },
},
```

---

## Status badge

A small helper component above the factory keeps the cell tidy. Map each known
value to a `light + dark:` class pair; anything unknown falls back to gray. The
`bg-current opacity-70` dot inherits the text color so you only set it once.

```tsx
function StatusBadge({ status }: { status?: string }) {
  const map: Record<string, string> = {
    active: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
    maintenance: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-400',
    retired: 'bg-gray-200 text-gray-600 dark:bg-gray-500/20 dark:text-gray-300',
  };
  const cls = map[status ?? ''] ?? 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${cls}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {status ?? 'unknown'}
    </span>
  );
}
```

> Why the `dark:` pairs matter: this app remaps neutrals globally but solid
> colored tints (green/yellow/red badges) need explicit `dark:` variants or they
> glare in dark mode. Always ship both.

---

## Filterable column

A column the toolbar can filter on needs three things, and the page's
`filters=[{ columnId }]` must use the **same `id`**:

1. an explicit `id` (not just `accessorKey`),
2. an `accessorFn` that returns the raw value to match against,
3. a `filterFn` doing the equality check.

```tsx
{
  id: 'status',
  header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
  accessorFn: (v) => v.status ?? '',
  filterFn: (row, id, value) => (row.getValue(id) as string) === value,
  size: 120,
  cell: ({ row }) => <StatusBadge status={row.original.status} />,
},
```

```tsx
// page.tsx — columnId must equal the column id above:
filters={[
  { columnId: 'status', title: 'Status', options: [
    { label: 'Active', value: 'active' },
    { label: 'Maintenance', value: 'maintenance' },
    { label: 'Retired', value: 'retired' },
  ]},
]}
```

If the filter dropdown does nothing, the `id` and `columnId` don't match — that's
the #1 mistake.

---

## Date cell

Keep a tiny formatter at the top of the file. `whitespace-nowrap` stops dates
from wrapping mid-column.

```tsx
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString() : '—');

{
  id: 'insurance_expiry',
  header: ({ column }) => <DataTableColumnHeader column={column} title="Insurance Expiry" />,
  accessorFn: (v) => v.insurance_expiry ?? '',
  cell: ({ row }) => (
    <span className="whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">{fmtDate(row.original.insurance_expiry)}</span>
  ),
},
```

---

## Numeric cell

`tabular-nums` aligns digits so columns of numbers line up.

```tsx
{
  accessorKey: 'capacity',
  header: ({ column }) => <DataTableColumnHeader column={column} title="Capacity" />,
  size: 100,
  cell: ({ row }) => (
    <span className="tabular-nums text-gray-700 dark:text-gray-300">{row.original.capacity ?? 0} seats</span>
  ),
},
```

---

## Conditional cell

Highlight rows that need attention (overdue, expiring, failing) with color + an
icon. Read the value once, branch on it.

```tsx
function MaintenanceCell({ next }: { next?: string | null }) {
  if (!next) return <span className="text-gray-400">—</span>;
  const due = new Date(next) <= new Date();
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-sm ${
      due ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-300'
    }`}>
      {due ? <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> : <CheckCircle className="h-3.5 w-3.5 shrink-0 text-green-500" />}
      {new Date(next).toLocaleDateString()}
    </span>
  );
}
```

---

## Actions dropdown column

The last column. Always `enableHiding: false` + `enableSorting: false`, right
aligned. **Each item defers its callback with `setTimeout(fn, 0)`** so Radix can
finish closing the menu before a confirm dialog or route change steals focus —
without this you hit the pointer-events/focus race that the
`radix-dialog-race-fix` skill exists to cure. Gate Edit/Delete behind permission
flags. The delete item gets red styling.

```tsx
{
  id: 'actions',
  enableHiding: false,
  enableSorting: false,
  size: 60,
  header: () => <div className="text-right font-medium text-gray-500">Action</div>,
  cell: ({ row }) => {
    const v = row.original;
    const open = (fn: (v: Row) => void) => setTimeout(() => fn(v), 0);
    return (
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
              aria-label={`Actions for ${v.registration_number}`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[11rem]">
            <DropdownMenuLabel>Action</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => open(onView)}>
              <Eye className="text-gray-500" /> View details
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
```
