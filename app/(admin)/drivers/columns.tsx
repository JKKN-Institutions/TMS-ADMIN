'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { ArrowUpDown, Eye, Pencil } from 'lucide-react';
import type { DriverListItem } from '@/types';

function Badge({ value, tone }: { value: string; tone: 'green' | 'yellow' | 'gray' }) {
  const cls = tone === 'green' ? 'bg-green-100 text-green-800' : tone === 'yellow' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-700';
  return <span className={`px-2 py-1 rounded-lg text-xs font-medium ${cls}`}>{value || '—'}</span>;
}

export function getDriverColumns(
  onView: (d: DriverListItem) => void,
  onEdit: (d: DriverListItem) => void,
  canManage: boolean
): ColumnDef<DriverListItem>[] {
  return [
    {
      accessorKey: 'name',
      header: ({ column }) => (
        <button className="flex items-center gap-1" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>Name <ArrowUpDown className="h-3 w-3" /></button>
      ),
      cell: ({ row }) => {
        const d = row.original;
        return (
          <div className="flex items-center gap-3">
            {d.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={d.avatarUrl} alt={d.name} className="w-8 h-8 rounded-full object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xs font-semibold">{d.name.slice(0,2).toUpperCase()}</div>
            )}
            <span className="font-medium text-gray-900">{d.name}</span>
          </div>
        );
      },
    },
    { accessorKey: 'phone', header: 'Phone' },
    { accessorKey: 'email', header: 'Email' },
    {
      id: 'licenseNumber',
      header: 'License No.',
      accessorFn: (d) => d.ops?.licenseNumber ?? '',
      cell: ({ row }) => row.original.ops?.licenseNumber ?? '—',
    },
    {
      id: 'driverStatus',
      header: 'Driver Status',
      accessorFn: (d) => d.ops?.driverStatus ?? '',
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      cell: ({ row }) => {
        const s = row.original.ops?.driverStatus;
        if (!s) return '—';
        return <Badge value={s.replace(/_/g, ' ')} tone={s === 'active' ? 'green' : s === 'on_leave' ? 'yellow' : 'gray'} />;
      },
    },
    {
      id: 'experienceYears',
      header: 'Exp (yrs)',
      accessorFn: (d) => d.ops?.experienceYears ?? 0,
      cell: ({ row }) => (row.original.ops ? row.original.ops.experienceYears : '—'),
    },
    {
      accessorKey: 'employmentType',
      header: 'Employment',
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      cell: ({ row }) => <span className="capitalize">{row.original.employmentType.replace(/_/g, ' ') || '—'}</span>,
    },
    {
      accessorKey: 'dateOfJoining',
      header: ({ column }) => (
        <button className="flex items-center gap-1" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>Joined <ArrowUpDown className="h-3 w-3" /></button>
      ),
      cell: ({ row }) => row.original.dateOfJoining ?? '—',
    },
    {
      id: 'actions',
      enableHiding: false,
      header: '',
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <button onClick={() => onView(row.original)} className="flex items-center gap-1 px-2 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded-lg"><Eye className="h-4 w-4" /> View</button>
          {canManage && (
            <button onClick={() => onEdit(row.original)} className="flex items-center gap-1 px-2 py-1 text-sm text-gray-600 hover:bg-gray-50 rounded-lg"><Pencil className="h-4 w-4" /> Edit</button>
          )}
        </div>
      ),
    },
  ];
}
