'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Upload, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { DataTable } from '@/components/ui/data-table';
import { PageHeader } from '@/components/ui/page-header';
import { SummaryCard, SummaryCards, useCardFilters } from '@/components/ui/summary-cards';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import LiveGPSTrackingModal from '@/components/live-gps-tracking-modal';
import { docsState, getVehicleColumns, type VehicleRow } from './columns';
import { VehicleImportDialog } from './vehicle-import-dialog';
import { exportVehicles } from './vehicle-export';

async function fetchVehicles(): Promise<VehicleRow[]> {
  const response = await fetch('/api/admin/vehicles');
  const result = await response.json();
  if (!response.ok || !result.success)
    throw new Error(result.error || 'Failed to fetch vehicles');
  return (result.data || []) as VehicleRow[];
}

const VehiclesPage = () => {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [isTrackingModalOpen, setIsTrackingModalOpen] = useState(false);
  const [trackingVehicle, setTrackingVehicle] = useState<any>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ rows: VehicleRow[]; reset?: () => void } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [filteredRows, setFilteredRows] = useState<VehicleRow[] | null>(null);
  const onFilteredRowsChange = useCallback((rows: VehicleRow[], isFiltered: boolean) => {
    setFilteredRows(isFiltered ? rows : null);
  }, []);
  const cf = useCardFilters();

  useEffect(() => {
    const userData = localStorage.getItem('adminUser');
    if (userData) setUser(JSON.parse(userData));
  }, []);

  // Cached via React Query: revisiting Vehicles now serves instantly from cache
  // and revalidates in the background instead of re-fetching the whole list on
  // every mount. refetch() replaces the old manual reload after mutations.
  const {
    data: vehicles = [],
    isLoading: loading,
    isError,
    refetch,
  } = useQuery({ queryKey: ['vehicles'], queryFn: fetchVehicles });

  useEffect(() => {
    if (isError) toast.error('Failed to load vehicles');
  }, [isError]);

  // Route filter: every route a bus serves today, in route-number order.
  const routeOptions = useMemo(() => {
    const nums = new Set<string>();
    for (const v of vehicles as VehicleRow[]) for (const r of v._routes ?? []) if (r.number) nums.add(r.number);
    return [
      ...[...nums]
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        .map((n) => ({ label: `Route ${n}`, value: n })),
      { label: 'No route', value: 'none' },
    ];
  }, [vehicles]);

  // Single and bulk delete share one confirmation dialog (was window.confirm).
  const handleDeleteVehicle = (vehicle: VehicleRow) => setDeleteTarget({ rows: [vehicle] });
  const handleBulkDeleteVehicles = (rows: VehicleRow[], reset: () => void) => setDeleteTarget({ rows, reset });

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { rows, reset } = deleteTarget;
    setDeleting(true);
    try {
      const results = await Promise.all(
        rows.map((r) => fetch(`/api/admin/vehicles?id=${r.id}`, { method: 'DELETE' }).then((res) => res.ok))
      );
      const failed = results.filter((ok) => !ok).length;
      if (failed) toast.error(`${failed} of ${rows.length} vehicle(s) could not be deleted`);
      else toast.success(rows.length === 1 ? 'Vehicle deleted' : `Deleted ${rows.length} vehicles`);
      reset?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete vehicle');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
      await refetch();
    }
  };

  // View/Edit/Create are now in-module pages (no popups).
  const handleViewVehicle = (vehicle: VehicleRow) => router.push(`/vehicles/${vehicle.id}`);
  const handleEditVehicle = (vehicle: VehicleRow) => router.push(`/vehicles/${vehicle.id}/edit`);

  // Live tracking still uses the GPS modal (keyed on the vehicle's assigned route).
  const handleTrackVehicle = async (vehicle: VehicleRow) => {
    try {
      const response = await fetch('/api/admin/routes');
      const result = await response.json();
      if (!result.success) {
        toast.error('Failed to fetch route information');
        return;
      }
      const routes = result.data || [];
      const assignedRoute = routes.find((route: any) => route.vehicle_id === vehicle.id);
      if (assignedRoute) {
        setTrackingVehicle({ ...vehicle, routes: assignedRoute });
        setIsTrackingModalOpen(true);
      } else {
        toast.error('Vehicle must be assigned to a route for live tracking');
      }
    } catch (error) {
      toast.error('Failed to start tracking');
    }
  };

  const userRole = user?.role;
  const canManage = ['super_admin', 'transport_manager'].includes(userRole);
  const canDelete = userRole === 'super_admin';

  const columns = useMemo(
    () =>
      getVehicleColumns(
        handleViewVehicle,
        handleEditVehicle,
        handleDeleteVehicle,
        handleTrackVehicle,
        canManage,
        canDelete
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canManage, canDelete, router]
  );

  // Cards name what needs attention; each filters the table.
  const totalVehicles = vehicles.length;
  const activeVehicles = vehicles.filter((v) => v.status === 'active').length;
  const inMaintenance = vehicles.filter((v) => v.status === 'maintenance').length;
  const docsExpired = vehicles.filter((v) => docsState(v) === 'expired').length;
  const docsSoon = vehicles.filter((v) => docsState(v) === 'soon').length;

  return (
    <div className="space-y-6">
      <PageHeader
        description="The fleet, its documents and service status."
        actions={
          canManage && (
            <>
              <button
                onClick={() => setIsImportOpen(true)}
                className="inline-flex h-[38px] items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                <Upload className="h-4 w-4" /> Import
              </button>
              <button
                onClick={() => router.push('/vehicles/new')}
                className="inline-flex h-[38px] items-center gap-2 rounded-lg bg-green-600 px-3 text-sm font-medium text-white transition-colors hover:bg-green-700"
              >
                <Plus className="h-4 w-4" /> Add Vehicle
              </button>
            </>
          )
        }
      />

      <SummaryCards>
        <SummaryCard label="All vehicles" value={totalVehicles} {...cf.allCard()} />
        <SummaryCard label="Active" value={activeVehicles} tone="good" {...cf.card('status', 'active')} />
        <SummaryCard label="In maintenance" value={inMaintenance} tone={inMaintenance ? 'warn' : 'neutral'} {...cf.card('status', 'maintenance')} />
        <SummaryCard
          label="Documents expired"
          value={docsExpired}
          tone={docsExpired ? 'danger' : 'neutral'}
          title="Insurance, fitness, permit, pollution or road tax past its expiry date"
          {...cf.card('documents', 'expired')}
        />
        <SummaryCard
          label="Due in 60 days"
          value={docsSoon}
          tone={docsSoon ? 'warn' : 'neutral'}
          title="A document expires within the next 60 days"
          {...cf.card('documents', 'soon')}
        />
      </SummaryCards>

      {/* Data table */}
      <DataTable
        columns={columns}
        data={vehicles}
        entityName="vehicles"
        isLoading={loading}
        searchPlaceholder="Search registration #, model..."
        enableRowSelection={canManage}
        getRowId={(v) => v.id}
        columnFilters={cf.filters}
        onColumnFiltersChange={cf.setFilters}
        onFilteredRowsChange={onFilteredRowsChange}
        // Next Maintenance is empty for the whole fleet today; the two expiry
        // columns are summarised by Documents. All stay in the Columns menu.
        initialColumnVisibility={{ next_maintenance: false, insurance_expiry: false, fitness_expiry: false, mileage: false }}
        filters={[
          { columnId: 'route', title: 'Route', options: routeOptions },
          {
            columnId: 'documents',
            title: 'Documents',
            options: [
              { label: 'Expired', value: 'expired' },
              { label: 'Due in 60 days', value: 'soon' },
              { label: 'Not on file', value: 'missing' },
              { label: 'All valid', value: 'ok' },
            ],
          },
          {
            columnId: 'status',
            title: 'Status',
            options: [
              { label: 'Active', value: 'active' },
              { label: 'Maintenance', value: 'maintenance' },
              { label: 'Retired', value: 'retired' },
            ],
          },
          {
            columnId: 'fuel_type',
            title: 'Fuel',
            options: [
              { label: 'Diesel', value: 'diesel' },
              { label: 'Petrol', value: 'petrol' },
              { label: 'Electric', value: 'electric' },
              { label: 'CNG', value: 'cng' },
            ],
          },
          {
            columnId: 'vehicle_type',
            title: 'Type',
            options: [
              { label: 'Bus', value: 'bus' },
              { label: 'Van', value: 'van' },
              { label: 'Car', value: 'car' },
              { label: 'Truck', value: 'truck' },
              { label: 'Ambulance', value: 'ambulance' },
              { label: 'Other', value: 'other' },
            ],
          },
        ]}
        toolbarActions={({ selectedRows, resetSelection }) => (
          <>
            {/* Exports the selection, else what the filters show, else the fleet.
                Same columns as the import template, so it round-trips. */}
            <button
              type="button"
              onClick={() => exportVehicles(selectedRows.length ? selectedRows : filteredRows ?? vehicles)}
              disabled={vehicles.length === 0}
              className="inline-flex h-[38px] items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              <Download className="h-4 w-4" /> {selectedRows.length ? `Export (${selectedRows.length})` : 'Export'}
            </button>
            {canDelete && selectedRows.length > 0 && (
              <button
                type="button"
                onClick={() => handleBulkDeleteVehicles(selectedRows, resetSelection)}
                className="inline-flex h-[38px] items-center gap-2 rounded-lg bg-red-600 px-3 text-sm font-medium text-white transition-colors hover:bg-red-700"
              >
                <Trash2 className="h-4 w-4" /> Delete Selected ({selectedRows.length})
              </button>
            )}
          </>
        )}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && !deleting && setDeleteTarget(null)}
        title={deleteTarget?.rows.length === 1 ? `Delete vehicle ${deleteTarget.rows[0].registration_number}?` : `Delete ${deleteTarget?.rows.length ?? 0} vehicles?`}
        description="This cannot be undone. Routes that use these vehicles will show no bus."
        confirmLabel="Delete"
        danger
        loading={deleting}
        onConfirm={confirmDelete}
      />

      {/* Bulk upload dialog (creates new vehicles + updates existing, by reg number) */}
      <VehicleImportDialog open={isImportOpen} onOpenChange={setIsImportOpen} onImported={() => refetch()} />

      {/* Live GPS Tracking Modal */}
      {isTrackingModalOpen && trackingVehicle?.routes && (
        <LiveGPSTrackingModal
          isOpen={isTrackingModalOpen}
          onClose={() => {
            setIsTrackingModalOpen(false);
            setTrackingVehicle(null);
          }}
          route={trackingVehicle.routes}
          title={`Live Tracking - ${trackingVehicle.registration_number}`}
        />
      )}
    </div>
  );
};

export default VehiclesPage;
