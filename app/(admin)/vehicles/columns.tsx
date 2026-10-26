'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, CheckCircle, Eye, MoreHorizontal, Navigation, Pencil, Trash2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ExpiryBadge } from '@/components/ui/display-bits';
import { daysUntil, expiryState, formatDate, type ExpiryState } from '@/lib/format/display';

// Shape of a vehicle row coming from /api/admin/vehicles (tms_vehicle).
export interface VehicleRow {
  id: string;
  registration_number: string;
  model?: string | null;
  capacity?: number;
  fuel_type?: string;
  status?: string;
  mileage?: number | string;
  insurance_expiry?: string | null;
  fitness_expiry?: string | null;
  last_maintenance?: string | null;
  next_maintenance?: string | null;
  gps_device_id?: string | null;
  live_tracking_enabled?: boolean;
  // Identity
  vehicle_type?: string | null;
  manufacturer?: string | null;
  model_year?: number | null;
  color?: string | null;
  gross_vehicle_weight?: number | string | null;
  // Ownership
  ownership_type?: string | null;
  // Compliance
  permit_number?: string | null;
  permit_expiry_date?: string | null;
  pollution_certificate_number?: string | null;
  pollution_expiry_date?: string | null;
  road_tax_expiry_date?: string | null;
  // Insurance
  insurance_provider?: string | null;
  insurance_policy_number?: string | null;
  // Driver
  assigned_driver_id?: string | null;
  assigned_driver_name?: string | null;
  // GPS
  gps_provider?: string | null;
  sim_number?: string | null;
  // Financial
  monthly_emi?: number | string | null;
  fuel_card_number?: string | null;
  operating_cost_per_km?: number | string | null;
  // Emergency
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  first_aid_available?: boolean | null;
  fire_extinguisher_expiry?: string | null;
  // Documents (storage paths)
  rc_document_url?: string | null;
  insurance_document_url?: string | null;
  fitness_certificate_url?: string | null;
  permit_document_url?: string | null;
  // Notes
  chassis_number?: string | null;
  engine_number?: string | null;
  remarks?: string | null;
}


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

function FuelBadge({ fuel }: { fuel?: string }) {
  const map: Record<string, string> = {
    diesel: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
    petrol: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
    electric: 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400',
    cng: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400',
  };
  const cls = map[fuel ?? ''] ?? 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium uppercase ${cls}`}>
      {fuel ?? '—'}
    </span>
  );
}

// "Next maintenance" with an at-a-glance overdue indicator.
function MaintenanceCell({ next }: { next?: string | null }) {
  if (!next) return <span className="text-gray-400">—</span>;
  const due = new Date(next) <= new Date();
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap text-sm ${
        due ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-300'
      }`}
    >
      {due ? <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> : <CheckCircle className="h-3.5 w-3.5 shrink-0 text-green-500" />}
      {new Date(next).toLocaleDateString()}
    </span>
  );
}

// The five statutory documents. The dashboard's "expired documents" count uses
// the same dates, so the Vehicles page and the dashboard agree.
export const VEHICLE_DOCS: { key: keyof VehicleRow; label: string }[] = [
  { key: 'insurance_expiry', label: 'Insurance' },
  { key: 'fitness_expiry', label: 'Fitness (FC)' },
  { key: 'permit_expiry_date', label: 'Permit' },
  { key: 'pollution_expiry_date', label: 'Pollution (PUC)' },
  { key: 'road_tax_expiry_date', label: 'Road tax' },
];

const DOC_RANK: Record<ExpiryState, number> = { expired: 0, soon: 1, missing: 2, ok: 3 };

/** The most urgent state across a vehicle's documents: expired > soon > missing > ok. */
export function docsState(v: VehicleRow): ExpiryState {
  let worst: ExpiryState = 'ok';
  for (const d of VEHICLE_DOCS) {
    const st = expiryState(v[d.key] as string | null | undefined);
    if (DOC_RANK[st] < DOC_RANK[worst]) worst = st;
  }
  return worst;
}

const DOC_BADGE: Record<ExpiryState, { text: (n: number) => string; cls: string }> = {
  expired: { text: (n) => `${n} expired`, cls: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400' },
  soon: { text: (n) => `${n} due soon`, cls: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300' },
  missing: { text: (n) => `${n} not on file`, cls: 'bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-300' },
  ok: { text: () => 'All valid', cls: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400' },
};

// One badge for the most urgent document; hover lists every document's date.
function DocumentsCell({ v }: { v: VehicleRow }) {
  const worst = docsState(v);
  const count = VEHICLE_DOCS.filter((d) => expiryState(v[d.key] as string | null) === worst).length;
  const badge = DOC_BADGE[worst];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`inline-flex cursor-help items-center rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>
          {badge.text(count)}
        </span>
      </TooltipTrigger>
      <TooltipContent className="bg-gray-900 p-2">
        <ul className="space-y-1">
          {VEHICLE_DOCS.map((d) => {
            const date = v[d.key] as string | null | undefined;
            const st = expiryState(date);
            return (
              <li key={d.key} className="flex justify-between gap-4">
                <span>{d.label}</span>
                <span className={st === 'expired' ? 'text-red-300' : st === 'soon' ? 'text-amber-300' : 'text-gray-300'}>
                  {!date ? 'Not on file' : st === 'expired' ? `Expired ${formatDate(date)}` : st === 'soon' ? `${daysUntil(date)}d · ${formatDate(date)}` : formatDate(date)}
                </span>
              </li>
            );
          })}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}

export function getVehicleColumns(
  onView: (v: VehicleRow) => void,
  onEdit: (v: VehicleRow) => void,
  onDelete: (v: VehicleRow) => void,
  onTrack: (v: VehicleRow) => void,
  canManage: boolean,
  canDelete: boolean
): ColumnDef<VehicleRow>[] {
  const selectColumn: ColumnDef<VehicleRow> = {
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
    {
      accessorKey: 'model',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Model" />,
      cell: ({ row }) => <span className="text-gray-700 dark:text-gray-300">{row.original.model || '—'}</span>,
    },
    {
      id: 'vehicle_type',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
      accessorFn: (v) => v.vehicle_type ?? '',
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      size: 110,
      cell: ({ row }) => (
        <span className="capitalize text-gray-700 dark:text-gray-300">
          {row.original.vehicle_type || '—'}
        </span>
      ),
    },
    {
      accessorKey: 'capacity',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Capacity" />,
      size: 100,
      cell: ({ row }) => (
        <span className="tabular-nums text-gray-700 dark:text-gray-300">{row.original.capacity ?? 0} seats</span>
      ),
    },
    {
      id: 'fuel_type',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fuel" />,
      accessorFn: (v) => v.fuel_type ?? '',
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      size: 110,
      cell: ({ row }) => <FuelBadge fuel={row.original.fuel_type} />,
    },
    {
      accessorKey: 'mileage',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Mileage" />,
      size: 110,
      cell: ({ row }) => {
        const m = row.original.mileage;
        return (
          <span className="tabular-nums text-gray-600 dark:text-gray-300">
            {m !== undefined && m !== null && Number(m) > 0 ? `${m} km/l` : '—'}
          </span>
        );
      },
    },
    {
      id: 'next_maintenance',
      meta: { label: 'Next maintenance' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Next Maintenance" />,
      accessorFn: (v) => v.next_maintenance ?? '',
      cell: ({ row }) => <MaintenanceCell next={row.original.next_maintenance} />,
    },
    {
      id: 'documents',
      meta: { label: 'Documents' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Documents" />,
      accessorFn: (v) => docsState(v),
      sortingFn: (a, b) => DOC_RANK[docsState(a.original)] - DOC_RANK[docsState(b.original)],
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      cell: ({ row }) => <DocumentsCell v={row.original} />,
    },
    {
      id: 'insurance_expiry',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Insurance Expiry" />,
      accessorFn: (v) => v.insurance_expiry ?? '',
      meta: { label: 'Insurance expiry' },
      cell: ({ row }) => <ExpiryBadge date={row.original.insurance_expiry} />,
    },
    {
      id: 'fitness_expiry',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fitness Expiry" />,
      accessorFn: (v) => v.fitness_expiry ?? '',
      meta: { label: 'Fitness expiry' },
      cell: ({ row }) => <ExpiryBadge date={row.original.fitness_expiry} />,
    },
    {
      id: 'status',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      accessorFn: (v) => v.status ?? '',
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      size: 120,
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: 'actions',
      enableHiding: false,
      enableSorting: false,
      size: 60,
      header: () => <div className="text-right font-medium text-gray-500">Action</div>,
      cell: ({ row }) => {
        const v = row.original;
        const open = (fn: (v: VehicleRow) => void) => setTimeout(() => fn(v), 0);
        const canTrack = !!(v.gps_device_id && v.live_tracking_enabled);
        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
                  aria-label={`Actions for vehicle ${v.registration_number}`}
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
                <DropdownMenuItem onSelect={() => open(onTrack)} disabled={!canTrack}>
                  <Navigation className="text-gray-500" /> Live track
                </DropdownMenuItem>
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
