'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, CalendarRange, CheckCircle, Star } from 'lucide-react';
import toast from 'react-hot-toast';
import { DataTable } from '@/components/ui/data-table';
import UniversalStatCard from '@/components/universal-stat-card';
import { getTransportYearColumns, type TransportYearRow } from './columns';

export default function TransportYearsPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ role?: string } | null>(null);
  const [years, setYears] = useState<TransportYearRow[]>([]);
  const [loading, setLoading] = useState(true);

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

  const handleDelete = async (year: TransportYearRow) => {
    if (!confirm(`Delete transport year "${year.name}"?`)) return;
    try {
      const res = await fetch(`/api/admin/transport-years?id=${year.id}`, { method: 'DELETE' });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Failed to delete');
      toast.success('Transport year deleted');
      await fetchYears();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete transport year');
    }
  };

  const handleBulkDelete = async (rows: TransportYearRow[], reset: () => void) => {
    if (!confirm(`Delete ${rows.length} transport year(s)?\n\nThis cannot be undone.`)) return;
    try {
      await Promise.all(
        rows.map((r) => fetch(`/api/admin/transport-years?id=${r.id}`, { method: 'DELETE' }))
      );
      toast.success(`Deleted ${rows.length} transport year(s)`);
      reset();
      await fetchYears();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete selected');
      await fetchYears();
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
              onClick={() => handleBulkDelete(selectedRows, resetSelection)}
              className="inline-flex h-[38px] items-center gap-2 rounded-lg bg-red-600 px-3 text-sm font-medium text-white transition-colors hover:bg-red-700"
            >
              Delete Selected ({selectedRows.length})
            </button>
          ) : null
        }
      />
    </div>
  );
}
