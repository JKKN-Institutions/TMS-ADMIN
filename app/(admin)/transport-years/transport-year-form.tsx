'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Save } from 'lucide-react';
import toast from 'react-hot-toast';

// Field set mirrors lib/transport-years/fields.ts EDITABLE — a field added here
// must be whitelisted there too, or the API silently drops it on save.
interface FormValues {
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  is_current: boolean;
}

interface TransportYearFormProps {
  mode: 'create' | 'edit';
  transportYearId?: string;
  initial?: Partial<FormValues>;
}

export function TransportYearForm({ mode, transportYearId, initial }: TransportYearFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<FormValues>({
    name: initial?.name ?? '',
    start_date: initial?.start_date ?? '',
    end_date: initial?.end_date ?? '',
    is_active: initial?.is_active ?? true,
    is_current: initial?.is_current ?? false,
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FormValues, string>>>({});
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const validate = (): boolean => {
    const next: Partial<Record<keyof FormValues, string>> = {};
    if (!form.name.trim()) next.name = 'Name is required';
    if (!form.start_date) next.start_date = 'Start date is required';
    if (!form.end_date) next.end_date = 'End date is required';
    if (form.start_date && form.end_date && form.end_date <= form.start_date) {
      next.end_date = 'End date must be after start date';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        is_active: form.is_active,
        is_current: form.is_current,
      };
      const res = await fetch('/api/admin/transport-years', {
        method: mode === 'create' ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        credentials: 'same-origin',
        body: JSON.stringify(mode === 'create' ? payload : { ...payload, id: transportYearId }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Save failed');
      toast.success(mode === 'create' ? 'Transport year added' : 'Transport year updated');
      router.push(mode === 'create' ? '/transport-years' : `/transport-years/${transportYearId}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const cancelHref = mode === 'create' ? '/transport-years' : `/transport-years/${transportYearId}`;

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="mb-4 text-sm font-semibold text-gray-900">Year Details</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-medium text-gray-700">Name *</label>
            <input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              className={`input ${errors.name ? 'border-red-500' : ''}`}
              placeholder="2026 - 2027"
              disabled={saving}
            />
            {errors.name ? (
              <p className="mt-1 text-xs text-red-500">{errors.name}</p>
            ) : (
              <p className="mt-1 text-xs text-gray-500">Unique label for the year, e.g. 2026 - 2027</p>
            )}
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Start Date *</label>
            <input
              type="date"
              value={form.start_date}
              onChange={(e) => set('start_date', e.target.value)}
              className={`input ${errors.start_date ? 'border-red-500' : ''}`}
              disabled={saving}
            />
            {errors.start_date ? (
              <p className="mt-1 text-xs text-red-500">{errors.start_date}</p>
            ) : (
              <p className="mt-1 text-xs text-gray-500">First day of the transport year</p>
            )}
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">End Date *</label>
            <input
              type="date"
              value={form.end_date}
              onChange={(e) => set('end_date', e.target.value)}
              className={`input ${errors.end_date ? 'border-red-500' : ''}`}
              disabled={saving}
            />
            {errors.end_date ? (
              <p className="mt-1 text-xs text-red-500">{errors.end_date}</p>
            ) : (
              <p className="mt-1 text-xs text-gray-500">Last day of the transport year</p>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="mb-4 text-sm font-semibold text-gray-900">Status</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => set('is_active', e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
              disabled={saving}
            />
            <span>
              <span className="block text-sm font-medium text-gray-700">Active</span>
              <span className="block text-xs text-gray-500">Inactive years are kept for history but closed for operations</span>
            </span>
          </label>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={form.is_current}
              onChange={(e) => set('is_current', e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
              disabled={saving}
            />
            <span>
              <span className="block text-sm font-medium text-gray-700">Current year</span>
              <span className="block text-xs text-gray-500">Marking this current automatically un-marks the previous current year</span>
            </span>
          </label>
        </div>
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
          {mode === 'create' ? 'Add Transport Year' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}
