'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Plus, Receipt, CheckCircle, IndianRupee, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { DataTable } from '@/components/ui/data-table';
import { PageHeader } from '@/components/ui/page-header';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { getFeeColumns } from './columns';
import { inr } from './columns';
import type { FeeStructureRow } from '@/lib/fees/types';
import { activeAnnualFeeRange } from '@/lib/fees/annual-range';

async function fetchRows(): Promise<FeeStructureRow[]> {
  const res = await fetch('/api/admin/fees', { credentials: 'same-origin' });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.error || 'Failed to fetch fee structures');
  return (result.data || []) as FeeStructureRow[];
}

export default function FeesPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ role?: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FeeStructureRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [bulkTarget, setBulkTarget] = useState<{ rows: FeeStructureRow[]; reset: () => void } | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  useEffect(() => {
    const u = localStorage.getItem('adminUser');
    if (u) setUser(JSON.parse(u));
  }, []);

  const {
    data: rows = [],
    isLoading: loading,
    isError,
    refetch,
  } = useQuery({ queryKey: ['fee-structures'], queryFn: fetchRows });

  useEffect(() => {
    if (isError) toast.error('Failed to load fee structures');
  }, [isError]);

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
      await refetch();
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
      await refetch();
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

  // A few structures only — no summary cards; the active fee range is in the description.
  const range = activeAnnualFeeRange(rows);
  const rangeLabel = !range ? null : range.min === range.max ? inr(range.min) : `${inr(range.min)} – ${inr(range.max)}`;

  return (
    <div className="space-y-6">
      <PageHeader
        description={
          <>
            The yearly bus maintenance charge. Set up fee structures here, then generate bills.
            {rangeLabel && <> Active fees: <span className="font-medium text-gray-900 dark:text-gray-100">{rangeLabel}</span> per person a year.</>}
          </>
        }
        actions={
          <>
            <Link
              href="/fees/fine-rates"
              className="inline-flex h-[38px] items-center gap-2 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              <IndianRupee className="h-4 w-4" /> Transport Fee rates
            </Link>
            {canManage && (
              <button
                onClick={() => router.push('/fees/new')}
                className="inline-flex h-[38px] items-center gap-2 rounded-lg bg-green-600 px-3 text-sm font-medium text-white transition-colors hover:bg-green-700"
              >
                <Plus className="h-4 w-4" /> Add Structure
              </button>
            )}
          </>
        }
      />

      <DataTable
        columns={columns}
        data={rows}
        entityName="maintenance fee structures"
        isLoading={loading}
        searchPlaceholder="Search maintenance fee structure..."
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
        title="Delete maintenance fee structure?"
        description={deleteTarget ? `This permanently deletes "${deleteTarget.name}". Structures with generated bills cannot be deleted.` : ''}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        loading={deleting}
        danger
      />
      <ConfirmDialog
        open={!!bulkTarget}
        onOpenChange={(open) => { if (!open) setBulkTarget(null); }}
        title={`Delete ${bulkTarget?.rows.length ?? 0} maintenance fee structure(s)?`}
        description="This permanently deletes the selected maintenance fee structures. Any with generated bills will be skipped."
        confirmLabel="Delete Selected"
        onConfirm={confirmBulkDelete}
        loading={bulkDeleting}
        danger
      />
    </div>
  );
}
