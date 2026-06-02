'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Car, CheckCircle, Wrench, AlertTriangle, Trash2, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { DataTable } from '@/components/ui/data-table';
import UniversalStatCard from '@/components/universal-stat-card';
import { createVehicleStats } from '@/lib/stat-utils';
import LiveGPSTrackingModal from '@/components/live-gps-tracking-modal';
import { getVehicleColumns, type VehicleRow } from './columns';
import { VehicleImportDialog } from './vehicle-import-dialog';

const VehiclesPage = () => {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isTrackingModalOpen, setIsTrackingModalOpen] = useState(false);
  const [trackingVehicle, setTrackingVehicle] = useState<any>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);

  useEffect(() => {
    const userData = localStorage.getItem('adminUser');
    if (userData) setUser(JSON.parse(userData));
  }, []);

  useEffect(() => {
    fetchVehicles();
  }, []);

  const fetchVehicles = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/vehicles');
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Failed to fetch vehicles');
      setVehicles(result.data || []);
    } catch (error) {
      console.error('Error fetching vehicles:', error);
      toast.error('Failed to load vehicles');
      setVehicles([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteVehicle = async (vehicle: VehicleRow) => {
    if (!confirm(`Are you sure you want to delete vehicle ${vehicle.registration_number}?`)) return;
    try {
      const res = await fetch(`/api/admin/vehicles?id=${vehicle.id}`, { method: 'DELETE' });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Failed to delete vehicle');
      toast.success('Vehicle deleted');
      await fetchVehicles();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete vehicle');
    }
  };

  const handleBulkDeleteVehicles = async (rows: VehicleRow[], reset: () => void) => {
    if (!confirm(`Delete ${rows.length} vehicle(s)?\n\nThis cannot be undone.`)) return;
    try {
      await Promise.all(rows.map((r) => fetch(`/api/admin/vehicles?id=${r.id}`, { method: 'DELETE' })));
      toast.success(`Deleted ${rows.length} vehicle(s)`);
      reset();
      await fetchVehicles();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete selected vehicles');
      await fetchVehicles();
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

  // Stats
  const totalVehicles = vehicles.length;
  const activeVehicles = vehicles.filter((v) => v.status === 'active').length;
  const maintenanceVehicles = vehicles.filter((v) => v.status === 'maintenance').length;
  const maintenanceDue = vehicles.filter(
    (v) => v.next_maintenance && new Date(v.next_maintenance) <= new Date()
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Vehicles Management</h1>
          <p className="text-gray-600">Manage vehicle fleet and maintenance</p>
        </div>
        {canManage && (
          <div className="flex shrink-0 items-center gap-2">
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
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
        {createVehicleStats({
          totalVehicles,
          activeVehicles,
          maintenanceVehicles,
          outOfService: maintenanceDue,
        }).map((stat, index) => (
          <UniversalStatCard
            key={stat.title}
            title={stat.title}
            value={stat.value}
            subtitle={stat.subtitle}
            icon={index === 0 ? Car : index === 1 ? CheckCircle : index === 2 ? Wrench : AlertTriangle}
            trend={stat.trend}
            color={stat.color}
            variant="default"
            loading={loading}
            delay={index}
          />
        ))}
      </div>

      {/* Data table */}
      <DataTable
        columns={columns}
        data={vehicles}
        entityName="vehicles"
        isLoading={loading}
        searchPlaceholder="Search registration #, model..."
        enableRowSelection={canManage}
        getRowId={(v) => v.id}
        filters={[
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
        ]}
        toolbarActions={({ selectedRows, resetSelection }) =>
          canDelete && selectedRows.length > 0 ? (
            <button
              type="button"
              onClick={() => handleBulkDeleteVehicles(selectedRows, resetSelection)}
              className="inline-flex h-[38px] items-center gap-2 rounded-lg bg-red-600 px-3 text-sm font-medium text-white transition-colors hover:bg-red-700"
            >
              <Trash2 className="h-4 w-4" /> Delete Selected ({selectedRows.length})
            </button>
          ) : null
        }
      />

      {/* Bulk upload dialog (creates new vehicles + updates existing, by reg number) */}
      <VehicleImportDialog open={isImportOpen} onOpenChange={setIsImportOpen} onImported={fetchVehicles} />

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
