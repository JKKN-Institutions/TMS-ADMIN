'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Download, FileJson, FileSpreadsheet, FileText, Plus, Trash2, Upload, UserCheck } from 'lucide-react';
import type { DriverListItem } from '@/types';
import { usePermissions } from '@/hooks/use-permissions';
import { DataTable } from '@/components/ui/data-table';
import { PageHeader } from '@/components/ui/page-header';
import { SummaryCard, SummaryCards, useCardFilters } from '@/components/ui/summary-cards';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getDriverColumns, isOnDuty, licenseState } from './columns';
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
  const cf = useCardFilters();

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

  // Cards name problems to act on; each one filters the table below.
  const total = drivers.length;
  const onDuty = drivers.filter(isOnDuty).length;
  const noLicense = drivers.filter((d) => licenseState(d) === 'missing').length;
  const licenseDue = drivers.filter((d) => ['expired', 'soon'].includes(licenseState(d))).length;
  const noRoute = drivers.filter((d) => d.routes.length === 0).length;

  return (
    <div className="space-y-6">
      <PageHeader
        description="Bus drivers, their licences, routes and whether they are on duty right now."
        actions={
          canManage && (
            <Link
              href="/drivers/new"
              className="inline-flex h-[38px] shrink-0 items-center gap-2 rounded-lg bg-green-600 px-3 text-sm font-medium text-white transition-colors hover:bg-green-700"
            >
              <Plus className="h-4 w-4" /> Create Driver
            </Link>
          )
        }
      />

      <SummaryCards>
        <SummaryCard label="All drivers" value={total} {...cf.allCard()} />
        <SummaryCard
          label="On duty now"
          value={onDuty}
          tone={onDuty ? 'good' : 'neutral'}
          title="Drivers sharing their location right now"
          {...cf.card('duty', 'on')}
        />
        <SummaryCard label="License missing" value={noLicense} tone={noLicense ? 'danger' : 'neutral'} {...cf.card('license', 'missing')} />
        <SummaryCard
          label="License expired / due"
          value={licenseDue}
          tone={licenseDue ? 'warn' : 'neutral'}
          title="Expired, or expiring within 60 days"
          {...cf.card('license', 'attention')}
        />
        <SummaryCard label="No route" value={noRoute} tone={noRoute ? 'warn' : 'neutral'} {...cf.card('route', 'none')} />
      </SummaryCards>

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
          columnFilters={cf.filters}
          onColumnFiltersChange={cf.setFilters}
          initialColumnVisibility={{ email: false, experienceYears: false, employmentType: false, dateOfJoining: false }}
          filters={[
            { columnId: 'duty', title: 'Duty', options: [
              { label: 'On duty', value: 'on' }, { label: 'Off duty', value: 'off' },
            ] },
            { columnId: 'license', title: 'License', options: [
              { label: 'Missing', value: 'missing' }, { label: 'Expired', value: 'expired' },
              { label: 'Expiring in 60 days', value: 'soon' }, { label: 'No expiry date', value: 'no_expiry' },
              { label: 'Valid', value: 'ok' },
            ] },
            { columnId: 'activeStatus', title: 'Staff status', options: [
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
