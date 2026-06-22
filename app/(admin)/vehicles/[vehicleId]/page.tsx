'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { Navigation, Pencil } from 'lucide-react';
import { DetailPageHeader, SectionCard, Field } from '@/components/ui/detail-view';
import type { VehicleRow } from '../columns';

type VehicleDetail = VehicleRow & {
  created_at?: string;
  updated_at?: string;
};

const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString() : '—');

function DocLink({ label, path }: { label: string; path?: string | null }) {
  const open = async () => {
    if (!path) return;
    try {
      const res = await fetch(`/api/admin/vehicles/documents?path=${encodeURIComponent(path)}`);
      const json = await res.json();
      if (res.ok && json.success) window.open(json.url as string, '_blank', 'noopener');
    } catch { /* ignore */ }
  };
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      {path ? (
        <button type="button" onClick={open} className="text-sm text-green-700 hover:underline">View document</button>
      ) : (
        <div className="text-sm text-gray-400">—</div>
      )}
    </div>
  );
}

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

      <SectionCard title="Identity">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Registration No." value={vehicle.registration_number} />
          <Field label="Type" value={vehicle.vehicle_type ? vehicle.vehicle_type : ''} />
          <Field label="Manufacturer" value={vehicle.manufacturer} />
          <Field label="Model" value={vehicle.model} />
          <Field label="Model Year" value={vehicle.model_year != null ? String(vehicle.model_year) : ''} />
          <Field label="Color" value={vehicle.color} />
          <Field label="Capacity" value={vehicle.capacity != null ? `${vehicle.capacity} passengers` : ''} />
          <Field label="Gross Vehicle Weight" value={vehicle.gross_vehicle_weight ? `${vehicle.gross_vehicle_weight} kg` : ''} />
          <Field label="Fuel Type" value={vehicle.fuel_type ? vehicle.fuel_type.toUpperCase() : ''} />
          <Field label="Mileage" value={vehicle.mileage && Number(vehicle.mileage) > 0 ? `${vehicle.mileage} km/l` : ''} />
          <Field label="Status" value={<StatusBadge status={vehicle.status} />} />
        </div>
      </SectionCard>

      <SectionCard title="Ownership & purchase">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Ownership" value={vehicle.ownership_type} />
          <Field label="Purchase Date" value={fmtDate(vehicle.purchase_date)} />
          <Field label="Purchase Cost" value={vehicle.purchase_cost} />
          <Field label="Vendor" value={vehicle.vendor_name} />
          <Field label="Warranty Expiry" value={fmtDate(vehicle.warranty_expiry)} />
        </div>
      </SectionCard>

      <SectionCard title="Compliance & legal">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="RC Expiry" value={fmtDate(vehicle.rc_expiry_date)} />
          <Field label="Permit Number" value={vehicle.permit_number} />
          <Field label="Permit Expiry" value={fmtDate(vehicle.permit_expiry_date)} />
          <Field label="Pollution Cert. No." value={vehicle.pollution_certificate_number} />
          <Field label="Pollution Expiry" value={fmtDate(vehicle.pollution_expiry_date)} />
          <Field label="Road Tax Expiry" value={fmtDate(vehicle.road_tax_expiry_date)} />
          <Field label="Fitness Expiry" value={fmtDate(vehicle.fitness_expiry)} />
        </div>
      </SectionCard>

      <SectionCard title="Insurance">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Provider" value={vehicle.insurance_provider} />
          <Field label="Policy Number" value={vehicle.insurance_policy_number} />
          <Field label="Insurance Expiry" value={fmtDate(vehicle.insurance_expiry)} />
          <Field label="Insured Amount" value={vehicle.insurance_amount} />
        </div>
      </SectionCard>

      <SectionCard title="Driver assignment">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Assigned Driver" value={vehicle.assigned_driver_name} />
          <Field label="Assignment Date" value={fmtDate(vehicle.assignment_date)} />
        </div>
      </SectionCard>

      <SectionCard title="GPS & tracking">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="GPS Device" value={vehicle.gps_device_id} />
          <Field label="GPS Provider" value={vehicle.gps_provider} />
          <Field label="SIM Number" value={vehicle.sim_number} />
          <Field label="Live Tracking" value={vehicle.live_tracking_enabled ? 'Enabled' : 'Disabled'} />
        </div>
      </SectionCard>

      <SectionCard title="Maintenance">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Last Maintenance" value={fmtDate(vehicle.last_maintenance)} />
          <Field label="Next Maintenance" value={fmtDate(vehicle.next_maintenance)} />
          <Field label="Current Odometer" value={vehicle.current_odometer} />
          <Field label="Service Interval (km)" value={vehicle.maintenance_interval_km} />
          <Field label="Service Interval (days)" value={vehicle.maintenance_interval_days != null ? String(vehicle.maintenance_interval_days) : ''} />
          <Field label="Last Service Odometer" value={vehicle.last_service_odometer} />
          <Field label="Next Service Odometer" value={vehicle.next_service_odometer} />
          <Field label="Service Vendor" value={vehicle.service_vendor} />
        </div>
      </SectionCard>

      <SectionCard title="Financial">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Monthly EMI" value={vehicle.monthly_emi} />
          <Field label="Fuel Card Number" value={vehicle.fuel_card_number} />
          <Field label="Operating Cost / km" value={vehicle.operating_cost_per_km} />
        </div>
      </SectionCard>

      <SectionCard title="Emergency">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Contact Name" value={vehicle.emergency_contact_name} />
          <Field label="Contact Phone" value={vehicle.emergency_contact_phone} />
          <Field label="First-aid Kit" value={vehicle.first_aid_available ? 'Available' : 'No'} />
          <Field label="Fire Extinguisher Expiry" value={fmtDate(vehicle.fire_extinguisher_expiry)} />
        </div>
      </SectionCard>

      <SectionCard title="Documents">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <DocLink label="RC Document" path={vehicle.rc_document_url} />
          <DocLink label="Insurance Document" path={vehicle.insurance_document_url} />
          <DocLink label="Fitness Certificate" path={vehicle.fitness_certificate_url} />
          <DocLink label="Permit Document" path={vehicle.permit_document_url} />
        </div>
      </SectionCard>

      <SectionCard title="Identifiers & notes">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Chassis Number" value={vehicle.chassis_number} />
          <Field label="Engine Number" value={vehicle.engine_number} />
        </div>
        {vehicle.remarks && <p className="mt-4 whitespace-pre-wrap text-sm text-gray-700">{vehicle.remarks}</p>}
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
