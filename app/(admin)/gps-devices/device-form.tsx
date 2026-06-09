'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Save } from 'lucide-react';
import toast from 'react-hot-toast';

export interface GpsDeviceFormValues {
  device_id: string;
  device_name: string;
  device_model: string;
  sim_number: string;
  imei: string;
  status: string;
  notes: string;
}

const STATUS_OPTIONS = ['active', 'inactive', 'offline', 'maintenance', 'error'];

type Mode = 'create' | 'edit';

/**
 * Shared GPS device form for the Add (create) and Edit (update) in-module pages.
 * Validation mirrors the original add modal. `device_id` is editable only on
 * create (immutable hardware id); `status` is editable only on edit (new devices
 * default to "inactive" server-side).
 */
export function GpsDeviceForm({
  mode,
  deviceId,
  initial,
}: {
  mode: Mode;
  /** DB uuid — required in edit mode (the PUT target). */
  deviceId?: string;
  initial?: Partial<GpsDeviceFormValues>;
}) {
  const router = useRouter();
  const [form, setForm] = useState<GpsDeviceFormValues>({
    device_id: initial?.device_id ?? '',
    device_name: initial?.device_name ?? '',
    device_model: initial?.device_model ?? '',
    sim_number: initial?.sim_number ?? '',
    imei: initial?.imei ?? '',
    status: initial?.status ?? 'inactive',
    notes: initial?.notes ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const set = (key: keyof GpsDeviceFormValues, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: '' }));
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (mode === 'create') {
      if (!form.device_id.trim()) e.device_id = 'Device ID is required';
      else if (!/^[A-Z0-9]{3,20}$/i.test(form.device_id.trim()))
        e.device_id = 'Device ID must be 3-20 alphanumeric characters';
    }
    if (!form.device_name.trim()) e.device_name = 'Device name is required';
    else if (form.device_name.trim().length < 3) e.device_name = 'Device name must be at least 3 characters';
    if (form.sim_number && !/^\d{10,15}$/.test(form.sim_number)) e.sim_number = 'SIM number must be 10-15 digits';
    if (form.imei && !/^\d{15}$/.test(form.imei)) e.imei = 'IMEI must be exactly 15 digits';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const onSubmit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        device_name: form.device_name.trim(),
        device_model: form.device_model.trim() || null,
        sim_number: form.sim_number.trim() || null,
        imei: form.imei.trim() || null,
        notes: form.notes.trim() || null,
        ...(mode === 'create'
          ? { device_id: form.device_id.trim().toUpperCase() }
          : { status: form.status }),
      };
      const res = await fetch(
        mode === 'create' ? '/api/admin/gps/devices' : `/api/admin/gps/devices/${deviceId}`,
        {
          method: mode === 'create' ? 'POST' : 'PUT',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
          credentials: 'same-origin',
          body: JSON.stringify(payload),
        }
      );
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Save failed');
      toast.success(mode === 'create' ? 'GPS device added' : 'GPS device updated');
      router.push(mode === 'create' ? '/gps-devices' : `/gps-devices/${deviceId}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const cancelHref = mode === 'create' ? '/gps-devices' : `/gps-devices/${deviceId}`;
  const fieldHint = 'mt-1 text-xs text-gray-500';
  const errText = 'mt-1 text-xs text-red-500';

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="mb-4 text-sm font-semibold text-gray-900">Device Information</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Device ID {mode === 'create' ? '*' : ''}</label>
            {mode === 'create' ? (
              <>
                <input
                  type="text"
                  value={form.device_id}
                  onChange={(e) => set('device_id', e.target.value)}
                  className={`input ${errors.device_id ? 'border-red-500' : ''}`}
                  placeholder="GPS001"
                  disabled={saving}
                />
                {errors.device_id ? <p className={errText}>{errors.device_id}</p> : <p className={fieldHint}>Unique identifier (3-20 characters, alphanumeric)</p>}
              </>
            ) : (
              <>
                <p className="flex h-[42px] items-center rounded-lg border border-gray-200 bg-gray-50 px-3 font-mono text-sm text-gray-700">
                  {form.device_id || '—'}
                </p>
                <p className={fieldHint}>Hardware identifier — cannot be changed</p>
              </>
            )}
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Device Name *</label>
            <input
              type="text"
              value={form.device_name}
              onChange={(e) => set('device_name', e.target.value)}
              className={`input ${errors.device_name ? 'border-red-500' : ''}`}
              placeholder="Primary Bus Tracker"
              disabled={saving}
            />
            {errors.device_name ? <p className={errText}>{errors.device_name}</p> : <p className={fieldHint}>Descriptive name for easy identification</p>}
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Device Model</label>
            <input
              type="text"
              value={form.device_model}
              onChange={(e) => set('device_model', e.target.value)}
              className="input"
              placeholder="TrackMax Pro 4G"
              disabled={saving}
            />
            <p className={fieldHint}>Manufacturer model (optional)</p>
          </div>

          {mode === 'edit' && (
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Status</label>
              <select
                value={form.status}
                onChange={(e) => set('status', e.target.value)}
                className="input capitalize"
                disabled={saving}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s} className="capitalize">
                    {s}
                  </option>
                ))}
              </select>
              <p className={fieldHint}>Operational status of the device</p>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="mb-4 text-sm font-semibold text-gray-900">Connectivity Details</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">SIM Number</label>
            <input
              type="text"
              value={form.sim_number}
              onChange={(e) => set('sim_number', e.target.value.replace(/\D/g, ''))}
              className={`input ${errors.sim_number ? 'border-red-500' : ''}`}
              placeholder="9876543210"
              maxLength={15}
              disabled={saving}
            />
            {errors.sim_number ? <p className={errText}>{errors.sim_number}</p> : <p className={fieldHint}>SIM card number (10-15 digits, optional)</p>}
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">IMEI Number</label>
            <input
              type="text"
              value={form.imei}
              onChange={(e) => set('imei', e.target.value.replace(/\D/g, ''))}
              className={`input ${errors.imei ? 'border-red-500' : ''}`}
              placeholder="123456789012345"
              maxLength={15}
              disabled={saving}
            />
            {errors.imei ? <p className={errText}>{errors.imei}</p> : <p className={fieldHint}>Device IMEI (15 digits, optional)</p>}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <label className="mb-2 block text-sm font-medium text-gray-700">Notes</label>
        <textarea
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
          className="input"
          rows={3}
          placeholder="Additional notes about this GPS device (installation date, location, etc.)"
          disabled={saving}
        />
        <p className={fieldHint}>Optional notes for reference</p>
      </div>

      <div className="flex justify-end gap-3">
        <Link
          href={cancelHref}
          className="inline-flex h-10 items-center rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-green-600 px-4 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {mode === 'create' ? 'Add GPS Device' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}
