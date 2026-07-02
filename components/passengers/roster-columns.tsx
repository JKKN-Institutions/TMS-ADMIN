'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Phone } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';

// One passenger row, flattened across a portal's assigned route(s). A passenger
// is either a learner or a bus-required staff member; `type` distinguishes them
// and `designation` carries the staff member's role (null for learners). Shared
// by the driver and boarding portal Passengers tables so both read identically.
export interface PassengerRow {
  id: string;
  type: 'learner' | 'staff';
  name: string;
  rollNumber: string | null;
  registerNumber: string | null;
  designation: string | null;
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
 * Read-only roster columns for a portal Passengers table. No edit actions — a
 * driver / boarding staffer can view their riders but not change them. `type`,
 * `route` and `stop` carry explicit ids + accessorFn + filterFn so the toolbar
 * dropdown filters resolve to them.
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
      // Combined accessor so global search matches name OR roll/register/staff id;
      // sorts by name (it leads the string). The cell renders the clean name + id.
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
      id: 'type',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
      accessorFn: (p) => (p.type === 'staff' ? 'Staff' : 'Learner'),
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      size: 130,
      cell: ({ row }) => {
        const p = row.original;
        const isStaff = p.type === 'staff';
        return (
          <div className="flex flex-col gap-0.5">
            <span
              className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                isStaff
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400'
                  : 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400'
              }`}
            >
              {isStaff ? 'Staff' : 'Learner'}
            </span>
            {isStaff && p.designation && (
              <span className="truncate text-xs text-gray-500 dark:text-gray-400">{p.designation}</span>
            )}
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
