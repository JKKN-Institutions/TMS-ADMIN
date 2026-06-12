'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, CalendarRange, CheckCircle, Star, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { DataTable } from '@/components/ui/data-table';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import UniversalStatCard from '@/components/universal-stat-card';
import { getTransportYearColumns, type TransportYearRow } from './columns';

export default function TransportYearsPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ role?: string } | null>(null);
  const [years, setYears] = useState<TransportYearRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<TransportYearRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [bulkTarget, setBulkTarget] = useState<{ rows: TransportYearRow[]; reset: () => void } | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  useEffect(() => {
    const u = localStorage.getItem('adminUser');
    if (u) setUser(JSON.parse(u));
  }, []);

  useEffect(() => {
    fetchYears();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchYears = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/transport-years');
      const result = await res.json();
      if (!result.success) throw new Error(result.error || 'Failed to fetch transport years');
      setYears(result.data || []);
    } catch (e) {
      console.error('Error fetching transport years:', e);
      toast.error('Failed to load transport years');
      setYears([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (year: TransportYearRow) => setDeleteTarget(year);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/transport-years?id=${deleteTarget.id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Failed to delete');
      toast.success(`Deleted ${deleteTarget.name}`);
      setDeleteTarget(null);
      await fetchYears();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete transport year');
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
          fetch(`/api/admin/transport-years?id=${r.id}`, { method: 'DELETE', credentials: 'same-origin' }).then(
            async (res) => {
              const j = await res.json().catch(() => ({}));
              if (!res.ok || !j.success) throw new Error(j.error || 'Delete failed');
            }
          )
        )
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      const ok = bulkTarget.rows.length - failed;
      if (failed === 0) toast.success(`Deleted ${ok} transport year(s)`);
      else toast.error(`Deleted ${ok}, failed ${failed}`);
      bulkTarget.reset();
      setBulkTarget(null);
      await fetchYears();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Bulk delete failed');
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleView = (y: TransportYearRow) => router.push(`/transport-years/${y.id}`);
  const handleEdit = (y: TransportYearRow) => router.push(`/transport-years/${y.id}/edit`);

  const userRole = user?.role ?? '';
  const canManage = ['super_admin', 'transport_manager'].includes(userRole);
  const canDelete = userRole === 'super_admin';

  const columns = useMemo(
    () => getTransportYearColumns(handleView, handleEdit, handleDelete, canManage, canDelete),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canManage, canDelete]
  );

  const total = years.length;
  const active = years.filter((y) => y.is_active).length;
  const current = years.find((y) => y.is_current);
  const stats = [
    { title: 'Total Years', value: total, subtitle: 'All transport years', icon: CalendarRange, color: 'blue' as const },
    { title: 'Active', value: active, subtitle: 'Open for operations', icon: CheckCircle, color: 'green' as const },
    { title: 'Current Year', value: current?.name ?? '—', subtitle: 'In effect now', icon: Star, color: 'purple' as const },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Transport Years</h1>
          <p className="text-gray-600">Manage academic year periods for the transport module</p>
        </div>
        {canManage && (
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => router.push('/transport-years/new')}
              className="inline-flex h-[38px] items-center gap-2 rounded-lg bg-green-600 px-3 text-sm font-medium text-white transition-colors hover:bg-green-700"
            >
              <Plus className="h-4 w-4" /> Add Transport Year
            </button>
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
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

      {/* Data table */}
      <DataTable
        columns={columns}
        data={years}
        entityName="transport years"
        isLoading={loading}
        searchPlaceholder="Search year..."
        enableRowSelection={canManage}
        getRowId={(y) => y.id}
        filters={[
          { columnId: 'status', title: 'Status', options: [
            { label: 'Active', value: 'active' },
            { label: 'Inactive', value: 'inactive' },
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

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete transport year?"
        description={
          deleteTarget
            ? `This permanently deletes "${deleteTarget.name}". This action cannot be undone.`
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
        title={`Delete ${bulkTarget?.rows.length ?? 0} transport year(s)?`}
        description="This permanently deletes the selected transport years. This action cannot be undone."
        confirmLabel="Delete Selected"
        onConfirm={confirmBulkDelete}
        loading={bulkDeleting}
        danger
      />
    </div>
  );
}
