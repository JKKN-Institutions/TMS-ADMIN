'use client';

import { use } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { DetailPageHeader } from '@/components/ui/detail-view';
import VehicleForm from '../../vehicle-form';
import type { VehicleRow } from '../../columns';

async function fetchVehicle(id: string): Promise<VehicleRow> {
  const res = await fetch(`/api/admin/vehicles/${id}`);
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load vehicle');
  return json.data as VehicleRow;
}

const crumbs = (label: string, vehicleId: string) => [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Vehicles', href: '/vehicles' },
  { label, href: `/vehicles/${vehicleId}` },
  { label: 'Edit' },
];

export default function VehicleEditPage({ params }: { params: Promise<{ vehicleId: string }> }) {
  const { vehicleId } = use(params);
  const {
    data: vehicle,
    isLoading: loading,
    isError,
  } = useQuery({ queryKey: ['vehicle', vehicleId], queryFn: () => fetchVehicle(vehicleId), enabled: !!vehicleId });
  const error = isError ? 'Failed to load vehicle' : null;

  if (loading) {
    return (
      <div className="space-y-6">
        <DetailPageHeader crumbs={crumbs('Loading…', vehicleId)} backHref={`/vehicles/${vehicleId}`} title="Edit Vehicle" />
        <div className="h-40 animate-pulse rounded-xl border border-gray-200 bg-white" />
      </div>
    );
  }

  if (error || !vehicle) {
    return (
      <div className="space-y-6">
        <DetailPageHeader crumbs={crumbs('Not found', vehicleId)} backHref="/vehicles" title="Vehicle not found" />
        <p className="text-gray-600">
          This vehicle could not be loaded.{' '}
          <Link href="/vehicles" className="text-green-700 hover:underline">
            Back to vehicles
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DetailPageHeader
        crumbs={crumbs(vehicle.registration_number, vehicleId)}
        backHref={`/vehicles/${vehicleId}`}
        title={`Edit Vehicle — ${vehicle.registration_number}`}
        subtitle="Update vehicle details and tracking"
      />
      <VehicleForm mode="edit" vehicleId={vehicleId} initial={vehicle} />
    </div>
  );
}
