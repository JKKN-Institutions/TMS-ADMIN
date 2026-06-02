'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { SectionCard } from '@/components/ui/detail-view';
import { SelectMenu, type SelectMenuOption } from '@/components/ui/select-menu';
import type { VehicleRow } from './columns';

interface GpsDevice {
  id: string;
  device_name?: string;
  device_id?: string;
  status?: string;
}

interface VehicleFormState {
  registration_number: string;
  model: string;
  capacity: string;
  fuel_type: string;
  status: string;
  mileage: string;
  insurance_expiry: string;
  fitness_expiry: string;
  last_maintenance: string;
  next_maintenance: string;
  purchase_date: string;
  chassis_number: string;
  engine_number: string;
  gps_device_id: string;
  live_tracking_enabled: boolean;
}

const EMPTY: VehicleFormState = {
  registration_number: '',
  model: '',
  capacity: '',
  fuel_type: 'diesel',
  status: 'active',
  mileage: '',
  insurance_expiry: '',
  fitness_expiry: '',
  last_maintenance: '',
  next_maintenance: '',
  purchase_date: '',
  chassis_number: '',
  engine_number: '',
  gps_device_id: '',
  live_tracking_enabled: false,
};

// 'YYYY-MM-DDTHH:MM:SSZ' | 'YYYY-MM-DD' → 'YYYY-MM-DD' for <input type="date">.
const toDateInput = (d?: string | null) => (d ? String(d).split('T')[0] : '');

function fromVehicle(v: VehicleRow): VehicleFormState {
  return {
    registration_number: v.registration_number ?? '',
    model: v.model ?? '',
    capacity: v.capacity != null ? String(v.capacity) : '',
    fuel_type: v.fuel_type ?? 'diesel',
    status: v.status ?? 'active',
    mileage: v.mileage != null ? String(v.mileage) : '',
    insurance_expiry: toDateInput(v.insurance_expiry),
    fitness_expiry: toDateInput(v.fitness_expiry),
    last_maintenance: toDateInput(v.last_maintenance),
    next_maintenance: toDateInput(v.next_maintenance),
    purchase_date: toDateInput((v as { purchase_date?: string | null }).purchase_date),
    chassis_number: (v as { chassis_number?: string | null }).chassis_number ?? '',
    engine_number: (v as { engine_number?: string | null }).engine_number ?? '',
    gps_device_id: v.gps_device_id ?? '',
    live_tracking_enabled: !!v.live_tracking_enabled,
  };
}

const fieldCls = 'block text-sm';
const labelCls = 'text-gray-600';

// Enum options for the styled SelectMenu dropdowns (mirror the tms_vehicle
// CHECK constraints: fuel_type, status).
const FUEL_OPTIONS: SelectMenuOption[] = [
  { value: 'diesel', label: 'Diesel' },
  { value: 'petrol', label: 'Petrol' },
  { value: 'electric', label: 'Electric' },
  { value: 'cng', label: 'CNG' },
];
const STATUS_OPTIONS: SelectMenuOption[] = [
  { value: 'active', label: 'Active' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'retired', label: 'Retired' },
];

export default function VehicleForm({
  mode,
  vehicleId,
  initial,
}: {
  mode: 'create' | 'edit';
  vehicleId?: string;
  initial?: VehicleRow;
}) {
  const router = useRouter();
  const [form, setForm] = useState<VehicleFormState>(initial ? fromVehicle(initial) : EMPTY);
  const [gpsDevices, setGpsDevices] = useState<GpsDevice[]>([]);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof VehicleFormState>(k: K, v: VehicleFormState[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  // GPS devices for the assignment dropdown (best-effort; non-fatal).
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/admin/gps/devices');
        const json = await res.json();
        if (active && json.success) {
          setGpsDevices((json.data as GpsDevice[]).filter((d) => d.status === 'active'));
        }
      } catch {
        /* non-fatal: leave device list empty */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const cancelHref = mode === 'edit' && vehicleId ? `/vehicles/${vehicleId}` : '/vehicles';

  const gpsOptions: SelectMenuOption[] = [
    { value: '', label: 'No GPS Device' },
    ...gpsDevices.map((d) => ({
      value: d.id,
      label: `${d.device_name || 'Device'}${d.device_id ? ` (${d.device_id})` : ''}`,
    })),
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.registration_number.trim()) return toast.error('Registration number is required');
    if (!form.model.trim()) return toast.error('Vehicle model is required');
    if (!form.capacity || parseInt(form.capacity) <= 0) return toast.error('Capacity must be greater than 0');

    setSaving(true);
    try {
      let res: Response;
      if (mode === 'create') {
        // POST expects camelCase (see mapCreatePayload).
        res = await fetch('/api/admin/vehicles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            registrationNumber: form.registration_number.trim(),
            model: form.model.trim(),
            capacity: parseInt(form.capacity),
            fuelType: form.fuel_type,
            status: form.status,
            mileage: form.mileage ? parseFloat(form.mileage) : 0,
            insuranceExpiry: form.insurance_expiry || null,
            fitnessExpiry: form.fitness_expiry || null,
            lastMaintenance: form.last_maintenance || null,
            nextMaintenance: form.next_maintenance || null,
            purchaseDate: form.purchase_date || null,
            chassisNumber: form.chassis_number.trim() || null,
            engineNumber: form.engine_number.trim() || null,
            gpsDeviceId: form.gps_device_id || null,
            liveTrackingEnabled: form.live_tracking_enabled,
          }),
        });
      } else {
        // PUT expects snake_case + id (see mapEditPayload). Empty gps_device_id
        // must be null — the column is a uuid and '' would fail to cast.
        res = await fetch('/api/admin/vehicles', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: vehicleId,
            registration_number: form.registration_number.trim(),
            model: form.model.trim(),
            capacity: parseInt(form.capacity),
            fuel_type: form.fuel_type,
            status: form.status,
            mileage: form.mileage ? parseFloat(form.mileage) : 0,
            insurance_expiry: form.insurance_expiry || null,
            fitness_expiry: form.fitness_expiry || null,
            last_maintenance: form.last_maintenance || null,
            next_maintenance: form.next_maintenance || null,
            purchase_date: form.purchase_date || null,
            chassis_number: form.chassis_number.trim() || null,
            engine_number: form.engine_number.trim() || null,
            gps_device_id: form.gps_device_id || null,
            live_tracking_enabled: form.live_tracking_enabled,
          }),
        });
      }

      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `Failed to ${mode} vehicle`);

      toast.success(mode === 'create' ? 'Vehicle created' : 'Vehicle updated');
      const id = mode === 'edit' ? vehicleId : json.data?.id;
      router.push(id ? `/vehicles/${id}` : '/vehicles');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to ${mode} vehicle`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <SectionCard title="Basic information">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <label className={fieldCls}>
            <span className={labelCls}>Registration Number *</span>
            <input
              className="input mt-1"
              value={form.registration_number}
              onChange={(e) => set('registration_number', e.target.value)}
              placeholder="TN01AB1234"
            />
          </label>
          <label className={fieldCls}>
            <span className={labelCls}>Model *</span>
            <input
              className="input mt-1"
              value={form.model}
              onChange={(e) => set('model', e.target.value)}
              placeholder="Tata Starbus"
            />
          </label>
          <label className={fieldCls}>
            <span className={labelCls}>Capacity (passengers) *</span>
            <input
              type="number"
              min="1"
              max="100"
              className="input mt-1"
              value={form.capacity}
              onChange={(e) => set('capacity', e.target.value)}
              placeholder="40"
            />
          </label>
          <div className={fieldCls}>
            <span className={labelCls}>Fuel Type</span>
            <SelectMenu
              className="mt-1"
              ariaLabel="Fuel type"
              value={form.fuel_type}
              onValueChange={(v) => set('fuel_type', v)}
              options={FUEL_OPTIONS}
            />
          </div>
          <div className={fieldCls}>
            <span className={labelCls}>Status</span>
            <SelectMenu
              className="mt-1"
              ariaLabel="Vehicle status"
              value={form.status}
              onValueChange={(v) => set('status', v)}
              options={STATUS_OPTIONS}
            />
          </div>
          <label className={fieldCls}>
            <span className={labelCls}>Mileage (km/l)</span>
            <input
              type="number"
              step="0.1"
              min="0"
              className="input mt-1"
              value={form.mileage}
              onChange={(e) => set('mileage', e.target.value)}
              placeholder="12.5"
            />
          </label>
        </div>
      </SectionCard>

      <SectionCard title="Maintenance & compliance">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <label className={fieldCls}>
            <span className={labelCls}>Last Maintenance</span>
            <input type="date" className="input mt-1" value={form.last_maintenance} onChange={(e) => set('last_maintenance', e.target.value)} />
          </label>
          <label className={fieldCls}>
            <span className={labelCls}>Next Maintenance</span>
            <input type="date" className="input mt-1" value={form.next_maintenance} onChange={(e) => set('next_maintenance', e.target.value)} />
          </label>
          <label className={fieldCls}>
            <span className={labelCls}>Insurance Expiry</span>
            <input type="date" className="input mt-1" value={form.insurance_expiry} onChange={(e) => set('insurance_expiry', e.target.value)} />
          </label>
          <label className={fieldCls}>
            <span className={labelCls}>Fitness Certificate Expiry</span>
            <input type="date" className="input mt-1" value={form.fitness_expiry} onChange={(e) => set('fitness_expiry', e.target.value)} />
          </label>
        </div>
      </SectionCard>

      <SectionCard title="Additional details">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <label className={fieldCls}>
            <span className={labelCls}>Purchase Date</span>
            <input type="date" className="input mt-1" value={form.purchase_date} onChange={(e) => set('purchase_date', e.target.value)} />
          </label>
          <label className={fieldCls}>
            <span className={labelCls}>Chassis Number</span>
            <input className="input mt-1" value={form.chassis_number} onChange={(e) => set('chassis_number', e.target.value)} placeholder="MA3FKA1BHGM123456" />
          </label>
          <label className={fieldCls}>
            <span className={labelCls}>Engine Number</span>
            <input className="input mt-1" value={form.engine_number} onChange={(e) => set('engine_number', e.target.value)} placeholder="497TCIC123456" />
          </label>
        </div>
      </SectionCard>

      <SectionCard title="GPS tracking">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className={fieldCls}>
            <span className={labelCls}>GPS Device</span>
            <SelectMenu
              className="mt-1"
              ariaLabel="GPS device"
              value={form.gps_device_id}
              options={gpsOptions}
              onValueChange={(id) =>
                // Clear live-tracking if the device is removed.
                setForm((p) => ({ ...p, gps_device_id: id, live_tracking_enabled: id ? p.live_tracking_enabled : false }))
              }
            />
            {gpsDevices.length === 0 && (
              <span className="mt-1 block text-xs text-gray-400">
                No active GPS devices found.{' '}
                <a href="/gps-devices" target="_blank" className="text-green-600 hover:underline">
                  Manage devices
                </a>
              </span>
            )}
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input
              type="checkbox"
              checked={form.live_tracking_enabled}
              disabled={!form.gps_device_id}
              onChange={(e) => set('live_tracking_enabled', e.target.checked)}
              className="rounded border-gray-300 text-green-600 focus:ring-green-500"
            />
            <span className={form.gps_device_id ? 'text-gray-700' : 'text-gray-400'}>Enable live tracking</span>
          </label>
        </div>
      </SectionCard>

      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={() => router.push(cancelHref)} disabled={saving}>
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Saving…' : mode === 'create' ? 'Create Vehicle' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}
