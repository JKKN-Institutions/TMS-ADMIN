'use client';

import type { ColumnDef } from '@tanstack/react-table';
import {
  Activity,
  AlertTriangle,
  Battery,
  BatteryLow,
  Clock,
  Eye,
  MoreHorizontal,
  Navigation,
  Pencil,
  Settings,
  Trash2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import type { GpsDevice } from './device-api';

function relHeartbeat(ts: string | null): string {
  if (!ts) return 'Never';
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (diff < 1) return 'Just now';
  if (diff < 60) return `${diff}m ago`;
  if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
  return `${Math.floor(diff / 1440)}d ago`;
}

function StatusBadge({ status }: { status?: string | null }) {
  const map: Record<string, string> = {
    active: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
    inactive: 'bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-300',
    offline: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
    maintenance: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-400',
    error: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
  };
  const icon: Record<string, React.ReactNode> = {
    active: <Activity className="h-3.5 w-3.5" />,
    inactive: <Clock className="h-3.5 w-3.5" />,
    offline: <WifiOff className="h-3.5 w-3.5" />,
    maintenance: <Settings className="h-3.5 w-3.5" />,
    error: <AlertTriangle className="h-3.5 w-3.5" />,
  };
  const key = status ?? '';
  const cls = map[key] ?? 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${cls}`}>
      {icon[key] ?? <Navigation className="h-3.5 w-3.5" />}
      {status || 'unknown'}
    </span>
  );
}

function BatteryCell({ level }: { level: number | null }) {
  if (level == null) return <span className="text-gray-400">—</span>;
  const low = level < 20;
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm ${low ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-300'}`}>
      {low ? <BatteryLow className="h-4 w-4" /> : <Battery className="h-4 w-4" />}
      {level}%
    </span>
  );
}

function SignalCell({ level }: { level: number | null }) {
  if (level == null) return <span className="text-gray-400">—</span>;
  const color = level > 70 ? 'text-green-600' : level > 30 ? 'text-yellow-600' : 'text-red-600';
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300">
      {level > 30 ? <Wifi className={`h-4 w-4 ${color}`} /> : <WifiOff className={`h-4 w-4 ${color}`} />}
      {level}%
    </span>
  );
}

export function getGpsDeviceColumns(
  onView: (d: GpsDevice) => void,
  onEdit: (d: GpsDevice) => void,
  onDelete: (d: GpsDevice) => void,
  canManage: boolean,
  canDelete: boolean
): ColumnDef<GpsDevice>[] {
  const selectColumn: ColumnDef<GpsDevice> = {
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
  };

  return [
    ...(canManage ? [selectColumn] : []),
    {
      accessorKey: 'device_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Device Name" />,
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() => onView(row.original)}
          className="text-left font-semibold text-gray-900 hover:text-green-600 hover:underline dark:text-gray-100"
        >
          {row.original.device_name}
        </button>
      ),
    },
    {
      accessorKey: 'device_id',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Device ID" />,
      size: 130,
      cell: ({ row }) => <span className="font-mono text-sm text-gray-700 dark:text-gray-300">{row.original.device_id}</span>,
    },
    {
      accessorKey: 'device_model',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Model" />,
      cell: ({ row }) => <span className="text-gray-700 dark:text-gray-300">{row.original.device_model || '—'}</span>,
    },
    {
      id: 'status',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      accessorFn: (d) => d.status ?? '',
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      size: 130,
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: 'sim_number',
      header: ({ column }) => <DataTableColumnHeader column={column} title="SIM Number" />,
      cell: ({ row }) => <span className="font-mono text-sm text-gray-600 dark:text-gray-300">{row.original.sim_number || '—'}</span>,
    },
    {
      accessorKey: 'imei',
      header: ({ column }) => <DataTableColumnHeader column={column} title="IMEI" />,
      cell: ({ row }) => <span className="font-mono text-sm text-gray-600 dark:text-gray-300">{row.original.imei || '—'}</span>,
    },
    {
      id: 'battery_level',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Battery" />,
      accessorFn: (d) => d.battery_level ?? -1,
      size: 110,
      cell: ({ row }) => <BatteryCell level={row.original.battery_level} />,
    },
    {
      id: 'signal_strength',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Signal" />,
      accessorFn: (d) => d.signal_strength ?? -1,
      size: 110,
      cell: ({ row }) => <SignalCell level={row.original.signal_strength} />,
    },
    {
      id: 'last_heartbeat',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Last Heartbeat" />,
      accessorFn: (d) => d.last_heartbeat ?? '',
      cell: ({ row }) => <span className="whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">{relHeartbeat(row.original.last_heartbeat)}</span>,
    },
    {
      id: 'actions',
      enableHiding: false,
      enableSorting: false,
      size: 60,
      header: () => <div className="text-right font-medium text-gray-500">Action</div>,
      cell: ({ row }) => {
        const d = row.original;
        const open = (fn: (d: GpsDevice) => void) => setTimeout(() => fn(d), 0);
        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
                  aria-label={`Actions for ${d.device_name}`}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[10rem]">
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
  ];
}
