'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import { bookingDateStatus, type BookingListRow, type BookingDateStatus } from '@/lib/booking/admin-list';

const BADGE: Record<BookingDateStatus, { cls: string; label: string }> = {
  today: { cls: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400', label: 'Today' },
  upcoming: { cls: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400', label: 'Upcoming' },
  past: { cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300', label: 'Past' },
};

function DateStatusBadge({ status }: { status: BookingDateStatus }) {
  const b = BADGE[status];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${b.cls}`}>{b.label}</span>;
}

const fmtDateTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
};

export function getBookingColumns(today: string): ColumnDef<BookingListRow>[] {
  return [
    {
      accessorKey: 'travel_date',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Travel Date" />,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="font-medium tabular-nums text-gray-900 dark:text-gray-100">{row.original.travel_date}</span>
          <DateStatusBadge status={bookingDateStatus(row.original.travel_date, today)} />
        </div>
      ),
    },
    {
      id: 'dateStatus',
      accessorFn: (b) => bookingDateStatus(b.travel_date, today),
      filterFn: (r, id, value) => (r.getValue(id) as string) === value,
      enableHiding: true,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => <DateStatusBadge status={bookingDateStatus(row.original.travel_date, today)} />,
    },
    {
      accessorKey: 'learner_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Learner" />,
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-gray-900 dark:text-gray-100">{row.original.learner_name}</p>
          {row.original.roll_number ? <p className="truncate text-xs text-gray-500">{row.original.roll_number}</p> : null}
        </div>
      ),
    },
    {
      accessorKey: 'route_label',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Route" />,
      cell: ({ row }) => <span className="text-gray-700 dark:text-gray-300">{row.original.route_label}</span>,
    },
    {
      accessorKey: 'stop_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Stop" />,
      cell: ({ row }) => row.original.stop_name ?? <span className="text-gray-400">—</span>,
    },
    {
      accessorKey: 'booked_at',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Booked At" />,
      cell: ({ row }) => <span className="text-gray-600 dark:text-gray-400">{fmtDateTime(row.original.booked_at)}</span>,
    },
    {
      accessorKey: 'booked_by_label',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Booked By" />,
      filterFn: (r, id, value) => (r.getValue(id) as string) === value,
      cell: ({ row }) => <span className="text-gray-600 dark:text-gray-400">{row.original.booked_by_label}</span>,
    },
  ];
}
