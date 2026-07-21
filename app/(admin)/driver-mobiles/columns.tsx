'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Eye, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Row type — exactly what /api/admin/driver-mobiles returns (DB row + resolved driver).
export interface DriverMobileRow {
  id: string;
  driver_staff_id: string;
  driver_name: string;
  driver_phone: string | null;
  route_id: string | null;
  route_number: string | null;
  route_name: string | null;
  brand: string;
  model: string;
  color: string | null;
  imei: string | null;
  status: 'assigned' | 'returned' | 'damaged' | 'lost';
  supplied_date: string | null;
  notes: string | null;
  sim_number: string | null;
  phone_number: string | null;
  network_provider: string | null;
  purchase_date: string | null;
  purchase_cost: number | null;
  supplier_name: string | null;
  invoice_number: string | null;
  warranty_expiry: string | null;
  condition: 'new' | 'used' | 'refurbished' | null;
  storage_capacity: string | null;
  serial_number: string | null;
  accessories: string | null;
  image_paths: string[] | null;
  image_urls: (string | null)[] | null;
  handover_by: string | null;
  handover_date: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const STATUS_CLASS: Record<DriverMobileRow['status'], string> = {
  assigned: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-400',
  returned: 'bg-gray-100 text-gray-700 dark:bg-gray-500/15 dark:text-gray-300',
  damaged: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400',
  lost: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
};

export const statusBadge = (status: DriverMobileRow['status']) => (
  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_CLASS[status] ?? STATUS_CLASS.returned}`}>
    {status}
  </span>
);

export function getDriverMobileColumns(
  onView: (m: DriverMobileRow) => void,
  onEdit: (m: DriverMobileRow) => void,
  onDelete: (m: DriverMobileRow) => void,
  canManage: boolean,
  canDelete: boolean
): ColumnDef<DriverMobileRow>[] {
  const selectColumn: ColumnDef<DriverMobileRow> = {
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
      id: 'phone',
      accessorFn: (m) => `${m.brand} ${m.model}`,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Phone" />,
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() => onView(row.original)}
          className="flex flex-col text-left"
        >
          <span className="font-semibold text-gray-900 hover:text-green-600 hover:underline dark:text-gray-100">
            {row.original.brand} {row.original.model}
          </span>
          <span className="text-xs text-gray-500">{row.original.color ?? '—'}</span>
        </button>
      ),
    },
    {
      id: 'photo',
      enableSorting: false,
      enableHiding: true,
      size: 64,
      header: () => <span className="text-xs font-medium text-gray-500">Photo</span>,
      cell: ({ row }) => {
        const urls = (row.original.image_urls ?? []).filter((u): u is string => !!u);
        if (!urls.length) return <span className="text-gray-400">—</span>;
        return (
          <div className="flex items-center gap-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={urls[0]}
              alt="Handover phone photo"
              className="h-9 w-9 rounded border border-gray-200 object-cover dark:border-gray-700"
            />
            {urls.length > 1 && (
              <span className="rounded bg-gray-100 px-1 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                +{urls.length - 1}
              </span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'driver_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Driver" />,
      cell: ({ row }) => (
        <span className="flex flex-col">
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{row.original.driver_name}</span>
          {row.original.driver_phone && <span className="text-xs text-gray-500">{row.original.driver_phone}</span>}
        </span>
      ),
    },
    {
      id: 'route',
      accessorFn: (m) => m.route_number ?? '',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Route" />,
      cell: ({ row }) => (
        <span className="flex flex-col">
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{row.original.route_number ?? '—'}</span>
          {row.original.route_name && <span className="text-xs text-gray-500">{row.original.route_name}</span>}
        </span>
      ),
    },
    {
      accessorKey: 'phone_number',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Number" />,
      cell: ({ row }) => (
        <span className="text-sm text-gray-600 dark:text-gray-300">{row.original.phone_number ?? '—'}</span>
      ),
    },
    {
      accessorKey: 'imei',
      header: ({ column }) => <DataTableColumnHeader column={column} title="IMEI" />,
      cell: ({ row }) => (
        <span className="font-mono text-xs text-gray-600 dark:text-gray-300">{row.original.imei ?? '—'}</span>
      ),
    },
    {
      id: 'status',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      accessorFn: (m) => m.status,
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      cell: ({ row }) => statusBadge(row.original.status),
      size: 120,
    },
    {
      accessorKey: 'supplied_date',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Supplied" />,
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">{fmtDate(row.original.supplied_date)}</span>
      ),
    },
    {
      id: 'handover_by',
      accessorFn: (m) => m.handover_by ?? '',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Handover by" />,
      cell: ({ row }) => (
        <span className="flex flex-col">
          <span className="text-sm text-gray-700 dark:text-gray-300">{row.original.handover_by || '—'}</span>
          {row.original.handover_date && (
            <span className="text-xs text-gray-500">{fmtDate(row.original.handover_date)}</span>
          )}
        </span>
      ),
    },
    {
      id: 'actions',
      enableHiding: false,
      enableSorting: false,
      size: 60,
      header: () => <div className="text-right font-medium text-gray-500">Action</div>,
      cell: ({ row }) => {
        const m = row.original;
        const open = (fn: (m: DriverMobileRow) => void) => setTimeout(() => fn(m), 0);
        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
                  aria-label={`Actions for ${m.brand} ${m.model}`}
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
