'use client';

import { useEffect, useState } from 'react';
import { Clock, Save, Loader2, Sunrise, Sunset } from 'lucide-react';
import toast from 'react-hot-toast';
import { validateWindows, DEFAULT_WINDOWS, type AttendanceWindows } from '@/lib/boarding/attendance-window';

interface WinForm { start: string; end: string; enabled: boolean }
interface EveningForm extends WinForm { active: boolean }

/**
 * Admin editor for the boarding attendance windows: the morning trip, and the
 * evening return trip with its own on/off switch. "Enforce" limits a trip to
 * its hours; it is not the on/off switch. Persists to
 * /api/admin/attendance-windows, which signals open boarding screens to re-read.
 */
export function AttendanceWindowSettings() {
  const [onward, setOnward] = useState<WinForm>({
    start: DEFAULT_WINDOWS.onward.start, end: DEFAULT_WINDOWS.onward.end, enabled: true,
  });
  const [evening, setEvening] = useState<EveningForm>({
    start: DEFAULT_WINDOWS.return.start, end: DEFAULT_WINDOWS.return.end, enabled: true, active: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Set when the initial GET didn't return real settings — network error,
  // non-OK response, or `success` false. The form still shows its defaults in
  // that case, but Save must be disabled: writing those defaults would
  // overwrite the real stored windows with them.
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/attendance-windows', { cache: 'no-store', credentials: 'same-origin' });
        const json = await res.json();
        if (res.ok && json?.success) {
          const w = json.data.windows as AttendanceWindows;
          setOnward({ start: w.onward.start, end: w.onward.end, enabled: w.onward.enabled });
          setEvening({ start: w.return.start, end: w.return.end, enabled: w.return.enabled, active: w.return.active });
        } else {
          setLoadFailed(true);
        }
      } catch {
        setLoadFailed(true);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    // Same rules as the API, so the message appears before a round trip. The API re-validates.
    const invalid = validateWindows({
      onward: { direction: 'onward', ...onward, active: true },
      return: { direction: 'return', ...evening },
    });
    if (invalid) {
      toast.error(invalid);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/attendance-windows', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ onward, return: evening }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to save');
      toast.success('Attendance windows saved. Open boarding screens update now.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save attendance windows');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading attendance windows…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Attendance Scan Windows</h3>
        {loadFailed ? (
          <p className="mt-1 text-sm font-medium text-red-600 dark:text-red-400">
            Could not load the current attendance windows. Reload the page before making changes.
          </p>
        ) : (
          <p className="mt-1 text-sm text-gray-600">
            Boarding staff can mark attendance only during these windows. The time decides which
            trip a mark belongs to. Outside them, scanning and manual marking are closed.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <WindowCard
          title="Morning trip"
          icon={<Sunrise className="h-5 w-5 text-amber-500" />}
          value={onward}
          onChange={setOnward}
        />

        <div className="space-y-3">
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-5 py-3">
            <span>
              <span className="block font-medium text-gray-900">Evening return attendance</span>
              <span className="block text-xs text-gray-600">
                {evening.active ? 'On. Staff can mark the evening trip.' : 'Off. Only the morning trip is marked.'}
              </span>
            </span>
            <input
              type="checkbox"
              checked={evening.active}
              onChange={(e) => setEvening({ ...evening, active: e.target.checked })}
              className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
          </label>
          <div className={evening.active ? '' : 'opacity-50'}>
            <WindowCard
              title="Evening return trip"
              icon={<Sunset className="h-5 w-5 text-indigo-500" />}
              value={evening}
              onChange={(v) => setEvening({ ...evening, ...v })}
            />
          </div>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
        <Clock className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Turn off <strong>Enforce</strong> on the morning trip to allow scanning at any time. To use
          the evening trip, both trips need Enforce on and the morning must end before the evening starts.
        </span>
      </div>

      <button
        type="button"
        onClick={save}
        disabled={saving || loadFailed}
        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save windows
      </button>
    </div>
  );
}

function WindowCard({
  title, icon, value, onChange,
}: {
  title: string;
  icon: React.ReactNode;
  value: WinForm;
  onChange: (v: WinForm) => void;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h4 className="flex items-center gap-2 font-medium text-gray-900">{icon} {title}</h4>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={value.enabled}
            onChange={(e) => onChange({ ...value, enabled: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          Enforce
        </label>
      </div>
      <div className={`grid grid-cols-2 gap-4 ${value.enabled ? '' : 'opacity-50'}`}>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Start time</label>
          <input
            type="time"
            value={value.start}
            disabled={!value.enabled}
            onChange={(e) => onChange({ ...value, start: e.target.value })}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">End time</label>
          <input
            type="time"
            value={value.end}
            disabled={!value.enabled}
            onChange={(e) => onChange({ ...value, end: e.target.value })}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
    </div>
  );
}
