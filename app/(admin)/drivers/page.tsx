'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, UserCheck } from 'lucide-react';
import type { DriverListItem } from '@/types';
import { usePermissions } from '@/hooks/use-permissions';
import { DataTable } from '@/components/ui/data-table';
import { getDriverColumns } from './columns';
import { DriverDetailsDialog } from './driver-details-dialog';
import { DriverEditDialog } from './driver-edit-dialog';

async function fetchDrivers(): Promise<DriverListItem[]> {
  const res = await fetch('/api/admin/drivers');
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to fetch drivers');
  return json.data as DriverListItem[];
}

export default function DriversPage() {
  const { can, isSuperAdmin } = usePermissions();
  const canManage = isSuperAdmin || can('tms.drivers.manage');
  const [viewing, setViewing] = useState<DriverListItem | null>(null);
  const [editing, setEditing] = useState<DriverListItem | null>(null);

  const { data: drivers = [], isLoading, isError } = useQuery({ queryKey: ['drivers'], queryFn: fetchDrivers });

  const columns = useMemo(() => getDriverColumns(setViewing, setEditing, canManage), [canManage]);

  const total = drivers.length;
  const active = drivers.filter((d) => d.isActive).length;
  const onDuty = drivers.filter((d) => d.ops?.driverStatus === 'active').length;
  const withLicense = drivers.filter((d) => !!d.ops?.licenseNumber).length;
  const stats = [
    { label: 'Total Drivers', value: total },
    { label: 'Active (Staff)', value: active },
    { label: 'On Duty', value: onDuty },
    { label: 'License On File', value: withLicense },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Drivers</h1>
        <p className="text-gray-600">Driver-role staff from MyJKKN, with TMS operational details</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm text-gray-500">{s.label}</p>
            <p className="text-2xl font-bold text-gray-900">{s.value}</p>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-blue-600 mr-2" /><span className="text-gray-600">Loading drivers...</span></div>
      ) : isError ? (
        <div className="text-center py-16"><UserCheck className="w-10 h-10 text-gray-400 mx-auto mb-3" /><p className="text-gray-600">Failed to load drivers. Please retry.</p></div>
      ) : (
        <DataTable
          columns={columns}
          data={drivers}
          searchPlaceholder="Search name, email, phone..."
          filters={[
            { columnId: 'driverStatus', title: 'Driver Status', options: [
              { label: 'Active', value: 'active' }, { label: 'Inactive', value: 'inactive' }, { label: 'On Leave', value: 'on_leave' },
            ] },
            { columnId: 'employmentType', title: 'Employment', options: [
              { label: 'Full-time', value: 'full_time' }, { label: 'Part-time', value: 'part_time' },
            ] },
          ]}
        />
      )}

      <DriverDetailsDialog driver={viewing} open={!!viewing} onOpenChange={(o) => !o && setViewing(null)} />
      <DriverEditDialog driver={editing} open={!!editing} onOpenChange={(o) => !o && setEditing(null)} />
    </div>
  );
}
