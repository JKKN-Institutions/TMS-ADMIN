'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Upload, Route as RouteIcon, Navigation, Activity, Users, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { DataTable } from '@/components/ui/data-table';
import { RouteImportDialog } from './route-import-dialog';
import { getRouteColumns, type RouteRow } from './columns';

const outlineBtn =
  'inline-flex h-[38px] items-center gap-2 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50';

const RoutesPage = () => {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isImportOpen, setIsImportOpen] = useState(false);

  useEffect(() => {
    const userData = localStorage.getItem('adminUser');
    if (userData) setUser(JSON.parse(userData));
  }, []);

  useEffect(() => {
    fetchRoutes();
  }, []);

  // Single request: the API embeds route_stops (ids only) via a nested select,
  // and the table/stats need nothing else — no per-route stop fetches, no
  // driver/vehicle list downloads (the columns never render those).
  const fetchRoutes = async () => {
    try {
      setLoading(true);
      const routesResponse = await fetch('/api/admin/routes');
      const routesResult = await routesResponse.json();
      if (!routesResult.success) throw new Error(routesResult.error || 'Failed to fetch routes');

      const routesData: RouteRow[] = (routesResult.data || []).map((route: any) => ({
        ...route,
        route_stops: route.route_stops || [],
        total_capacity: route.total_capacity || route.capacity || 0,
        _learnerCount: route._learnerCount ?? 0,
        _staffCount: route._staffCount ?? 0,
      }));

      setRoutes(routesData);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error occurred';
      toast.error(`Failed to load routes: ${message}`);
      setRoutes([]);
    } finally {
      setLoading(false);
    }
  };

  // Deletes go through the service-role API (with a tms.routes.delete permission
  // check) — the old DatabaseService path used the anon key and was silently
  // filtered by RLS, so routes appeared to delete but never actually did.
  const deleteRouteById = async (id: string): Promise<{ ok: boolean; message?: string; error?: string }> => {
    const res = await fetch(`/api/admin/routes/${id}`, { method: 'DELETE' });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok && !!body.success, message: body.message, error: body.error };
  };

  const handleDeleteRoute = async (route: RouteRow) => {
    if (
      !confirm(
        `Are you sure you want to delete route ${route.route_number}?\n\nThis cannot be undone and will also delete all associated stops.`
      )
    )
      return;
    try {
      const result = await deleteRouteById(route.id);
      if (!result.ok) throw new Error(result.error || 'Failed to delete route');
      toast.success(result.message || 'Route deleted');
      await fetchRoutes();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete route');
    }
  };

  const handleBulkDeleteRoutes = async (rows: RouteRow[], reset: () => void) => {
    if (
      !confirm(
        `Delete ${rows.length} route(s)?\n\nThis cannot be undone and will also delete all associated stops.`
      )
    )
      return;
    try {
      const results = await Promise.all(rows.map((r) => deleteRouteById(r.id)));
      const failed = results.filter((r) => !r.ok);
      reset();
      await fetchRoutes();
      if (failed.length === 0) {
        toast.success(`Deleted ${rows.length} route(s)`);
      } else {
        const succeeded = rows.length - failed.length;
        toast.error(
          `Deleted ${succeeded}/${rows.length}. ${failed.length} could not be deleted` +
            (failed[0]?.error ? `: ${failed[0].error}` : '')
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete selected routes');
      await fetchRoutes();
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

  const total = routes.length;
  const active = routes.filter((r) => r.status === 'active').length;
  // tms_route.total_capacity is stale (0 for all routes); the meaningful figure
  // is assigned passengers — learners + staff — summed from the per-route counts
  // the list API now returns.
  const totalPassengers = routes.reduce((s, r) => s + (r._learnerCount || 0) + (r._staffCount || 0), 0);
  const gpsEnabled = routes.filter((r) => r.start_latitude && r.start_longitude).length;
  const stats = [
    { label: 'Total Routes', value: total, icon: RouteIcon },
    { label: 'Active', value: active, icon: Activity },
    { label: 'Passengers', value: totalPassengers, icon: Users },
    { label: 'GPS Enabled', value: gpsEnabled, icon: Navigation },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Routes</h1>
          <p className="text-gray-600">
            Transportation routes and their stops. Live vehicle tracking is on the{' '}
            <button onClick={() => router.push('/track-all')} className="font-medium text-green-600 hover:underline">
              Track All
            </button>{' '}
            page.
          </p>
        </div>
        {canManage && (
          <div className="flex shrink-0 items-center gap-2">
            <button onClick={() => setIsImportOpen(true)} className={outlineBtn}>
              <Upload className="h-4 w-4" /> Import Routes
            </button>
            {/* Add Route is an in-module page (no popup), matching the drivers module. */}
            <button
              onClick={() => router.push('/routes/new')}
              className="inline-flex h-[38px] items-center gap-2 rounded-lg bg-green-600 px-3 text-sm font-medium text-white transition-colors hover:bg-green-700"
            >
              <Plus className="h-4 w-4" /> Add Route
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <s.icon className="h-4 w-4 text-gray-400" />
              {s.label}
            </div>
            <p className="mt-1 text-2xl font-bold text-gray-900">{s.value}</p>
          </div>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={routes}
        entityName="routes"
        isLoading={loading}
        searchPlaceholder="Search route #, name, location..."
        enableRowSelection={canManage}
        getRowId={(r) => r.id}
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

      <RouteImportDialog open={isImportOpen} onOpenChange={setIsImportOpen} onImported={fetchRoutes} />
    </div>
  );
};

export default RoutesPage;
