'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import type { StaffPassenger } from '@/lib/passengers/types';
import { DataTable } from '@/components/ui/data-table';
import { getStaffColumns } from './columns';

async function fetchStaff(): Promise<StaffPassenger[]> {
  const res = await fetch('/api/admin/passengers/staff');
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to fetch staff');
  return json.data as StaffPassenger[];
}

function options(values: (string | null)[]): { label: string; value: string }[] {
  return Array.from(new Set(values.filter((v): v is string => !!v)))
    .sort((a, b) => a.localeCompare(b))
    .map((v) => ({ label: v, value: v }));
}

export default function StaffPassengersPage() {
  const router = useRouter();
  const { data: staff = [], isLoading, isError } = useQuery({
    queryKey: ['passenger-staff'],
    queryFn: fetchStaff,
  });

  const columns = useMemo(
    () => getStaffColumns((s) => router.push(`/passengers/staff/${s.id}`)),
    [router]
  );

  const total = staff.length;
  const assigned = staff.filter((s) => s.assigned).length;
  const unassigned = total - assigned;
  const activeCount = staff.filter((s) => s.isActive).length;
  const stats = [
    { label: 'Bus-Required Staff', value: total },
    { label: 'Route Assigned', value: assigned },
    { label: 'Unassigned', value: unassigned },
    { label: 'Active', value: activeCount },
  ];

  const filters = useMemo(
    () => [
      { columnId: 'institution', title: 'Institution', options: options(staff.map((s) => s.institutionName)) },
      { columnId: 'department', title: 'Department', options: options(staff.map((s) => s.departmentName)) },
      {
        columnId: 'activeStatus',
        title: 'Status',
        options: [
          { label: 'Active', value: 'active' },
          { label: 'Inactive', value: 'inactive' },
        ],
      },
      {
        columnId: 'assigned',
        title: 'Assignment',
        options: [
          { label: 'Assigned', value: 'assigned' },
          { label: 'Unassigned', value: 'unassigned' },
        ],
      },
    ],
    [staff]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Staff</h1>
          <p className="text-gray-600">Staff who require transport (bus_required), from MyJKKN</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-sm text-gray-500">{s.label}</p>
            <p className="text-2xl font-bold text-gray-900">{s.value}</p>
          </div>
        ))}
      </div>

      {isError ? (
        <div className="py-16 text-center">
          <Users className="mx-auto mb-3 h-10 w-10 text-gray-400" />
          <p className="text-gray-600">Failed to load staff. Please retry.</p>
        </div>
      ) : !isLoading && total === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center">
          <Users className="mx-auto mb-3 h-10 w-10 text-gray-400" />
          <p className="font-medium text-gray-700">No bus-required staff yet</p>
          <p className="mt-1 text-sm text-gray-500">
            Staff will appear here once they are marked as requiring transport in MyJKKN.
          </p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={staff}
          entityName="staff"
          isLoading={isLoading}
          getRowId={(s) => s.id}
          searchPlaceholder="Search name, staff ID, email..."
          filters={filters}
        />
      )}
    </div>
  );
}
