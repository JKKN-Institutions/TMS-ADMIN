'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Check, Eye, MoreHorizontal, X } from 'lucide-react';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { VacateRequestDTO } from '@/lib/vacate/types';

const inr = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString() : '—');

export function VacateStatusBadge({ status }: { status?: string }) {
  const map: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
    approved: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
    rejected: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
    withdrawn: 'bg-gray-200 text-gray-600 dark:bg-gray-500/20 dark:text-gray-300',
  };
  const cls = map[status ?? ''] ?? 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${cls}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {status ?? 'unknown'}
    </span>
  );
}

export function getVacateColumns(
  onView: (r: VacateRequestDTO) => void,
  onApprove: (r: VacateRequestDTO) => void,
  onReject: (r: VacateRequestDTO) => void,
  canManage: boolean,
): ColumnDef<VacateRequestDTO>[] {
  return [
    {
      id: 'learner',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Learner" />,
      accessorFn: (r) => `${r.learnerName} ${r.rollNumber ?? ''}`.trim(),
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() => onView(row.original)}
          className="flex min-w-0 flex-col gap-0.5 text-left"
        >
          <span className="truncate font-semibold text-gray-900 hover:text-green-600 hover:underline dark:text-gray-100">
            {row.original.learnerName}
          </span>
          {row.original.rollNumber && (
            <span className="text-xs text-gray-500 dark:text-gray-400">{row.original.rollNumber}</span>
          )}
        </button>
      ),
    },
    {
      accessorKey: 'routeLabel',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Route" />,
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">{row.original.routeLabel ?? '—'}</span>
      ),
    },
    {
      accessorKey: 'amountToCancel',
      header: ({ column }) => <DataTableColumnHeader column={column} title="To cancel" />,
      size: 120,
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm font-medium tabular-nums text-gray-800 dark:text-gray-200">
          {row.original.status === 'approved' ? `${row.original.cancelledBillCount} term(s)` : inr(row.original.amountToCancel)}
        </span>
      ),
    },
    {
      id: 'status',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      accessorFn: (r) => r.status,
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      size: 130,
      cell: ({ row }) => <VacateStatusBadge status={row.original.status} />,
    },
    {
      accessorKey: 'createdAt',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Requested" />,
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
        const r = row.original;
        const open = (fn: () => void) => setTimeout(fn, 0);
        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
                  aria-label={`Actions for ${r.learnerName}`}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[12rem]">
                <DropdownMenuLabel>Action</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => open(() => onView(r))}>
                  <Eye className="text-gray-500" /> View details
                </DropdownMenuItem>
                {canManage && r.status === 'pending' && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => open(() => onApprove(r))}>
                      <Check className="text-green-600" /> Approve &amp; cancel bill
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => open(() => onReject(r))}>
                      <X className="text-red-600" /> Reject
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
