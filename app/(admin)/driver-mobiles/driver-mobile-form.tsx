'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Save, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { fetchDriverOptions, fetchRouteOptions } from './driver-mobile-api';

// Field set mirrors lib/driver-mobiles/fields.ts EDITABLE — a field added here
// must be whitelisted there too, or the API silently drops it on save.
interface FormValues {
  driver_staff_id: string;
  route_id: string;
  brand: string;
  model: string;
  color: string;
  imei: string;
  status: 'assigned' | 'returned' | 'damaged' | 'lost';
  supplied_date: string;
  sim_number: string;
  phone_number: string;
  network_provider: string;
  purchase_date: string;
  purchase_cost: string;
  supplier_name: string;
  invoice_number: string;
  warranty_expiry: string;
  condition: '' | 'new' | 'used' | 'refurbished';
  storage_capacity: string;
  serial_number: string;
  accessories: string;
  notes: string;
  handover_by: string;
  handover_date: string;
  image_path: string;
}

const EMPTY: FormValues = {
  driver_staff_id: '', route_id: '', brand: '', model: '', color: '', imei: '', status: 'assigned',
  supplied_date: '', sim_number: '', phone_number: '', network_provider: '',
  purchase_date: '', purchase_cost: '', supplier_name: '', invoice_number: '', warranty_expiry: '',
  condition: '', storage_capacity: '', serial_number: '', accessories: '', notes: '',
  handover_by: '', handover_date: '', image_path: '',
};

interface DriverMobileFormProps {
  mode: 'create' | 'edit';
  driverMobileId?: string;
  initial?: Partial<FormValues>;
}

export function DriverMobileForm({ mode, driverMobileId, initial }: DriverMobileFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<FormValues>({ ...EMPTY, ...initial });
  const [errors, setErrors] = useState<Partial<Record<keyof FormValues, string>>>({});
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit mode: if the record already has an image, fetch a signed url to preview it.
  useEffect(() => {
    const path = initial?.image_path;
    if (!path) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/driver-mobiles/image?path=${encodeURIComponent(path)}`, {
          cache: 'no-store',
          credentials: 'same-origin',
        });
        const json = await res.json();
        if (!cancelled && res.ok && json.success) setImagePreview(json.url);
      } catch {
        /* preview is best-effort; ignore */
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file after a remove
    if (!file) return;
    setUploadingImage(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/admin/driver-mobiles/image', {
        method: 'POST',
        body: fd,
        cache: 'no-store',
        credentials: 'same-origin',
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Upload failed');
      set('image_path', json.path);
      const sres = await fetch(`/api/admin/driver-mobiles/image?path=${encodeURIComponent(json.path)}`, {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      const sjson = await sres.json();
      setImagePreview(sres.ok && sjson.success ? sjson.url : null);
      toast.success('Image uploaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingImage(false);
    }
  };

  const onRemoveImage = () => {
    set('image_path', '');
    setImagePreview(null);
  };

  const { data: drivers = [] } = useQuery({ queryKey: ['driver-options'], queryFn: fetchDriverOptions });
  const { data: routes = [] } = useQuery({ queryKey: ['route-options'], queryFn: fetchRouteOptions });

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const validate = (): boolean => {
    const next: Partial<Record<keyof FormValues, string>> = {};
    if (!form.driver_staff_id) next.driver_staff_id = 'Select a driver';
    if (!form.brand.trim()) next.brand = 'Brand is required';
    if (!form.model.trim()) next.model = 'Model is required';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        driver_staff_id: form.driver_staff_id,
        route_id: form.route_id || null,
        brand: form.brand.trim(),
        model: form.model.trim(),
        color: form.color.trim() || null,
        imei: form.imei.trim() || null,
        status: form.status,
        supplied_date: form.supplied_date || null,
        sim_number: form.sim_number.trim() || null,
        phone_number: form.phone_number.trim() || null,
        network_provider: form.network_provider.trim() || null,
        purchase_date: form.purchase_date || null,
        purchase_cost: form.purchase_cost || null,
        supplier_name: form.supplier_name.trim() || null,
        invoice_number: form.invoice_number.trim() || null,
        warranty_expiry: form.warranty_expiry || null,
        condition: form.condition || null,
        storage_capacity: form.storage_capacity.trim() || null,
        serial_number: form.serial_number.trim() || null,
        accessories: form.accessories.trim() || null,
        notes: form.notes.trim() || null,
        handover_by: form.handover_by.trim() || null,
        handover_date: form.handover_date || null,
        image_path: form.image_path || null,
      };
      const res = await fetch('/api/admin/driver-mobiles', {
        method: mode === 'create' ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        credentials: 'same-origin',
        body: JSON.stringify(mode === 'create' ? payload : { ...payload, id: driverMobileId }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Save failed');
      toast.success(mode === 'create' ? 'Tracking mobile added' : 'Tracking mobile updated');
      router.push(mode === 'create' ? '/driver-mobiles' : `/driver-mobiles/${driverMobileId}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const cancelHref = mode === 'create' ? '/driver-mobiles' : `/driver-mobiles/${driverMobileId}`;
  const err = (k: keyof FormValues) => errors[k];

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* Supply */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="mb-4 text-sm font-semibold text-gray-900">Supply</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Driver *</label>
            <select
              value={form.driver_staff_id}
              onChange={(e) => set('driver_staff_id', e.target.value)}
              className={`input ${err('driver_staff_id') ? 'border-red-500' : ''}`}
              disabled={saving}
            >
              <option value="">Select a driver…</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>{d.name}{d.phone ? ` — ${d.phone}` : ''}</option>
              ))}
            </select>
            {err('driver_staff_id') && <p className="mt-1 text-xs text-red-500">{err('driver_staff_id')}</p>}
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Status</label>
            <select value={form.status} onChange={(e) => set('status', e.target.value as FormValues['status'])} className="input" disabled={saving}>
              <option value="assigned">Assigned</option>
              <option value="returned">Returned</option>
              <option value="damaged">Damaged</option>
              <option value="lost">Lost</option>
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Supplied date</label>
            <input type="date" value={form.supplied_date} onChange={(e) => set('supplied_date', e.target.value)} className="input" disabled={saving} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Bus route</label>
            <select value={form.route_id} onChange={(e) => set('route_id', e.target.value)} className="input" disabled={saving}>
              <option value="">— None —</option>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>{r.number}{r.name ? ` — ${r.name}` : ''}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Handover */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="mb-4 text-sm font-semibold text-gray-900">Handover</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Handover by</label>
            <input
              value={form.handover_by}
              onChange={(e) => set('handover_by', e.target.value)}
              className="input"
              placeholder="Name of person who handed over"
              disabled={saving}
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Handover date</label>
            <input
              type="date"
              value={form.handover_date}
              onChange={(e) => set('handover_date', e.target.value)}
              className="input"
              disabled={saving}
            />
          </div>
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-medium text-gray-700">Phone image</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={onPickImage}
              className="hidden"
            />
            {imagePreview ? (
              <div className="flex items-center gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imagePreview} alt="Phone" className="h-24 w-24 rounded-lg object-cover ring-1 ring-gray-200" />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={saving || uploadingImage}
                    className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                  >
                    {uploadingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Replace'}
                  </button>
                  <button
                    type="button"
                    onClick={onRemoveImage}
                    disabled={saving || uploadingImage}
                    className="inline-flex h-9 items-center rounded-lg border border-gray-300 px-3 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={saving || uploadingImage}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60"
              >
                {uploadingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {uploadingImage ? 'Uploading…' : 'Upload image'}
              </button>
            )}
            <p className="mt-1 text-xs text-gray-500">JPG, PNG or WEBP, up to 5 MB.</p>
          </div>
        </div>
      </div>

      {/* Device details */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="mb-4 text-sm font-semibold text-gray-900">Device details</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Brand *</label>
            <input value={form.brand} onChange={(e) => set('brand', e.target.value)} className={`input ${err('brand') ? 'border-red-500' : ''}`} placeholder="Samsung" disabled={saving} />
            {err('brand') && <p className="mt-1 text-xs text-red-500">{err('brand')}</p>}
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Model *</label>
            <input value={form.model} onChange={(e) => set('model', e.target.value)} className={`input ${err('model') ? 'border-red-500' : ''}`} placeholder="Galaxy A15" disabled={saving} />
            {err('model') && <p className="mt-1 text-xs text-red-500">{err('model')}</p>}
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Color</label>
            <input value={form.color} onChange={(e) => set('color', e.target.value)} className="input" placeholder="Black" disabled={saving} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">IMEI</label>
            <input value={form.imei} onChange={(e) => set('imei', e.target.value)} className="input" placeholder="15-digit IMEI" disabled={saving} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Condition</label>
            <select value={form.condition} onChange={(e) => set('condition', e.target.value as FormValues['condition'])} className="input" disabled={saving}>
              <option value="">—</option>
              <option value="new">New</option>
              <option value="used">Used</option>
              <option value="refurbished">Refurbished</option>
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Storage</label>
            <input value={form.storage_capacity} onChange={(e) => set('storage_capacity', e.target.value)} className="input" placeholder="128GB" disabled={saving} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Serial number</label>
            <input value={form.serial_number} onChange={(e) => set('serial_number', e.target.value)} className="input" disabled={saving} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Accessories</label>
            <input value={form.accessories} onChange={(e) => set('accessories', e.target.value)} className="input" placeholder="Charger, case" disabled={saving} />
          </div>
        </div>
      </div>

      {/* SIM & number */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="mb-4 text-sm font-semibold text-gray-900">SIM &amp; number</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Phone number</label>
            <input value={form.phone_number} onChange={(e) => set('phone_number', e.target.value)} className="input" placeholder="+91…" disabled={saving} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">SIM number</label>
            <input value={form.sim_number} onChange={(e) => set('sim_number', e.target.value)} className="input" disabled={saving} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Network provider</label>
            <input value={form.network_provider} onChange={(e) => set('network_provider', e.target.value)} className="input" placeholder="Airtel / Jio / BSNL" disabled={saving} />
          </div>
        </div>
      </div>

      {/* Procurement */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="mb-4 text-sm font-semibold text-gray-900">Procurement</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Purchase date</label>
            <input type="date" value={form.purchase_date} onChange={(e) => set('purchase_date', e.target.value)} className="input" disabled={saving} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Purchase cost</label>
            <input type="number" step="0.01" min="0" value={form.purchase_cost} onChange={(e) => set('purchase_cost', e.target.value)} className="input" placeholder="12999" disabled={saving} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Warranty expiry</label>
            <input type="date" value={form.warranty_expiry} onChange={(e) => set('warranty_expiry', e.target.value)} className="input" disabled={saving} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Supplier</label>
            <input value={form.supplier_name} onChange={(e) => set('supplier_name', e.target.value)} className="input" disabled={saving} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Invoice number</label>
            <input value={form.invoice_number} onChange={(e) => set('invoice_number', e.target.value)} className="input" disabled={saving} />
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="mb-4 text-sm font-semibold text-gray-900">Notes</h3>
        <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} className="input min-h-[80px]" placeholder="Any extra details…" disabled={saving} />
      </div>

      <div className="flex justify-end gap-3">
        <Link href={cancelHref} className="inline-flex h-10 items-center rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50">
          Cancel
        </Link>
        <button type="submit" disabled={saving || uploadingImage} className="inline-flex h-10 items-center gap-2 rounded-lg bg-green-600 px-4 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-60">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {mode === 'create' ? 'Add Mobile' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}
