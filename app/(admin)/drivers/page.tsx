'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Download, FileJson, FileSpreadsheet, FileText, Plus, Trash2, Upload, UserCheck } from 'lucide-react';
import type { DriverListItem } from '@/types';
import { usePermissions } from '@/hooks/use-permissions';
import { DataTable } from '@/components/ui/data-table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getDriverColumns } from './columns';
import { DriverDeleteDialog } from './driver-delete-dialog';
import { DriverBulkDeleteDialog } from './driver-bulk-delete-dialog';
import { DriverImportDialog } from './driver-import-dialog';
import { exportDrivers, downloadDriverTemplate } from './driver-export';

async function fetchDrivers(): Promise<DriverListItem[]> {
  const res = await fetch('/api/admin/drivers');
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to fetch drivers');
  return json.data as DriverListItem[];
}

const outlineBtn =
  'inline-flex h-[38px] items-center gap-2 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50';

export default function DriversPage() {
  const router = useRouter();
  const { can, isSuperAdmin } = usePermissions();
  const canManage = isSuperAdmin || can('tms.drivers.manage');
  const [deleting, setDeleting] = useState<DriverListItem | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [bulkState, setBulkState] = useState<{ rows: DriverListItem[]; reset: () => void } | null>(null);

  const { data: drivers = [], isLoading, isError } = useQuery({ queryKey: ['drivers'], queryFn: fetchDrivers });

  // View/Edit are now in-module pages (no popups). Delete stays a confirm dialog.
  const columns = useMemo(
    () =>
      getDriverColumns(
        (d) => router.push(`/drivers/${d.id}`),
        (d) => router.push(`/drivers/${d.id}/edit`),
        setDeleting,
        canManage
      ),
    [canManage, router]
  );

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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Drivers</h1>
          <p className="text-gray-600">Driver-role staff from MyJKKN, with TMS operational details</p>
        </div>
        {canManage && (
          <Link
            href="/drivers/new"
            className="inline-flex h-[38px] shrink-0 items-center gap-2 rounded-lg bg-green-600 px-3 text-sm font-medium text-white transition-colors hover:bg-green-700"
          >
            <Plus className="h-4 w-4" /> Create Driver
          </Link>
        )}
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
          <UserCheck className="mx-auto mb-3 h-10 w-10 text-gray-400" />
          <p className="text-gray-600">Failed to load drivers. Please retry.</p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={drivers}
          entityName="drivers"
          isLoading={isLoading}
          enableRowSelection={canManage}
          getRowId={(d) => d.id}
          searchPlaceholder="Search name, email, phone..."
          filters={[
            { columnId: 'activeStatus', title: 'Status', options: [
              { label: 'Active', value: 'active' }, { label: 'Inactive', value: 'inactive' },
            ] },
            { columnId: 'employmentType', title: 'Employment', options: [
              { label: 'Full-time', value: 'full_time' }, { label: 'Part-time', value: 'part_time' },
            ] },
          ]}
          toolbarActions={({ selectedRows, resetSelection }) => (
            <>
              {canManage && (
                <button type="button" className={outlineBtn} onClick={() => setImportOpen(true)}>
                  <Upload className="h-4 w-4" /> Import
                </button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger className={outlineBtn}>
                  <Download className="h-4 w-4" /> Export <ChevronDown className="h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => exportDrivers(selectedRows.length ? selectedRows : drivers, 'xlsx')}>
                    <FileSpreadsheet className="text-gray-500" /> Export as Excel (.xlsx)
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => exportDrivers(selectedRows.length ? selectedRows : drivers, 'csv')}>
                    <FileText className="text-gray-500" /> Export as CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => exportDrivers(selectedRows.length ? selectedRows : drivers, 'json')}>
                    <FileJson className="text-gray-500" /> Export as JSON
                  </DropdownMenuItem>
                  {canManage && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={downloadDriverTemplate}>
                        <Download className="text-gray-500" /> Download import template
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              {canManage && selectedRows.length > 0 && (
                <button
                  type="button"
                  onClick={() => setBulkState({ rows: selectedRows, reset: resetSelection })}
                  className="inline-flex h-[38px] items-center gap-2 rounded-lg bg-red-600 px-3 text-sm font-medium text-white transition-colors hover:bg-red-700"
                >
                  <Trash2 className="h-4 w-4" /> Delete Selected ({selectedRows.length})
                </button>
              )}
            </>
          )}
        />
      )}

      <DriverDeleteDialog driver={deleting} open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)} />
      <DriverImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <DriverBulkDeleteDialog
        drivers={bulkState?.rows ?? []}
        open={!!bulkState}
        onOpenChange={(o) => !o && setBulkState(null)}
        onDeleted={() => bulkState?.reset()}
      />
    </div>
  );
}
