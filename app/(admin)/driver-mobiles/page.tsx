'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Plus, Smartphone, CheckCircle, AlertTriangle, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { DataTable } from '@/components/ui/data-table';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import UniversalStatCard from '@/components/universal-stat-card';
import { getDriverMobileColumns, type DriverMobileRow } from './columns';

async function fetchMobiles(): Promise<DriverMobileRow[]> {
  const res = await fetch('/api/admin/driver-mobiles');
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.error || 'Failed to fetch driver mobiles');
  return (result.data || []) as DriverMobileRow[];
}

export default function DriverMobilesPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ role?: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DriverMobileRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [bulkTarget, setBulkTarget] = useState<{ rows: DriverMobileRow[]; reset: () => void } | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  useEffect(() => {
    const u = localStorage.getItem('adminUser');
    if (u) setUser(JSON.parse(u));
  }, []);

  const { data: mobiles = [], isLoading: loading, isError, refetch } = useQuery({
    queryKey: ['driver-mobiles'],
    queryFn: fetchMobiles,
  });

  useEffect(() => {
    if (isError) toast.error('Failed to load driver mobiles');
  }, [isError]);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/driver-mobiles?id=${deleteTarget.id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Failed to delete');
      toast.success(`Deleted ${deleteTarget.brand} ${deleteTarget.model}`);
      setDeleteTarget(null);
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete driver mobile');
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
          fetch(`/api/admin/driver-mobiles?id=${r.id}`, { method: 'DELETE', credentials: 'same-origin' }).then(
            async (res) => {
              const j = await res.json().catch(() => ({}));
              if (!res.ok || !j.success) throw new Error(j.error || 'Delete failed');
            }
          )
        )
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      const ok = bulkTarget.rows.length - failed;
      if (failed === 0) toast.success(`Deleted ${ok} mobile(s)`);
      else toast.error(`Deleted ${ok}, failed ${failed}`);
      bulkTarget.reset();
      setBulkTarget(null);
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Bulk delete failed');
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleView = (m: DriverMobileRow) => router.push(`/driver-mobiles/${m.id}`);
  const handleEdit = (m: DriverMobileRow) => router.push(`/driver-mobiles/${m.id}/edit`);
  const handleDelete = (m: DriverMobileRow) => setDeleteTarget(m);

  const userRole = user?.role ?? '';
  const canManage = ['super_admin', 'transport_manager'].includes(userRole);
  const canDelete = userRole === 'super_admin';

  const columns = useMemo(
    () => getDriverMobileColumns(handleView, handleEdit, handleDelete, canManage, canDelete),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canManage, canDelete]
  );

  const total = mobiles.length;
  const assigned = mobiles.filter((m) => m.status === 'assigned').length;
  const returned = mobiles.filter((m) => m.status === 'returned').length;
  const issues = mobiles.filter((m) => m.status === 'damaged' || m.status === 'lost').length;
  const stats = [
    { title: 'Total Mobiles', value: total, subtitle: 'All supplied phones', icon: Smartphone, color: 'blue' as const },
    { title: 'Assigned', value: assigned, subtitle: 'Currently with drivers', icon: CheckCircle, color: 'green' as const },
    { title: 'Returned', value: returned, subtitle: 'Handed back', icon: Smartphone, color: 'purple' as const },
    { title: 'Damaged / Lost', value: issues, subtitle: 'Needs attention', icon: AlertTriangle, color: 'orange' as const },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Driver Mobiles</h1>
          <p className="text-gray-600">Manage mobile phones supplied to drivers</p>
        </div>
        {canManage && (
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => router.push('/driver-mobiles/new')}
              className="inline-flex h-[38px] items-center gap-2 rounded-lg bg-green-600 px-3 text-sm font-medium text-white transition-colors hover:bg-green-700"
            >
              <Plus className="h-4 w-4" /> Add Mobile
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s, i) => (
          <UniversalStatCard
            key={s.title}
            title={s.title}
            value={s.value}
            subtitle={s.subtitle}
            icon={s.icon}
            color={s.color}
            variant="default"
            loading={loading}
            delay={i}
          />
        ))}
      </div>

      <DataTable
        columns={columns}
        data={mobiles}
        entityName="driver mobiles"
        isLoading={loading}
        searchPlaceholder="Search brand, model, IMEI, driver..."
        enableRowSelection={canManage}
        getRowId={(m) => m.id}
        filters={[
          { columnId: 'status', title: 'Status', options: [
            { label: 'Assigned', value: 'assigned' },
            { label: 'Returned', value: 'returned' },
            { label: 'Damaged', value: 'damaged' },
            { label: 'Lost', value: 'lost' },
          ]},
        ]}
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

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete driver mobile?"
        description={
          deleteTarget
            ? `This permanently deletes "${deleteTarget.brand} ${deleteTarget.model}". This action cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        loading={deleting}
        danger
      />

      <ConfirmDialog
        open={!!bulkTarget}
        onOpenChange={(open) => { if (!open) setBulkTarget(null); }}
        title={`Delete ${bulkTarget?.rows.length ?? 0} mobile(s)?`}
        description="This permanently deletes the selected driver mobiles. This action cannot be undone."
        confirmLabel="Delete Selected"
        onConfirm={confirmBulkDelete}
        loading={bulkDeleting}
        danger
      />
    </div>
  );
}
