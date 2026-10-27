'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Plus, Upload, Trash2, BarChart3 } from 'lucide-react';
import toast from 'react-hot-toast';
import { DataTable } from '@/components/ui/data-table';
import { PageHeader } from '@/components/ui/page-header';
import { SummaryCard, SummaryCards, useCardFilters } from '@/components/ui/summary-cards';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { RouteImportDialog } from './route-import-dialog';
import { getRouteColumns, isBusReporting, routeBusState, routeRiders, type RouteRow } from './columns';

// Single request: the API embeds route_stops (ids only) via a nested select,
// and the table/stats need nothing else — no per-route stop fetches, no
// driver/vehicle list downloads (the columns never render those).
async function fetchRoutes(): Promise<RouteRow[]> {
  const res = await fetch('/api/admin/routes');
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.error || 'Failed to fetch routes');
  return (result.data || []).map((route: any) => ({
    ...route,
    route_stops: route.route_stops || [],
    total_capacity: route.total_capacity || route.capacity || 0,
    _learnerCount: route._learnerCount ?? 0,
    _staffCount: route._staffCount ?? 0,
  })) as RouteRow[];
}

const outlineBtn =
  'inline-flex h-[38px] items-center gap-2 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50';

const RoutesPage = () => {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ rows: RouteRow[]; reset?: () => void } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const cf = useCardFilters();

  useEffect(() => {
    const userData = localStorage.getItem('adminUser');
    if (userData) setUser(JSON.parse(userData));
  }, []);

  const {
    data: routes = [],
    isLoading: loading,
    isError,
    refetch,
  } = useQuery({ queryKey: ['routes'], queryFn: fetchRoutes });

  useEffect(() => {
    if (isError) toast.error('Failed to load routes');
  }, [isError]);

  // Deletes go through the service-role API (with a tms.routes.delete permission
  // check) — the old DatabaseService path used the anon key and was silently
  // filtered by RLS, so routes appeared to delete but never actually did.
  const deleteRouteById = async (id: string): Promise<{ ok: boolean; message?: string; error?: string }> => {
    const res = await fetch(`/api/admin/routes/${id}`, { method: 'DELETE' });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok && !!body.success, message: body.message, error: body.error };
  };

  // Single and bulk delete share one confirmation dialog (was window.confirm).
  const handleDeleteRoute = (route: RouteRow) => setDeleteTarget({ rows: [route] });
  const handleBulkDeleteRoutes = (rows: RouteRow[], reset: () => void) => setDeleteTarget({ rows, reset });

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { rows, reset } = deleteTarget;
    setDeleting(true);
    try {
      const results = await Promise.all(rows.map((r) => deleteRouteById(r.id)));
      const failed = results.filter((r) => !r.ok);
      reset?.();
      if (failed.length === 0) {
        toast.success(rows.length === 1 ? results[0].message || 'Route deleted' : `Deleted ${rows.length} routes`);
      } else {
        toast.error(
          `Deleted ${rows.length - failed.length}/${rows.length}. ${failed.length} could not be deleted` +
            (failed[0]?.error ? `: ${failed[0].error}` : '')
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete route');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
      await refetch();
    }
  };

  const userRole = user?.role;
  const canManage = ['super_admin', 'transport_manager'].includes(userRole);
  const canDelete = userRole === 'super_admin';

  const columns = useMemo(
    () =>
      getRouteColumns(
        // View/Edit are now in-module pages (no popups).
        (r) => router.push(`/routes/${r.id}`),
        (r) => router.push(`/routes/${r.id}/edit`),
        handleDeleteRoute,
        // Live tracking lives on the dedicated /track-all page (single source of truth).
        () => router.push('/track-all'),
        canManage,
        canDelete
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canManage, canDelete, router]
  );

  // Cards point at routes that can't run properly; each filters the table.
  const total = routes.length;
  const noBus = routes.filter((r) => routeBusState(r) !== 'ok').length;
  const noDriver = routes.filter((r) => !r._driverName).length;
  const overCapacity = routes.filter((r) => r._busCapacity && routeRiders(r) > r._busCapacity).length;
  const reporting = routes.filter((r) => isBusReporting(r)).length;
  const totalPassengers = routes.reduce((s, r) => s + routeRiders(r), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        description="Bus routes with their bus, driver, stops and riders."
        actions={
          <>
            {/* Analytics is read-only, so it is NOT behind canManage. */}
            <button onClick={() => router.push('/routes/analytics')} className={outlineBtn}>
              <BarChart3 className="h-4 w-4" /> Analytics
            </button>
            {canManage && (
              <button onClick={() => setIsImportOpen(true)} className={outlineBtn}>
                <Upload className="h-4 w-4" /> Import Routes
              </button>
            )}
            {canManage && (
              <button
                onClick={() => router.push('/routes/new')}
                className="inline-flex h-[38px] items-center gap-2 rounded-lg bg-green-600 px-3 text-sm font-medium text-white transition-colors hover:bg-green-700"
              >
                <Plus className="h-4 w-4" /> Add Route
              </button>
            )}
          </>
        }
      />

      <SummaryCards>
        <SummaryCard label="All routes" value={total} hint={`${totalPassengers.toLocaleString()} riders`} {...cf.allCard()} />
        <SummaryCard label="No bus" value={noBus} tone={noBus ? 'danger' : 'neutral'} title="No bus, or a bus that no longer exists" {...cf.card('bus', 'none')} />
        <SummaryCard label="No driver" value={noDriver} tone={noDriver ? 'warn' : 'neutral'} {...cf.card('driver', 'none')} />
        <SummaryCard label="Over capacity" value={overCapacity} tone={overCapacity ? 'danger' : 'neutral'} title="More riders allocated than the bus has seats" {...cf.card('occupancy', 'over')} />
        <SummaryCard
          label="Buses reporting"
          value={`${reporting} / ${total}`}
          tone={reporting ? 'good' : 'neutral'}
          hint="Open live tracking"
          title="Buses that sent a GPS position in the last 5 minutes"
          href="/track-all"
        />
      </SummaryCards>

      <DataTable
        columns={columns}
        data={routes}
        entityName="routes"
        isLoading={loading}
        searchPlaceholder="Search route #, name, location..."
        enableRowSelection={canManage}
        getRowId={(r) => r.id}
        columnFilters={cf.filters}
        onColumnFiltersChange={cf.setFilters}
        // Distance / travel time / fare are mostly blank; still in the Columns menu.
        initialColumnVisibility={{ journey: false, distance: false, duration: false, fare: false }}
        filters={[
          {
            columnId: 'status',
            title: 'Status',
            options: [
              { label: 'Active', value: 'active' },
              { label: 'Maintenance', value: 'maintenance' },
              { label: 'Inactive', value: 'inactive' },
            ],
          },
        ]}
        toolbarActions={({ selectedRows, resetSelection }) =>
          canDelete && selectedRows.length > 0 ? (
            <button
              type="button"
              onClick={() => handleBulkDeleteRoutes(selectedRows, resetSelection)}
              className="inline-flex h-[38px] items-center gap-2 rounded-lg bg-red-600 px-3 text-sm font-medium text-white transition-colors hover:bg-red-700"
            >
              <Trash2 className="h-4 w-4" /> Delete Selected ({selectedRows.length})
            </button>
          ) : null
        }
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && !deleting && setDeleteTarget(null)}
        title={deleteTarget?.rows.length === 1 ? `Delete route ${deleteTarget.rows[0].route_number}?` : `Delete ${deleteTarget?.rows.length ?? 0} routes?`}
        description="This cannot be undone and also deletes the route's stops."
        confirmLabel="Delete"
        danger
        loading={deleting}
        onConfirm={confirmDelete}
      />

      <RouteImportDialog open={isImportOpen} onOpenChange={setIsImportOpen} onImported={() => refetch()} />
    </div>
  );
};

export default RoutesPage;
