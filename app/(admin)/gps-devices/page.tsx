'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Navigation, Activity, WifiOff, BatteryLow, Settings, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import UniversalStatCard from '@/components/universal-stat-card';
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

export default function GpsDevicesPage() {
  const router = useRouter();
  const { canManage, canDelete } = useGpsRole();

  const [devices, setDevices] = useState<GpsDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMercydaModalOpen, setIsMercydaModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<GpsDevice | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [bulkTarget, setBulkTarget] = useState<{ rows: GpsDevice[]; reset: () => void } | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const fetchDevices = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/gps/devices', { cache: 'no-store', credentials: 'same-origin' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to fetch GPS devices');
      setDevices((json.data ?? []) as GpsDevice[]);
    } catch (error) {
      console.error('Error fetching GPS devices:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to load GPS devices');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDevices();
  }, []);

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
      await fetchDevices();
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
      await fetchDevices();
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

  const totalDevices = devices.length;
  const activeDevices = devices.filter((d) => d.status === 'active').length;
  const offlineDevices = devices.filter((d) => d.status === 'offline').length;
  const lowBatteryDevices = devices.filter((d) => d.battery_level != null && d.battery_level < 20).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">GPS Devices Management</h1>
          <p className="text-gray-600">Manage GPS tracking devices for your vehicle fleet</p>
        </div>
        {canManage && (
          <div className="flex items-center gap-3">
            <button onClick={() => setIsMercydaModalOpen(true)} className="btn-secondary flex items-center gap-2">
              <Settings className="h-4 w-4" />
              <span>MERCYDA Integration</span>
            </button>
            <button onClick={() => router.push('/gps-devices/new')} className="btn-primary flex items-center gap-2">
              <Plus className="h-4 w-4" />
              <span>Add GPS Device</span>
            </button>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-4">
        <UniversalStatCard title="Total Devices" value={totalDevices.toString()} subtitle="Registered GPS devices" icon={Navigation} color="blue" variant="default" loading={loading} />
        <UniversalStatCard title="Active Devices" value={activeDevices.toString()} subtitle="Currently online" icon={Activity} color="green" variant="default" loading={loading} />
        <UniversalStatCard title="Offline Devices" value={offlineDevices.toString()} subtitle="Need attention" icon={WifiOff} color="red" variant="default" loading={loading} />
        <UniversalStatCard title="Low Battery" value={lowBatteryDevices.toString()} subtitle="Below 20%" icon={BatteryLow} color="yellow" variant="default" loading={loading} />
      </div>

      {/* Devices table */}
      <DataTable
        columns={columns}
        data={devices}
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
