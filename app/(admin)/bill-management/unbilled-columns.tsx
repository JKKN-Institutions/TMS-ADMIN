'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { GraduationCap, Users } from 'lucide-react';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import type { UnbilledPerson } from '@/lib/fees/bills';

const typeBadge = (t: UnbilledPerson['person_type']) => (
  <span
    className={
      t === 'staff'
        ? 'inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-800 dark:bg-purple-500/15 dark:text-purple-400'
        : 'inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-500/15 dark:text-blue-400'
    }
  >
    {t === 'staff' ? <Users className="h-3 w-3" /> : <GraduationCap className="h-3 w-3" />}
    {t === 'staff' ? 'Staff' : 'Learner'}
  </span>
);

export function getUnbilledColumns(): ColumnDef<UnbilledPerson>[] {
  return [
    {
      accessorKey: 'person_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Person" />,
      cell: ({ row }) => (
        <span className="font-medium text-gray-900 dark:text-gray-100">{row.original.person_name}</span>
      ),
    },
    {
      accessorKey: 'code',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Code" />,
      cell: ({ row }) => (
        <span className="text-sm text-gray-500 dark:text-gray-400">{row.original.code || '—'}</span>
      ),
      size: 140,
    },
    {
      id: 'institution',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Institution" />,
      accessorFn: (r) => r.institution_name ?? '',
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      cell: ({ row }) => (
        <span className="text-sm text-gray-600 dark:text-gray-300">{row.original.institution_name || '—'}</span>
      ),
    },
    {
      id: 'type',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
      accessorFn: (r) => r.person_type,
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      cell: ({ row }) => typeBadge(row.original.person_type),
      size: 120,
    },
  ];
}
