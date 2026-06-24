'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Phone } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';

// One passenger row, flattened across the driver's route(s).
export interface PassengerRow {
  id: string;
  name: string;
  rollNumber: string | null;
  registerNumber: string | null;
  email: string | null;
  mobile: string | null;
  routeLabel: string | null;
  stopLabel: string | null;
  stopOrder: number | null;
}

function initials(name: string): string {
  return name.split(' ').map((w) => w.charAt(0)).join('').toUpperCase().slice(0, 2);
}

/**
 * Read-only roster columns for the driver Passengers table. No actions/selection —
 * a driver can view their riders but not edit them. `route` and `stop` carry explicit
 * ids + accessorFn + filterFn so the toolbar dropdown filters resolve to them.
 */
export function getPassengerColumns(): ColumnDef<PassengerRow>[] {
  return [
    {
      id: 'select',
      enableSorting: false,
      enableHiding: false,
      size: 40,
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected()
              ? true
              : table.getIsSomePageRowsSelected()
                ? 'indeterminate'
                : false
          }
          onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(v) => row.toggleSelected(!!v)}
          aria-label="Select row"
        />
      ),
    },
    {
      id: 'name',
      // Combined accessor so global search matches name OR roll/register; sorts by
      // name (it leads the string). The cell still renders just the clean name + id.
      accessorFn: (p) => `${p.name} ${p.rollNumber ?? ''} ${p.registerNumber ?? ''}`.trim(),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
      cell: ({ row }) => {
        const p = row.original;
        const id = p.rollNumber ?? p.registerNumber;
        return (
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs font-semibold text-green-700 dark:bg-green-900/40 dark:text-green-300">
              {initials(p.name)}
            </div>
            <div className="min-w-0">
              <p className="truncate font-medium text-gray-900 dark:text-white">{p.name}</p>
              {id && <p className="truncate text-xs text-gray-500 dark:text-gray-400">{id}</p>}
            </div>
          </div>
        );
      },
    },
    {
      id: 'route',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Route" />,
      accessorFn: (p) => p.routeLabel ?? '',
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      cell: ({ row }) => (
        <span className="text-gray-700 dark:text-gray-300">{row.original.routeLabel ?? '—'}</span>
      ),
    },
    {
      id: 'stop',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Boarding stop" />,
      accessorFn: (p) => p.stopLabel ?? '',
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      cell: ({ row }) => (
        <span className="text-gray-700 dark:text-gray-300">{row.original.stopLabel ?? '—'}</span>
      ),
    },
    {
      id: 'mobile',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Mobile" />,
      accessorFn: (p) => p.mobile ?? '',
      enableSorting: false,
      cell: ({ row }) => {
        const m = row.original.mobile;
        if (!m) return <span className="text-gray-400">—</span>;
        return (
          <a
            href={`tel:${m}`}
            className="inline-flex items-center gap-1.5 text-green-600 hover:underline dark:text-green-400"
          >
            <Phone className="h-3.5 w-3.5" />
            <span className="tabular-nums">{m}</span>
          </a>
        );
      },
    },
  ];
}
