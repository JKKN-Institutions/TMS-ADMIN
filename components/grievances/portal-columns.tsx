'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Eye, MoreHorizontal } from 'lucide-react';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CategoryTag, PriorityBadge, StatusBadge } from './badges';

// One row of a portal-user's own grievances (student / driver / boarding).
export interface PortalGrievanceRow {
  id: string;
  category: string;
  subject: string;
  status: string;
  priority: string;
  createdAt: string;
  routeLabel: string | null;
}

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export function getPortalGrievanceColumns(onView: (g: PortalGrievanceRow) => void): ColumnDef<PortalGrievanceRow>[] {
  return [
    {
      accessorKey: 'subject',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Subject" />,
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() => onView(row.original)}
          className="max-w-[20rem] truncate text-left font-semibold text-gray-900 hover:text-green-600 hover:underline dark:text-gray-100"
          title={row.original.subject}
        >
          {row.original.subject}
        </button>
      ),
    },
    {
      id: 'category',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Category" />,
      accessorFn: (g) => g.category ?? '',
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      size: 160,
      cell: ({ row }) => <CategoryTag category={row.original.category} />,
    },
    {
      accessorKey: 'routeLabel',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Route" />,
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">{row.original.routeLabel ?? '—'}</span>
      ),
    },
    {
      id: 'priority',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Priority" />,
      accessorFn: (g) => g.priority ?? '',
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      size: 110,
      cell: ({ row }) =>
        row.original.priority === 'normal' ? (
          <span className="text-sm capitalize text-muted-foreground">normal</span>
        ) : (
          <PriorityBadge priority={row.original.priority} />
        ),
    },
    {
      id: 'status',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      accessorFn: (g) => g.status ?? '',
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      size: 130,
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: 'createdAt',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Submitted" />,
      size: 120,
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">{fmtDate(row.original.createdAt)}</span>
      ),
    },
    {
      id: 'actions',
      enableHiding: false,
      enableSorting: false,
      size: 60,
      header: () => <div className="text-right font-medium text-gray-500">Action</div>,
      cell: ({ row }) => {
        const g = row.original;
        const open = () => setTimeout(() => onView(g), 0);
        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
                  aria-label={`Actions for grievance ${g.subject}`}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[12rem]">
                <DropdownMenuLabel>Action</DropdownMenuLabel>
                <DropdownMenuItem onSelect={open}>
                  <Eye className="text-gray-500" /> View conversation
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];
}
