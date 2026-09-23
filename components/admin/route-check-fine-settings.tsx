'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldAlert, Save, Loader2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import type { RouteCheckFineConfig } from '@/lib/route-check/fine-config';
import { validateRouteCheckFineInput } from '@/lib/route-check/fine-config';

interface RouteCheckFinesData {
  config: RouteCheckFineConfig;
  dryRun: { unpaidPastDue: number; alreadyFinedThisYear: number };
}

async function fetchRouteCheckFines(): Promise<RouteCheckFinesData> {
  const res = await fetch('/api/admin/settings/route-check-fines', { cache: 'no-store', credentials: 'same-origin' });
  const json = await res.json();
  if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed to load settings');
  return json.data as RouteCheckFinesData;
}

/**
 * The on/off switch for automatic Bus Inspection fines: a learner with an
 * unpaid, past-due Transport Maintenance Fee, or one who travelled without a
 * booking, is fined the moment an inspector submits a route check.
 */
export function RouteCheckFineSettings() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({ queryKey: ['route-check-fines-settings'], queryFn: fetchRouteCheckFines });

  const [cfg, setCfg] = useState<RouteCheckFineConfig | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) setCfg(data.config);
  }, [data]);

  if (isError) {
    return <p className="p-6 text-sm text-red-600 dark:text-red-400">Could not load the inspection fines settings. Reload to try again.</p>;
  }
  if (isLoading || !cfg) {
    return <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-green-600" /></div>;
  }

  const dryRun = data?.dryRun ?? { unpaidPastDue: 0, alreadyFinedThisYear: 0 };

  const save = async (enabled: boolean) => {
    const invalid = validateRouteCheckFineInput(cfg);
    if (invalid) { toast.error(invalid); return; }
    if (enabled && !cfg.enabled && !window.confirm(
      `Turn on now? From now on, every bus inspection check that finds an unpaid learner past due, or a learner travelling without a booking, raises a fine automatically.`,
    )) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/settings/route-check-fines', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ enabled, unpaidAmount: cfg.unpaidAmount, noBookingAmount: cfg.noBookingAmount, fineDueDays: cfg.fineDueDays }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Save failed');
      setCfg(json.data.config as RouteCheckFineConfig);
      toast.success(enabled ? 'Bus inspection fines are ON' : 'Bus inspection fines saved');
      await queryClient.invalidateQueries({ queryKey: ['route-check-fines-settings'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const num = (key: 'unpaidAmount' | 'noBookingAmount' | 'fineDueDays', min: number, max: number) => (
    <input
      type="number"
      min={min}
      max={max}
      step={1}
      value={cfg[key]}
      onChange={(e) => setCfg({ ...cfg, [key]: Number(e.target.value) })}
      className="w-24 rounded-md border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800"
    />
  );

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
        <div className="min-w-0">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Bus inspection fines</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Raise fines automatically when an inspector submits a check. A learner who booked another bus is not
            fined, and staff are never fined.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.enabled
          ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
          : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}>
          {cfg.enabled ? 'ON' : 'OFF'}
        </span>
        {cfg.enabled && cfg.enabledAt && (
          <span className="text-sm text-gray-600 dark:text-gray-400">
            since {new Date(cfg.enabledAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
          </span>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="space-y-1 text-sm min-w-0">
          <span className="block text-gray-700 dark:text-gray-300">Unpaid maintenance fee fine (₹)</span>
          {num('unpaidAmount', 1, 100000)}
        </label>
        <label className="space-y-1 text-sm min-w-0">
          <span className="block text-gray-700 dark:text-gray-300">Travelled without booking fine (₹)</span>
          {num('noBookingAmount', 1, 100000)}
        </label>
        <label className="space-y-1 text-sm min-w-0">
          <span className="block text-gray-700 dark:text-gray-300">Fine due after (days)</span>
          {num('fineDueDays', 0, 60)}
        </label>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-300">
        If a check ran today: <strong className="text-gray-900 dark:text-gray-100">{dryRun.unpaidPastDue}</strong> unpaid
        learners are past their due date; <strong className="text-gray-900 dark:text-gray-100">{dryRun.alreadyFinedThisYear}</strong>{' '}
        already have a maintenance fine this year (they will not be fined again).
      </div>

      <ul className="list-disc space-y-1 pl-5 text-sm text-gray-600 dark:text-gray-400">
        <li>Fines are raised only on submit</li>
        <li>Staff are never fined</li>
        <li>A learner who booked another bus is not fined</li>
        <li>Fee fines at most once per learner per year (shared with the 48-hour notice)</li>
        <li>No-booking fines at most once per learner per day</li>
        <li>Nothing is fined on Sundays or holidays</li>
      </ul>

      {!cfg.enabled && (
        <p className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Turning this on starts fining immediately on the next submitted check.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {cfg.enabled ? (
          <>
            <button type="button" disabled={saving} onClick={() => save(true)} className="inline-flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
            </button>
            <button type="button" disabled={saving} onClick={() => save(false)} className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-50 dark:border-red-800 dark:text-red-300">
              Turn off
            </button>
          </>
        ) : (
          <button type="button" disabled={saving} onClick={() => save(true)} className="inline-flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />} Turn on
          </button>
        )}
      </div>
    </div>
  );
}
