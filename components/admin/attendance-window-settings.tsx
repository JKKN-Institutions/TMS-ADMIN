'use client';

import { useEffect, useState } from 'react';
import { Clock, Save, Loader2, Sunrise, Sunset } from 'lucide-react';
import toast from 'react-hot-toast';

interface WinForm { start: string; end: string; enabled: boolean }

/**
 * Admin editor for the boarding attendance scan windows. Onward (morning) and
 * Return (evening) each have a start/end time + an "enforce" toggle. Persists to
 * /api/admin/attendance-windows; the scan flow and scan page read the same config.
 */
export function AttendanceWindowSettings() {
  const [onward, setOnward] = useState<WinForm>({ start: '07:00', end: '09:30', enabled: true });
  const [ret, setRet] = useState<WinForm>({ start: '16:30', end: '19:00', enabled: true });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/attendance-windows', { cache: 'no-store', credentials: 'same-origin' });
        const json = await res.json();
        if (json?.success) {
          const w = json.data.windows;
          setOnward({ start: w.onward.start, end: w.onward.end, enabled: w.onward.enabled });
          setRet({ start: w.return.start, end: w.return.end, enabled: w.return.enabled });
        }
      } catch {
        /* keep defaults */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    // Light client validation; the API re-validates.
    for (const [label, w] of [['Onward', onward], ['Return', ret]] as const) {
      if (w.enabled && w.start >= w.end) {
        toast.error(`${label}: start time must be before end time`);
        return;
      }
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/attendance-windows', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ onward, return: ret }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to save');
      toast.success('Attendance windows saved');
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
        <p className="mt-1 text-sm text-gray-600">
          Boarding staff can only mark a direction during its window. Outside it, that direction&apos;s
          scan is disabled — so an evening scan can&apos;t accidentally be recorded as a morning trip.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <WindowCard
          title="Onward (morning)"
          icon={<Sunrise className="h-5 w-5 text-amber-500" />}
          value={onward}
          onChange={setOnward}
        />
        <WindowCard
          title="Return (evening)"
          icon={<Sunset className="h-5 w-5 text-indigo-500" />}
          value={ret}
          onChange={setRet}
        />
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
        <Clock className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Turn off <strong>Enforce</strong> to allow a direction to be scanned at any time.
          The boarding scan page auto-selects the active direction based on the current time.
        </span>
      </div>

      <button
        type="button"
        onClick={save}
        disabled={saving}
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
