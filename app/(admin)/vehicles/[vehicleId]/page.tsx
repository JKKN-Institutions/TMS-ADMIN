'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { Navigation, Pencil } from 'lucide-react';
import { DetailPageHeader, SectionCard, Field } from '@/components/ui/detail-view';
import type { VehicleRow } from '../columns';

interface VehicleDetail extends VehicleRow {
  purchase_date?: string | null;
  chassis_number?: string | null;
  engine_number?: string | null;
  created_at?: string;
  updated_at?: string;
}

const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString() : '—');

async function fetchVehicle(id: string): Promise<VehicleDetail> {
  const res = await fetch(`/api/admin/vehicles/${id}`);
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load vehicle');
  return json.data as VehicleDetail;
}

function StatusBadge({ status }: { status?: string }) {
  const map: Record<string, string> = {
    active: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
    maintenance: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-400',
    retired: 'bg-gray-200 text-gray-600 dark:bg-gray-500/20 dark:text-gray-300',
  };
  const cls = map[status ?? ''] ?? 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${cls}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {status ?? 'unknown'}
    </span>
  );
}

const crumbs = (label: string) => [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Vehicles', href: '/vehicles' },
  { label },
];

export default function VehicleViewPage({ params }: { params: Promise<{ vehicleId: string }> }) {
  const { vehicleId } = use(params);
  const [vehicle, setVehicle] = useState<VehicleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchVehicle(vehicleId)
      .then((v) => active && setVehicle(v))
      .catch((e) => active && setError(e instanceof Error ? e.message : 'Failed to load vehicle'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [vehicleId]);

  if (loading) {
    return (
      <div className="space-y-6">
        <DetailPageHeader crumbs={crumbs('Loading…')} backHref="/vehicles" title="Loading…" />
        <div className="h-40 animate-pulse rounded-xl border border-gray-200 bg-white" />
      </div>
    );
  }

  if (error || !vehicle) {
    return (
      <div className="space-y-6">
        <DetailPageHeader crumbs={crumbs('Not found')} backHref="/vehicles" title="Vehicle not found" />
        <p className="text-gray-600">
          This vehicle could not be loaded.{' '}
          <Link href="/vehicles" className="text-green-700 hover:underline">
            Back to vehicles
          </Link>
        </p>
      </div>
    );
  }

  const canTrack = !!(vehicle.gps_device_id && vehicle.live_tracking_enabled);

  return (
    <div className="space-y-6">
      <DetailPageHeader
        crumbs={crumbs(vehicle.registration_number)}
        backHref="/vehicles"
        title={vehicle.registration_number}
        subtitle={vehicle.model}
        actions={
          <>
            <StatusBadge status={vehicle.status} />
            {canTrack && (
              <Link
                href="/track-all"
                className="inline-flex h-[38px] items-center gap-2 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                <Navigation className="h-4 w-4" /> Live track
              </Link>
            )}
            <Link
              href={`/vehicles/${vehicle.id}/edit`}
              className="inline-flex h-[38px] items-center gap-2 rounded-lg bg-green-600 px-3 text-sm font-medium text-white transition-colors hover:bg-green-700"
            >
              <Pencil className="h-4 w-4" /> Edit
            </Link>
          </>
        }
      />

      <SectionCard title="Vehicle information">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Registration No." value={vehicle.registration_number} />
          <Field label="Model" value={vehicle.model} />
          <Field label="Capacity" value={vehicle.capacity != null ? `${vehicle.capacity} passengers` : ''} />
          <Field label="Fuel Type" value={vehicle.fuel_type ? vehicle.fuel_type.toUpperCase() : ''} />
          <Field label="Mileage" value={vehicle.mileage && Number(vehicle.mileage) > 0 ? `${vehicle.mileage} km/l` : ''} />
          <Field label="Status" value={<StatusBadge status={vehicle.status} />} />
        </div>
      </SectionCard>

      <SectionCard title="Maintenance & compliance">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Last Maintenance" value={fmtDate(vehicle.last_maintenance)} />
          <Field label="Next Maintenance" value={fmtDate(vehicle.next_maintenance)} />
          <Field label="Insurance Expiry" value={fmtDate(vehicle.insurance_expiry)} />
          <Field label="Fitness Expiry" value={fmtDate(vehicle.fitness_expiry)} />
        </div>
      </SectionCard>

      <SectionCard title="Additional details">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Purchase Date" value={fmtDate(vehicle.purchase_date)} />
          <Field label="Chassis Number" value={vehicle.chassis_number} />
          <Field label="Engine Number" value={vehicle.engine_number} />
          <Field label="GPS Device" value={vehicle.gps_device_id} />
          <Field label="Live Tracking" value={vehicle.live_tracking_enabled ? 'Enabled' : 'Disabled'} />
        </div>
      </SectionCard>

      {(vehicle.created_at || vehicle.updated_at) && (
        <SectionCard title="Record">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Created" value={fmtDate(vehicle.created_at)} />
            <Field label="Last Updated" value={fmtDate(vehicle.updated_at)} />
          </div>
        </SectionCard>
      )}
    </div>
  );
}
