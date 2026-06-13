'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Receipt, CheckCircle, IndianRupee, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { DataTable } from '@/components/ui/data-table';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import UniversalStatCard from '@/components/universal-stat-card';
import { getFeeColumns } from './columns';
import { inr } from './columns';
import type { FeeStructureRow } from '@/lib/fees/types';

export default function FeesPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ role?: string } | null>(null);
  const [rows, setRows] = useState<FeeStructureRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<FeeStructureRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [bulkTarget, setBulkTarget] = useState<{ rows: FeeStructureRow[]; reset: () => void } | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  useEffect(() => {
    const u = localStorage.getItem('adminUser');
    if (u) setUser(JSON.parse(u));
  }, []);

  useEffect(() => {
    fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchRows = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/fees', { credentials: 'same-origin' });
      const result = await res.json();
      if (!result.success) throw new Error(result.error || 'Failed to fetch fee structures');
      setRows(result.data || []);
    } catch (e) {
      console.error('Error fetching fee structures:', e);
      toast.error('Failed to load fee structures');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const handleView = (f: FeeStructureRow) => router.push(`/fees/${f.id}`);
  const handleEdit = (f: FeeStructureRow) => router.push(`/fees/${f.id}/edit`);
  const handleDelete = (f: FeeStructureRow) => setDeleteTarget(f);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/fees?id=${deleteTarget.id}`, { method: 'DELETE', credentials: 'same-origin' });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Failed to delete');
      toast.success(`Deleted ${deleteTarget.name}`);
      setDeleteTarget(null);
      await fetchRows();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete fee structure');
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
          fetch(`/api/admin/fees?id=${r.id}`, { method: 'DELETE', credentials: 'same-origin' }).then(async (res) => {
            const j = await res.json().catch(() => ({}));
            if (!res.ok || !j.success) throw new Error(j.error || 'Delete failed');
          })
        )
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      const ok = bulkTarget.rows.length - failed;
      if (failed === 0) toast.success(`Deleted ${ok} fee structure(s)`);
      else toast.error(`Deleted ${ok}, failed ${failed} (some may have generated bills)`);
      bulkTarget.reset();
      setBulkTarget(null);
      await fetchRows();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Bulk delete failed');
    } finally {
      setBulkDeleting(false);
    }
  };

  const userRole = user?.role ?? '';
  const canManage = ['super_admin', 'transport_manager', 'transport_head', 'finance_admin'].includes(userRole);
  const canDelete = ['super_admin', 'transport_head'].includes(userRole);

  const columns = useMemo(
    () => getFeeColumns(handleView, handleEdit, handleDelete, canManage, canDelete),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canManage, canDelete]
  );

  const total = rows.length;
  const active = rows.filter((r) => r.status === 'active').length;
  const annualValue = rows.filter((r) => r.status === 'active').reduce((s, r) => s + Number(r.total_amount || 0), 0);
  const stats = [
    { title: 'Fee Structures', value: total, subtitle: 'All structures', icon: Receipt, color: 'blue' as const },
    { title: 'Active', value: active, subtitle: 'Ready to generate', icon: CheckCircle, color: 'green' as const },
    { title: 'Active Annual Value', value: inr(annualValue), subtitle: 'Sum of active fees', icon: IndianRupee, color: 'purple' as const },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fees</h1>
          <p className="text-gray-600">Configure transport fee structures and generate bills</p>
        </div>
        {canManage && (
          <button
            onClick={() => router.push('/fees/new')}
            className="inline-flex h-[38px] shrink-0 items-center gap-2 rounded-lg bg-green-600 px-3 text-sm font-medium text-white transition-colors hover:bg-green-700"
          >
            <Plus className="h-4 w-4" /> Add Fee Structure
          </button>
        )}
      </div>

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

      <DataTable
        columns={columns}
        data={rows}
        entityName="fee structures"
        isLoading={loading}
        searchPlaceholder="Search fee structure..."
        enableRowSelection={canManage}
        getRowId={(f) => f.id}
        filters={[
          {
            columnId: 'status',
            title: 'Status',
            options: [
              { label: 'Draft', value: 'draft' },
              { label: 'Active', value: 'active' },
              { label: 'Archived', value: 'archived' },
            ],
          },
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
        title="Delete fee structure?"
        description={deleteTarget ? `This permanently deletes "${deleteTarget.name}". Structures with generated bills cannot be deleted.` : ''}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        loading={deleting}
        danger
      />
      <ConfirmDialog
        open={!!bulkTarget}
        onOpenChange={(open) => { if (!open) setBulkTarget(null); }}
        title={`Delete ${bulkTarget?.rows.length ?? 0} fee structure(s)?`}
        description="This permanently deletes the selected fee structures. Any with generated bills will be skipped."
        confirmLabel="Delete Selected"
        onConfirm={confirmBulkDelete}
        loading={bulkDeleting}
        danger
      />
    </div>
  );
}
