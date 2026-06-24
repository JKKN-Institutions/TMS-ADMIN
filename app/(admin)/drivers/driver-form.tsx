'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import type { DriverOps } from '@/types';
import { SectionCard } from './driver-page-header';

/** All fields are string-backed for controlled inputs; numbers are coerced server-side. */
interface FormState {
  licenseNumber: string;
  licenseExpiry: string;
  experienceYears: string;
  rating: string;
  totalTrips: string;
  driverStatus: string;
  address: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  aadharNumber: string;
  medicalCertificateExpiry: string;
  locationSharingEnabled: boolean;
  assignedRouteId: string;
  notes: string;
}

function toForm(ops: DriverOps | null): FormState {
  return {
    licenseNumber: ops?.licenseNumber ?? '',
    licenseExpiry: ops?.licenseExpiry ?? '',
    experienceYears: String(ops?.experienceYears ?? 0),
    rating: String(ops?.rating ?? 0),
    totalTrips: String(ops?.totalTrips ?? 0),
    driverStatus: ops?.driverStatus ?? 'active',
    address: ops?.address ?? '',
    emergencyContactName: ops?.emergencyContactName ?? '',
    emergencyContactPhone: ops?.emergencyContactPhone ?? '',
    aadharNumber: ops?.aadharNumber ?? '',
    medicalCertificateExpiry: ops?.medicalCertificateExpiry ?? '',
    locationSharingEnabled: ops?.locationSharingEnabled ?? false,
    assignedRouteId: ops?.assignedRouteId ?? '',
    notes: ops?.notes ?? '',
  };
}

/**
 * Shared operational-details form for the in-module create/edit driver pages.
 * - mode 'create' → POST /api/admin/drivers (assigns staff + creates ops row)
 * - mode 'edit'   → PUT  /api/admin/drivers (upserts ops row)
 * On success it invalidates the list + detail queries and navigates to the
 * driver's view page.
 */
export default function DriverForm({
  mode,
  staffId,
  initialOps = null,
}: {
  mode: 'create' | 'edit';
  staffId: string;
  initialOps?: DriverOps | null;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(toForm(initialOps));

  const set = (k: keyof FormState, v: string | boolean) => setForm((p) => ({ ...p, [k]: v }));

  // Routes for the "Assigned Route" dropdown. The driver portal reads this column
  // (tms_driver.assigned_route_id), so the value MUST be a real route UUID — hence a
  // dropdown, not the old free-text box where a typed route number failed to save.
  const [routes, setRoutes] = useState<{ id: string; label: string }[]>([]);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/admin/routes');
        const json = await res.json();
        if (active && json.success) {
          setRoutes(
            (json.data as { id: string; route_number: string | null; route_name: string | null }[]).map((r) => ({
              id: r.id,
              label: `${r.route_number ?? '?'} · ${r.route_name ?? ''}`.trim(),
            }))
          );
        }
      } catch {
        /* non-fatal — the dropdown just stays empty */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/admin/drivers', {
        method: mode === 'create' ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId, fields: form }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Save failed');
      return json;
    },
    onSuccess: () => {
      toast.success(mode === 'create' ? 'Driver created' : 'Driver details saved');
      qc.invalidateQueries({ queryKey: ['drivers'] });
      qc.invalidateQueries({ queryKey: ['driver', staffId] });
      router.push(`/drivers/${staffId}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
      className="space-y-6"
    >
      <SectionCard title="Operational details">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="block text-sm">
            <span className="text-gray-600">License No.</span>
            <input className="input mt-1" value={form.licenseNumber} onChange={(e) => set('licenseNumber', e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">License Expiry</span>
            <input type="date" className="input mt-1" value={form.licenseExpiry} onChange={(e) => set('licenseExpiry', e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Experience (yrs)</span>
            <input type="number" min="0" className="input mt-1" value={form.experienceYears} onChange={(e) => set('experienceYears', e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Rating</span>
            <input type="number" step="0.1" min="0" max="5" className="input mt-1" value={form.rating} onChange={(e) => set('rating', e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Total Trips</span>
            <input type="number" min="0" className="input mt-1" value={form.totalTrips} onChange={(e) => set('totalTrips', e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Driver Status</span>
            <select className="input mt-1" value={form.driverStatus} onChange={(e) => set('driverStatus', e.target.value)}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="on_leave">On Leave</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Assigned Route</span>
            <select className="input mt-1" value={form.assignedRouteId} onChange={(e) => set('assignedRouteId', e.target.value)}>
              <option value="">Unassigned</option>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
            </select>
          </label>
        </div>
      </SectionCard>

      <SectionCard title="Emergency & compliance">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="block text-sm">
            <span className="text-gray-600">Emergency Contact Name</span>
            <input className="input mt-1" value={form.emergencyContactName} onChange={(e) => set('emergencyContactName', e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Emergency Contact Phone</span>
            <input className="input mt-1" value={form.emergencyContactPhone} onChange={(e) => set('emergencyContactPhone', e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Aadhar No.</span>
            <input className="input mt-1" value={form.aadharNumber} onChange={(e) => set('aadharNumber', e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Medical Cert. Expiry</span>
            <input type="date" className="input mt-1" value={form.medicalCertificateExpiry} onChange={(e) => set('medicalCertificateExpiry', e.target.value)} />
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="text-gray-600">Address</span>
            <input className="input mt-1" value={form.address} onChange={(e) => set('address', e.target.value)} />
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="text-gray-600">Notes</span>
            <textarea className="input mt-1" rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </label>
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input
              type="checkbox"
              checked={form.locationSharingEnabled}
              onChange={(e) => set('locationSharingEnabled', e.target.checked)}
            />
            <span className="text-gray-700">Location sharing enabled</span>
          </label>
        </div>
      </SectionCard>

      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={() => router.back()} disabled={mutation.isPending}>
          Cancel
        </button>
        <button
          type="submit"
          className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
          disabled={mutation.isPending}
        >
          {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {mutation.isPending
            ? mode === 'create'
              ? 'Creating…'
              : 'Saving…'
            : mode === 'create'
              ? 'Create Driver'
              : 'Save changes'}
        </button>
      </div>
    </form>
  );
}
