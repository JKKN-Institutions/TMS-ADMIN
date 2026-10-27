'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Plus, Settings, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { SummaryCard, SummaryCards, useCardFilters } from '@/components/ui/summary-cards';
import type { ColumnDef } from '@tanstack/react-table';
import MercydaGpsIntegration from '@/components/mercyda-gps-integration';
import { DataTable } from '@/components/ui/data-table';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { getGpsDeviceColumns } from './columns';
import type { GpsDevice } from './device-api';
import { useGpsRole } from './use-gps-role';

const STATUS_FILTER_OPTIONS = [
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
  { label: 'Offline', value: 'offline' },
  { label: 'Maintenance', value: 'maintenance' },
  { label: 'Error', value: 'error' },
];

// Whether a device is actually sending, from its last heartbeat — the stored
// status string is set by hand or by the sync job and was not reliable (the
// one device read "inactive" while the Active and Offline cards both read 0).
const REPORTING_WINDOW_MS = 10 * 60_000;
export type Liveness = 'reporting' | 'silent' | 'never';
export function deviceLiveness(d: GpsDevice, now = Date.now()): Liveness {
  if (!d.last_heartbeat) return 'never';
  return now - new Date(d.last_heartbeat).getTime() < REPORTING_WINDOW_MS ? 'reporting' : 'silent';
}

async function fetchDevices(): Promise<GpsDevice[]> {
  const res = await fetch('/api/admin/gps/devices', { cache: 'no-store', credentials: 'same-origin' });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to fetch GPS devices');
  return (json.data ?? []) as GpsDevice[];
}

/** GPS devices list — the "GPS devices" tab of /tracking-devices. */
export function GpsDevicesPanel() {
  const router = useRouter();
  const { canManage, canDelete } = useGpsRole();
  const cf = useCardFilters();

  const [isMercydaModalOpen, setIsMercydaModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<GpsDevice | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [bulkTarget, setBulkTarget] = useState<{ rows: GpsDevice[]; reset: () => void } | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const {
    data: devices = [],
    isLoading: loading,
    isError,
    refetch,
  } = useQuery({ queryKey: ['gps-devices'], queryFn: fetchDevices });

  useEffect(() => {
    if (isError) toast.error('Failed to load GPS devices');
  }, [isError]);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/gps/devices/${deleteTarget.id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to delete GPS device');
      toast.success(`Deleted ${deleteTarget.device_name}`);
      setDeleteTarget(null);
      await refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete GPS device');
    } finally {
      setDeleting(false);
    }
  };

  const confirmBulkDelete = async () => {
    if (!bulkTarget) return;
    setBulkDeleting(true);
    try {
      const results = await Promise.allSettled(
        bulkTarget.rows.map((r) =>
          fetch(`/api/admin/gps/devices/${r.id}`, { method: 'DELETE', credentials: 'same-origin' }).then(async (res) => {
            const j = await res.json().catch(() => ({}));
            if (!res.ok || !j.success) throw new Error(j.error || 'Delete failed');
          })
        )
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      const ok = bulkTarget.rows.length - failed;
      if (failed === 0) toast.success(`Deleted ${ok} device(s)`);
      else toast.error(`Deleted ${ok}, failed ${failed}`);
      bulkTarget.reset();
      setBulkTarget(null);
      await refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Bulk delete failed');
    } finally {
      setBulkDeleting(false);
    }
  };

  const columns = useMemo(
    () =>
      getGpsDeviceColumns(
        (d) => router.push(`/gps-devices/${d.id}`),
        (d) => router.push(`/gps-devices/${d.id}/edit`),
        (d) => setDeleteTarget(d),
        canManage,
        canDelete
      ),
    [canManage, canDelete, router]
  );

  // Hidden helper column the cards filter on.
  const tableColumns = useMemo<ColumnDef<GpsDevice>[]>(
    () => [
      ...columns,
      {
        id: 'liveness',
        meta: { label: 'Reporting', hideInCard: true },
        accessorFn: (d) => deviceLiveness(d),
        filterFn: (row, id, value) => row.getValue(id) === value,
        header: 'Reporting',
        cell: ({ row }) => deviceLiveness(row.original),
      },
    ],
    [columns]
  );

  // Every device lands in exactly one of the three liveness cards.
  const totalDevices = devices.length;
  const reporting = devices.filter((d) => deviceLiveness(d) === 'reporting').length;
  const silent = devices.filter((d) => deviceLiveness(d) === 'silent').length;
  const never = devices.filter((d) => deviceLiveness(d) === 'never').length;
  const lowBattery = devices.filter((d) => d.battery_level != null && d.battery_level < 20).length;

  return (
    <div className="space-y-6">
      {canManage && (
        <div className="flex flex-wrap justify-end gap-2">
          <button
            onClick={() => setIsMercydaModalOpen(true)}
            className="inline-flex h-[38px] items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <Settings className="h-4 w-4" /> MERCYDA Integration
          </button>
          <button
            onClick={() => router.push('/gps-devices/new')}
            className="inline-flex h-[38px] items-center gap-2 rounded-lg bg-green-600 px-3 text-sm font-medium text-white transition-colors hover:bg-green-700"
          >
            <Plus className="h-4 w-4" /> Add GPS Device
          </button>
        </div>
      )}

      <SummaryCards>
        <SummaryCard label="All devices" value={totalDevices} {...cf.allCard()} />
        <SummaryCard label="Reporting" value={reporting} tone={reporting ? 'good' : 'neutral'} title="Sent a heartbeat in the last 10 minutes" {...cf.card('liveness', 'reporting')} />
        <SummaryCard label="Not reporting" value={silent} tone={silent ? 'warn' : 'neutral'} title="Has reported before, but not in the last 10 minutes" {...cf.card('liveness', 'silent')} />
        <SummaryCard label="Never connected" value={never} tone={never ? 'danger' : 'neutral'} title="Registered but has never sent a heartbeat" {...cf.card('liveness', 'never')} />
        {lowBattery > 0 && <SummaryCard label="Low battery" value={lowBattery} tone="warn" title="Below 20%" />}
      </SummaryCards>

      {/* Devices table */}
      <DataTable
        columns={tableColumns}
        data={devices}
        columnFilters={cf.filters}
        onColumnFiltersChange={cf.setFilters}
        initialColumnVisibility={{ liveness: false }}
        entityName="devices"
        isLoading={loading}
        enableRowSelection={canManage}
        getRowId={(d) => d.id}
        searchPlaceholder="Search name, device ID, IMEI..."
        filters={[{ columnId: 'status', title: 'Status', options: STATUS_FILTER_OPTIONS }]}
        toolbarActions={({ selectedRows, resetSelection }) =>
          canDelete && selectedRows.length > 0 ? (
            <button
              type="button"
              onClick={() => setBulkTarget({ rows: selectedRows, reset: resetSelection })}
              className="inline-flex h-[38px] items-center gap-2 rounded-lg bg-red-600 px-3 text-sm font-medium text-white transition-colors hover:bg-red-700"
            >
              <Trash2 className="h-4 w-4" /> Delete Selected ({selectedRows.length})
            </button>
          ) : null
        }
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete GPS device?"
        description={
          deleteTarget
            ? `This permanently deletes "${deleteTarget.device_name}" (${deleteTarget.device_id}). This action cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        loading={deleting}
        danger
      />

      {/* Bulk delete confirmation */}
      <ConfirmDialog
        open={!!bulkTarget}
        onOpenChange={(open) => {
          if (!open) setBulkTarget(null);
        }}
        title={`Delete ${bulkTarget?.rows.length ?? 0} GPS device(s)?`}
        description="This permanently deletes the selected devices. This action cannot be undone."
        confirmLabel="Delete Selected"
        onConfirm={confirmBulkDelete}
        loading={bulkDeleting}
        danger
      />

      {/* MERCYDA GPS Integration Modal */}
      {isMercydaModalOpen && <MercydaGpsIntegration onClose={() => setIsMercydaModalOpen(false)} />}
    </div>
  );
}
