'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { DataTable } from '@/components/ui/data-table';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { SummaryCard, SummaryCards, useCardFilters } from '@/components/ui/summary-cards';
import { getDriverMobileColumns, type DriverMobileRow } from './columns';

async function fetchMobiles(): Promise<DriverMobileRow[]> {
  const res = await fetch('/api/admin/driver-mobiles');
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.error || 'Failed to fetch tracking mobiles');
  return (result.data || []) as DriverMobileRow[];
}

/** Phones supplied to drivers — the "Tracking mobiles" tab of /tracking-devices. */
export function DriverMobilesPanel() {
  const cf = useCardFilters();
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
    if (isError) toast.error('Failed to load tracking mobiles');
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
      toast.error(e instanceof Error ? e.message : 'Failed to delete tracking mobile');
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

  return (
    <div className="space-y-6">
      {canManage && (
        <div className="flex justify-end">
          <button
            onClick={() => router.push('/driver-mobiles/new')}
            className="inline-flex h-[38px] items-center gap-2 rounded-lg bg-green-600 px-3 text-sm font-medium text-white transition-colors hover:bg-green-700"
          >
            <Plus className="h-4 w-4" /> Add Mobile
          </button>
        </div>
      )}

      {/* Two numbers matter here: who has a phone, and which phones are a problem. */}
      <SummaryCards>
        <SummaryCard label="All phones" value={total} hint={returned ? `${returned} returned` : undefined} {...cf.allCard()} />
        <SummaryCard label="With drivers" value={assigned} tone="good" {...cf.card('status', 'assigned')} />
        {issues > 0 && <SummaryCard label="Damaged / lost" value={issues} tone="danger" />}
      </SummaryCards>

      <DataTable
        columns={columns}
        columnFilters={cf.filters}
        onColumnFiltersChange={cf.setFilters}
        data={mobiles}
        entityName="tracking mobiles"
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
        title="Delete tracking mobile?"
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
        description="This permanently deletes the selected tracking mobiles. This action cannot be undone."
        confirmLabel="Delete Selected"
        onConfirm={confirmBulkDelete}
        loading={bulkDeleting}
        danger
      />
    </div>
  );
}
