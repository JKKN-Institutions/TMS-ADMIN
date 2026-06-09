'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { SectionCard } from '@/components/ui/detail-view';
import { SelectMenu, type SelectMenuOption } from '@/components/ui/select-menu';
import { DocumentUploadField } from './document-upload-field';
import type { VehicleRow } from './columns';

interface GpsDevice { id: string; device_name?: string; device_id?: string; status?: string }
interface DriverItem { id: string; name: string; ops: unknown | null }

// Form state mirrors tms_vehicle columns (camelCase). Strings for inputs.
interface VehicleFormState {
  registrationNumber: string; vehicleType: string; manufacturer: string; model: string;
  modelYear: string; color: string; capacity: string; grossVehicleWeight: string;
  fuelType: string; status: string; mileage: string;
  ownershipType: string; purchaseDate: string; purchaseCost: string; vendorName: string; warrantyExpiry: string;
  rcExpiryDate: string; permitNumber: string; permitExpiryDate: string;
  pollutionCertificateNumber: string; pollutionExpiryDate: string; roadTaxExpiryDate: string; fitnessExpiry: string;
  insuranceProvider: string; insurancePolicyNumber: string; insuranceExpiry: string; insuranceAmount: string;
  assignedDriverId: string; assignedDriverName: string; assignmentDate: string;
  gpsDeviceId: string; liveTrackingEnabled: boolean; gpsProvider: string; simNumber: string;
  lastMaintenance: string; nextMaintenance: string; currentOdometer: string;
  maintenanceIntervalKm: string; maintenanceIntervalDays: string;
  lastServiceOdometer: string; nextServiceOdometer: string; serviceVendor: string;
  monthlyEmi: string; fuelCardNumber: string; operatingCostPerKm: string;
  emergencyContactName: string; emergencyContactPhone: string; firstAidAvailable: boolean; fireExtinguisherExpiry: string;
  rcDocumentUrl: string; insuranceDocumentUrl: string; fitnessCertificateUrl: string; permitDocumentUrl: string;
  chassisNumber: string; engineNumber: string; remarks: string;
}

const EMPTY: VehicleFormState = {
  registrationNumber: '', vehicleType: '', manufacturer: '', model: '', modelYear: '', color: '',
  capacity: '', grossVehicleWeight: '', fuelType: 'diesel', status: 'active', mileage: '',
  ownershipType: '', purchaseDate: '', purchaseCost: '', vendorName: '', warrantyExpiry: '',
  rcExpiryDate: '', permitNumber: '', permitExpiryDate: '', pollutionCertificateNumber: '',
  pollutionExpiryDate: '', roadTaxExpiryDate: '', fitnessExpiry: '',
  insuranceProvider: '', insurancePolicyNumber: '', insuranceExpiry: '', insuranceAmount: '',
  assignedDriverId: '', assignedDriverName: '', assignmentDate: '',
  gpsDeviceId: '', liveTrackingEnabled: false, gpsProvider: '', simNumber: '',
  lastMaintenance: '', nextMaintenance: '', currentOdometer: '', maintenanceIntervalKm: '',
  maintenanceIntervalDays: '', lastServiceOdometer: '', nextServiceOdometer: '', serviceVendor: '',
  monthlyEmi: '', fuelCardNumber: '', operatingCostPerKm: '',
  emergencyContactName: '', emergencyContactPhone: '', firstAidAvailable: false, fireExtinguisherExpiry: '',
  rcDocumentUrl: '', insuranceDocumentUrl: '', fitnessCertificateUrl: '', permitDocumentUrl: '',
  chassisNumber: '', engineNumber: '', remarks: '',
};

const toDateInput = (d?: string | null) => (d ? String(d).split('T')[0] : '');
const s = (v: unknown) => (v == null ? '' : String(v));

function fromVehicle(v: VehicleRow): VehicleFormState {
  return {
    registrationNumber: v.registration_number ?? '', vehicleType: v.vehicle_type ?? '',
    manufacturer: v.manufacturer ?? '', model: v.model ?? '', modelYear: s(v.model_year),
    color: v.color ?? '', capacity: s(v.capacity), grossVehicleWeight: s(v.gross_vehicle_weight),
    fuelType: v.fuel_type ?? 'diesel', status: v.status ?? 'active', mileage: s(v.mileage),
    ownershipType: v.ownership_type ?? '', purchaseDate: toDateInput(v.purchase_date),
    purchaseCost: s(v.purchase_cost), vendorName: v.vendor_name ?? '', warrantyExpiry: toDateInput(v.warranty_expiry),
    rcExpiryDate: toDateInput(v.rc_expiry_date), permitNumber: v.permit_number ?? '',
    permitExpiryDate: toDateInput(v.permit_expiry_date), pollutionCertificateNumber: v.pollution_certificate_number ?? '',
    pollutionExpiryDate: toDateInput(v.pollution_expiry_date), roadTaxExpiryDate: toDateInput(v.road_tax_expiry_date),
    fitnessExpiry: toDateInput(v.fitness_expiry),
    insuranceProvider: v.insurance_provider ?? '', insurancePolicyNumber: v.insurance_policy_number ?? '',
    insuranceExpiry: toDateInput(v.insurance_expiry), insuranceAmount: s(v.insurance_amount),
    assignedDriverId: v.assigned_driver_id ?? '', assignedDriverName: v.assigned_driver_name ?? '',
    assignmentDate: toDateInput(v.assignment_date),
    gpsDeviceId: v.gps_device_id ?? '', liveTrackingEnabled: !!v.live_tracking_enabled,
    gpsProvider: v.gps_provider ?? '', simNumber: v.sim_number ?? '',
    lastMaintenance: toDateInput(v.last_maintenance), nextMaintenance: toDateInput(v.next_maintenance),
    currentOdometer: s(v.current_odometer), maintenanceIntervalKm: s(v.maintenance_interval_km),
    maintenanceIntervalDays: s(v.maintenance_interval_days), lastServiceOdometer: s(v.last_service_odometer),
    nextServiceOdometer: s(v.next_service_odometer), serviceVendor: v.service_vendor ?? '',
    monthlyEmi: s(v.monthly_emi), fuelCardNumber: v.fuel_card_number ?? '', operatingCostPerKm: s(v.operating_cost_per_km),
    emergencyContactName: v.emergency_contact_name ?? '', emergencyContactPhone: v.emergency_contact_phone ?? '',
    firstAidAvailable: !!v.first_aid_available, fireExtinguisherExpiry: toDateInput(v.fire_extinguisher_expiry),
    rcDocumentUrl: v.rc_document_url ?? '', insuranceDocumentUrl: v.insurance_document_url ?? '',
    fitnessCertificateUrl: v.fitness_certificate_url ?? '', permitDocumentUrl: v.permit_document_url ?? '',
    chassisNumber: v.chassis_number ?? '', engineNumber: v.engine_number ?? '', remarks: v.remarks ?? '',
  };
}

// camelCase form state → snake_case API payload (sent for BOTH create and edit).
function toPayload(f: VehicleFormState): Record<string, unknown> {
  return {
    registration_number: f.registrationNumber.trim(), vehicle_type: f.vehicleType || null,
    manufacturer: f.manufacturer.trim() || null, model: f.model.trim(),
    model_year: f.modelYear || null, color: f.color.trim() || null,
    capacity: f.capacity, gross_vehicle_weight: f.grossVehicleWeight || null,
    fuel_type: f.fuelType, status: f.status, mileage: f.mileage || 0,
    ownership_type: f.ownershipType || null, purchase_date: f.purchaseDate || null,
    purchase_cost: f.purchaseCost || null, vendor_name: f.vendorName.trim() || null,
    warranty_expiry: f.warrantyExpiry || null,
    rc_expiry_date: f.rcExpiryDate || null, permit_number: f.permitNumber.trim() || null,
    permit_expiry_date: f.permitExpiryDate || null,
    pollution_certificate_number: f.pollutionCertificateNumber.trim() || null,
    pollution_expiry_date: f.pollutionExpiryDate || null, road_tax_expiry_date: f.roadTaxExpiryDate || null,
    fitness_expiry: f.fitnessExpiry || null,
    insurance_provider: f.insuranceProvider.trim() || null,
    insurance_policy_number: f.insurancePolicyNumber.trim() || null,
    insurance_expiry: f.insuranceExpiry || null, insurance_amount: f.insuranceAmount || null,
    assigned_driver_id: f.assignedDriverId || null, assigned_driver_name: f.assignedDriverName || null,
    assignment_date: f.assignmentDate || null,
    gps_device_id: f.gpsDeviceId || null, live_tracking_enabled: f.liveTrackingEnabled,
    gps_provider: f.gpsProvider.trim() || null, sim_number: f.simNumber.trim() || null,
    last_maintenance: f.lastMaintenance || null, next_maintenance: f.nextMaintenance || null,
    current_odometer: f.currentOdometer || null, maintenance_interval_km: f.maintenanceIntervalKm || null,
    maintenance_interval_days: f.maintenanceIntervalDays || null,
    last_service_odometer: f.lastServiceOdometer || null, next_service_odometer: f.nextServiceOdometer || null,
    service_vendor: f.serviceVendor.trim() || null,
    monthly_emi: f.monthlyEmi || null, fuel_card_number: f.fuelCardNumber.trim() || null,
    operating_cost_per_km: f.operatingCostPerKm || null,
    emergency_contact_name: f.emergencyContactName.trim() || null,
    emergency_contact_phone: f.emergencyContactPhone.trim() || null,
    first_aid_available: f.firstAidAvailable, fire_extinguisher_expiry: f.fireExtinguisherExpiry || null,
    rc_document_url: f.rcDocumentUrl || null, insurance_document_url: f.insuranceDocumentUrl || null,
    fitness_certificate_url: f.fitnessCertificateUrl || null, permit_document_url: f.permitDocumentUrl || null,
    chassis_number: f.chassisNumber.trim() || null, engine_number: f.engineNumber.trim() || null,
    remarks: f.remarks.trim() || null,
  };
}

const fieldCls = 'block text-sm';
const labelCls = 'text-gray-600';

const FUEL_OPTIONS: SelectMenuOption[] = [
  { value: 'diesel', label: 'Diesel' }, { value: 'petrol', label: 'Petrol' },
  { value: 'electric', label: 'Electric' }, { value: 'cng', label: 'CNG' },
];
const STATUS_OPTIONS: SelectMenuOption[] = [
  { value: 'active', label: 'Active' }, { value: 'maintenance', label: 'Maintenance' },
  { value: 'retired', label: 'Retired' },
];
const VEHICLE_TYPE_OPTIONS: SelectMenuOption[] = [
  { value: 'bus', label: 'Bus' }, { value: 'van', label: 'Van' }, { value: 'car', label: 'Car' },
  { value: 'truck', label: 'Truck' }, { value: 'ambulance', label: 'Ambulance' }, { value: 'other', label: 'Other' },
];
const OWNERSHIP_OPTIONS: SelectMenuOption[] = [
  { value: 'owned', label: 'Owned' }, { value: 'leased', label: 'Leased' }, { value: 'rented', label: 'Rented' },
];

export default function VehicleForm({
  mode, vehicleId, initial,
}: { mode: 'create' | 'edit'; vehicleId?: string; initial?: VehicleRow }) {
  const router = useRouter();
  const [form, setForm] = useState<VehicleFormState>(initial ? fromVehicle(initial) : EMPTY);
  const [gpsDevices, setGpsDevices] = useState<GpsDevice[]>([]);
  const [drivers, setDrivers] = useState<DriverItem[]>([]);
  const [saving, setSaving] = useState(false);
  // Documents are held here until submit, then uploaded to storage (deferred).
  const [pendingDocs, setPendingDocs] = useState<{
    rc: File | null; insurance: File | null; fitness: File | null; permit: File | null;
  }>({ rc: null, insurance: null, fitness: null, permit: null });

  const set = <K extends keyof VehicleFormState>(k: K, v: VehicleFormState[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  // GPS devices (best-effort).
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/admin/gps/devices');
        const json = await res.json();
        if (active && json.success) setGpsDevices((json.data as GpsDevice[]).filter((d) => d.status === 'active'));
      } catch { /* non-fatal */ }
    })();
    return () => { active = false; };
  }, []);

  // Drivers for the picker — only those with a tms_driver ops row (FK-safe).
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/admin/drivers');
        const json = await res.json();
        if (active && json.success) setDrivers((json.data as DriverItem[]).filter((d) => d.ops != null));
      } catch { /* non-fatal */ }
    })();
    return () => { active = false; };
  }, []);

  const cancelHref = mode === 'edit' && vehicleId ? `/vehicles/${vehicleId}` : '/vehicles';

  const gpsOptions: SelectMenuOption[] = [
    { value: '', label: 'No GPS Device' },
    ...gpsDevices.map((d) => ({ value: d.id, label: `${d.device_name || 'Device'}${d.device_id ? ` (${d.device_id})` : ''}` })),
  ];
  const driverOptions: SelectMenuOption[] = [
    { value: '', label: 'No driver assigned' },
    ...drivers.map((d) => ({ value: d.id, label: d.name })),
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.registrationNumber.trim()) return toast.error('Registration number is required');
    if (!form.vehicleType) return toast.error('Vehicle type is required');
    if (!form.manufacturer.trim()) return toast.error('Manufacturer is required');
    if (!form.model.trim()) return toast.error('Model is required');
    if (!form.modelYear) return toast.error('Model year is required');
    if (!form.capacity || parseInt(form.capacity) <= 0) return toast.error('Capacity must be greater than 0');

    setSaving(true);
    try {
      // Deferred document upload: push any newly selected files to storage now,
      // then save the vehicle with the returned paths. Abort the save if any
      // upload fails (so we never persist a vehicle referencing a missing blob).
      type DocKey = 'rcDocumentUrl' | 'insuranceDocumentUrl' | 'fitnessCertificateUrl' | 'permitDocumentUrl';
      const pendingList: Array<{ key: DocKey; file: File | null; label: string }> = [
        { key: 'rcDocumentUrl', file: pendingDocs.rc, label: 'RC Document' },
        { key: 'insuranceDocumentUrl', file: pendingDocs.insurance, label: 'Insurance Document' },
        { key: 'fitnessCertificateUrl', file: pendingDocs.fitness, label: 'Fitness Certificate' },
        { key: 'permitDocumentUrl', file: pendingDocs.permit, label: 'Permit Document' },
      ];
      const docPaths: Partial<Record<DocKey, string>> = {};
      for (const { key, file, label } of pendingList) {
        if (!file) continue;
        const fd = new FormData();
        fd.append('file', file);
        const up = await fetch('/api/admin/vehicles/documents', { method: 'POST', body: fd });
        const upJson = await up.json();
        if (!up.ok || !upJson.success) throw new Error(upJson.error || `Failed to upload ${label}`);
        docPaths[key] = upJson.path as string;
      }

      const payload = toPayload({ ...form, ...docPaths });
      const res =
        mode === 'create'
          ? await fetch('/api/admin/vehicles', {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
            })
          : await fetch('/api/admin/vehicles', {
              method: 'PUT', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: vehicleId, ...payload }),
            });
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

  // Small input helpers (kept local; the form is the only consumer).
  const Text = (k: keyof VehicleFormState, label: string, placeholder = '') => (
    <label className={fieldCls}>
      <span className={labelCls}>{label}</span>
      <input className="input mt-1" value={form[k] as string} placeholder={placeholder}
        onChange={(e) => set(k, e.target.value as VehicleFormState[typeof k])} />
    </label>
  );
  const Num = (k: keyof VehicleFormState, label: string, step = '1', placeholder = '') => (
    <label className={fieldCls}>
      <span className={labelCls}>{label}</span>
      <input type="number" step={step} min="0" className="input mt-1" value={form[k] as string} placeholder={placeholder}
        onChange={(e) => set(k, e.target.value as VehicleFormState[typeof k])} />
    </label>
  );
  const DateF = (k: keyof VehicleFormState, label: string) => (
    <label className={fieldCls}>
      <span className={labelCls}>{label}</span>
      <input type="date" className="input mt-1" value={form[k] as string}
        onChange={(e) => set(k, e.target.value as VehicleFormState[typeof k])} />
    </label>
  );
  const grid = 'grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3';

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <SectionCard title="Identity">
        <div className={grid}>
          {Text('registrationNumber', 'Registration Number *', 'TN01AB1234')}
          <div className={fieldCls}>
            <span className={labelCls}>Vehicle Type *</span>
            <SelectMenu className="mt-1" ariaLabel="Vehicle type" value={form.vehicleType}
              onValueChange={(v) => set('vehicleType', v)} options={VEHICLE_TYPE_OPTIONS} />
          </div>
          {Text('manufacturer', 'Manufacturer *', 'Tata')}
          {Text('model', 'Model *', 'Starbus')}
          {Num('modelYear', 'Model Year *', '1', '2022')}
          {Text('color', 'Color', 'White')}
          {Num('capacity', 'Capacity (passengers) *', '1', '40')}
          {Num('grossVehicleWeight', 'Gross Vehicle Weight (kg)', '0.01', '16200')}
          <div className={fieldCls}>
            <span className={labelCls}>Fuel Type</span>
            <SelectMenu className="mt-1" ariaLabel="Fuel type" value={form.fuelType}
              onValueChange={(v) => set('fuelType', v)} options={FUEL_OPTIONS} />
          </div>
          <div className={fieldCls}>
            <span className={labelCls}>Status</span>
            <SelectMenu className="mt-1" ariaLabel="Vehicle status" value={form.status}
              onValueChange={(v) => set('status', v)} options={STATUS_OPTIONS} />
          </div>
          {Num('mileage', 'Mileage (km/l)', '0.1', '12.5')}
        </div>
      </SectionCard>

      <SectionCard title="Ownership & purchase">
        <div className={grid}>
          <div className={fieldCls}>
            <span className={labelCls}>Ownership Type</span>
            <SelectMenu className="mt-1" ariaLabel="Ownership type" value={form.ownershipType}
              onValueChange={(v) => set('ownershipType', v)} options={[{ value: '', label: '—' }, ...OWNERSHIP_OPTIONS]} />
          </div>
          {DateF('purchaseDate', 'Purchase Date')}
          {Num('purchaseCost', 'Purchase Cost', '0.01')}
          {Text('vendorName', 'Vendor Name')}
          {DateF('warrantyExpiry', 'Warranty Expiry')}
        </div>
      </SectionCard>

      <SectionCard title="Compliance & legal">
        <div className={grid}>
          {DateF('rcExpiryDate', 'RC Expiry')}
          {Text('permitNumber', 'Permit Number')}
          {DateF('permitExpiryDate', 'Permit Expiry')}
          {Text('pollutionCertificateNumber', 'Pollution Cert. Number')}
          {DateF('pollutionExpiryDate', 'Pollution Expiry')}
          {DateF('roadTaxExpiryDate', 'Road Tax Expiry')}
          {DateF('fitnessExpiry', 'Fitness Certificate Expiry')}
        </div>
      </SectionCard>

      <SectionCard title="Insurance">
        <div className={grid}>
          {Text('insuranceProvider', 'Insurance Provider')}
          {Text('insurancePolicyNumber', 'Policy Number')}
          {DateF('insuranceExpiry', 'Insurance Expiry')}
          {Num('insuranceAmount', 'Insured Amount', '0.01')}
        </div>
      </SectionCard>

      <SectionCard title="Driver assignment">
        <div className={grid}>
          <div className={fieldCls}>
            <span className={labelCls}>Assigned Driver</span>
            <SelectMenu className="mt-1" ariaLabel="Assigned driver" value={form.assignedDriverId}
              options={driverOptions}
              onValueChange={(id) => {
                const name = drivers.find((d) => d.id === id)?.name ?? '';
                setForm((p) => ({ ...p, assignedDriverId: id, assignedDriverName: name }));
              }} />
            {drivers.length === 0 && (
              <span className="mt-1 block text-xs text-gray-400">No onboarded drivers found.</span>
            )}
          </div>
          {DateF('assignmentDate', 'Assignment Date')}
        </div>
      </SectionCard>

      <SectionCard title="GPS & tracking">
        <div className={grid}>
          <div className={fieldCls}>
            <span className={labelCls}>GPS Device</span>
            <SelectMenu className="mt-1" ariaLabel="GPS device" value={form.gpsDeviceId} options={gpsOptions}
              onValueChange={(id) => setForm((p) => ({ ...p, gpsDeviceId: id, liveTrackingEnabled: id ? p.liveTrackingEnabled : false }))} />
          </div>
          {Text('gpsProvider', 'GPS Provider')}
          {Text('simNumber', 'SIM Number')}
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" checked={form.liveTrackingEnabled} disabled={!form.gpsDeviceId}
              onChange={(e) => set('liveTrackingEnabled', e.target.checked)}
              className="rounded border-gray-300 text-green-600 focus:ring-green-500" />
            <span className={form.gpsDeviceId ? 'text-gray-700' : 'text-gray-400'}>Enable live tracking</span>
          </label>
        </div>
      </SectionCard>

      <SectionCard title="Maintenance">
        <div className={grid}>
          {DateF('lastMaintenance', 'Last Maintenance')}
          {DateF('nextMaintenance', 'Next Maintenance')}
          {Num('currentOdometer', 'Current Odometer (km)', '0.01')}
          {Num('maintenanceIntervalKm', 'Service Interval (km)', '0.01')}
          {Num('maintenanceIntervalDays', 'Service Interval (days)', '1')}
          {Num('lastServiceOdometer', 'Last Service Odometer (km)', '0.01')}
          {Num('nextServiceOdometer', 'Next Service Odometer (km)', '0.01')}
          {Text('serviceVendor', 'Service Vendor')}
        </div>
      </SectionCard>

      <SectionCard title="Financial">
        <div className={grid}>
          {Num('monthlyEmi', 'Monthly EMI', '0.01')}
          {Text('fuelCardNumber', 'Fuel Card Number')}
          {Num('operatingCostPerKm', 'Operating Cost / km', '0.01')}
        </div>
      </SectionCard>

      <SectionCard title="Emergency">
        <div className={grid}>
          {Text('emergencyContactName', 'Emergency Contact Name')}
          {Text('emergencyContactPhone', 'Emergency Contact Phone')}
          {DateF('fireExtinguisherExpiry', 'Fire Extinguisher Expiry')}
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" checked={form.firstAidAvailable}
              onChange={(e) => set('firstAidAvailable', e.target.checked)}
              className="rounded border-gray-300 text-green-600 focus:ring-green-500" />
            <span className="text-gray-700">First-aid kit available</span>
          </label>
        </div>
      </SectionCard>

      <SectionCard title="Documents">
        <div className={grid}>
          <DocumentUploadField label="RC Document" value={form.rcDocumentUrl} pendingFile={pendingDocs.rc}
            onSelect={(f) => setPendingDocs((p) => ({ ...p, rc: f }))}
            onClear={() => { setPendingDocs((p) => ({ ...p, rc: null })); set('rcDocumentUrl', ''); }} />
          <DocumentUploadField label="Insurance Document" value={form.insuranceDocumentUrl} pendingFile={pendingDocs.insurance}
            onSelect={(f) => setPendingDocs((p) => ({ ...p, insurance: f }))}
            onClear={() => { setPendingDocs((p) => ({ ...p, insurance: null })); set('insuranceDocumentUrl', ''); }} />
          <DocumentUploadField label="Fitness Certificate" value={form.fitnessCertificateUrl} pendingFile={pendingDocs.fitness}
            onSelect={(f) => setPendingDocs((p) => ({ ...p, fitness: f }))}
            onClear={() => { setPendingDocs((p) => ({ ...p, fitness: null })); set('fitnessCertificateUrl', ''); }} />
          <DocumentUploadField label="Permit Document" value={form.permitDocumentUrl} pendingFile={pendingDocs.permit}
            onSelect={(f) => setPendingDocs((p) => ({ ...p, permit: f }))}
            onClear={() => { setPendingDocs((p) => ({ ...p, permit: null })); set('permitDocumentUrl', ''); }} />
        </div>
      </SectionCard>

      <SectionCard title="Identifiers & notes">
        <div className={grid}>
          {Text('chassisNumber', 'Chassis Number', 'MA3FKA1BHGM123456')}
          {Text('engineNumber', 'Engine Number', '497TCIC123456')}
        </div>
        <label className="mt-4 block text-sm">
          <span className={labelCls}>Remarks</span>
          <textarea className="input mt-1 min-h-[80px]" value={form.remarks}
            onChange={(e) => set('remarks', e.target.value)} />
        </label>
      </SectionCard>

      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={() => router.push(cancelHref)} disabled={saving}>Cancel</button>
        <button type="submit" disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Saving…' : mode === 'create' ? 'Create Vehicle' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}
