'use client';

import { useEffect, useState } from 'react';
import { Timer, Save, Loader2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import type { FeeNoticeConfig } from '@/lib/fees/payment-notice/config';
import { validateFeeNoticeInput } from '@/lib/fees/payment-notice/config';

/**
 * The on/off switch for the 48-hour Transport Maintenance Fee payment notice.
 * Turning it ON is go-live: every unpaid learner gets 48 hours from that
 * moment, after which a Transport Fee is raised automatically.
 */
export function FeeNoticeSettings() {
  const [cfg, setCfg] = useState<FeeNoticeConfig | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/settings/fee-payment-notice', { cache: 'no-store', credentials: 'same-origin' });
        const json = await res.json();
        if (res.ok && json?.success) setCfg(json.data.config as FeeNoticeConfig);
        else setLoadFailed(true);
      } catch {
        setLoadFailed(true);
      }
    })();
  }, []);

  if (loadFailed) {
    return <p className="p-6 text-sm text-red-600 dark:text-red-400">Could not load the fee notice settings. Reload to try again.</p>;
  }
  if (!cfg) {
    return <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-green-600" /></div>;
  }

  const save = async (enabled: boolean) => {
    const invalid = validateFeeNoticeInput(cfg);
    if (invalid) { toast.error(invalid); return; }
    if (enabled && !cfg.enabled && !window.confirm(
      `Turn on now? Every learner with an unpaid Term 1 Transport Maintenance Fee gets ${cfg.windowHours} hours from now, then a Transport Fee is added automatically.`,
    )) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/settings/fee-payment-notice', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ enabled, windowHours: cfg.windowHours, reminderHoursBefore: cfg.reminderHoursBefore, fineDueDays: cfg.fineDueDays }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Save failed');
      setCfg(json.data.config as FeeNoticeConfig);
      toast.success(enabled ? 'Fee payment notice is ON' : 'Fee payment notice saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const num = (key: 'windowHours' | 'reminderHoursBefore' | 'fineDueDays') => (
    <input
      type="number"
      min={0}
      value={cfg[key]}
      onChange={(e) => setCfg({ ...cfg, [key]: Number(e.target.value) })}
      className="w-24 rounded-md border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800"
    />
  );

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start gap-3">
        <Timer className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
        <div className="min-w-0">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">48-hour fee payment notice</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Learners with an unpaid Term 1 Transport Maintenance Fee see a countdown. If it runs out, a Transport Fee
            (their route charge) is added automatically. Learners with a concession or override are never included.
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
        <label className="space-y-1 text-sm"><span className="block text-gray-700 dark:text-gray-300">Payment window (hours)</span>{num('windowHours')}</label>
        <label className="space-y-1 text-sm"><span className="block text-gray-700 dark:text-gray-300">Reminder (hours before end)</span>{num('reminderHoursBefore')}</label>
        <label className="space-y-1 text-sm"><span className="block text-gray-700 dark:text-gray-300">Transport Fee due after (days)</span>{num('fineDueDays')}</label>
      </div>

      {!cfg.enabled && (
        <p className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Turning this on starts the countdown for every unpaid learner immediately.
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
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Timer className="h-4 w-4" />} Turn on
          </button>
        )}
      </div>
    </div>
  );
}
