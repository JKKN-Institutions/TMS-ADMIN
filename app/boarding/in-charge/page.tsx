'use client';

import { useState } from 'react';
import { Bus, Check, Loader2, LogOut } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/providers/auth-provider';

/**
 * One-time willingness toggle for a bus_required staffer.
 *
 * Accepting auto-assigns their OWN route — the server resolves it from the staff
 * master, this page never names a route. Declining stores NOTHING: an active
 * tms_staff_route_assignment row IS "willing", so no row means "not willing (or
 * undecided)", and the toggle simply returns on the next login. That also means the
 * declined view must live HERE rather than in the layout, which still computes
 * 'choose' for a decliner.
 */
export default function InChargePage() {
  const { signOut } = useAuth();
  const [willing, setWilling] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleConfirm = async () => {
    if (!willing) {
      setDeclined(true);
      return;
    }
    setSaving(true);
    try {
      // No body: the server resolves the route from the staff master.
      const res = await fetch('/api/boarding/self-assign', {
        method: 'POST',
        credentials: 'same-origin',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to set you as bus in-charge');
      toast.success('You are now the in-charge of your bus');
      // Hard nav: the boarding layout caches its 'access' decision in state keyed off
      // [loading, user, profile], so a soft router.replace() here would hit the
      // layout's stale 'choose' redirect and bounce back to this screen. A full page
      // load forces the layout to remount and recompute access fresh.
      window.location.assign('/boarding/attendance');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to set you as bus in-charge');
      setSaving(false);
    }
  };

  if (declined) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
          <Bus className="h-6 w-6 text-gray-400" />
        </div>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Transport fees apply</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          You&apos;ve opted out of being a bus in-charge, so transport fees apply to your travel.
          Please contact the transport office.
        </p>
        <button
          onClick={() => signOut()}
          className="mt-5 inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-green-600">
          <Bus className="h-6 w-6 text-white" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Bus in-charge</h1>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
        <p className="text-sm text-gray-700 dark:text-gray-300">
          <span className="font-semibold text-gray-900 dark:text-white">Willing to be the bus in-charge?</span>{' '}
          You will not pay transport fees.
        </p>
        <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
          <span className="font-semibold text-gray-900 dark:text-white">Not willing?</span>{' '}
          Transport fees apply.
        </p>

        <div className="mt-5 flex items-center justify-between gap-3 border-t border-gray-100 pt-5 dark:border-gray-800">
          <span className="min-w-0 text-sm font-medium text-gray-900 dark:text-white">
            I&apos;m willing to be the bus in-charge
          </span>
          <label className="relative inline-flex shrink-0 cursor-pointer items-center">
            <input
              type="checkbox"
              checked={willing}
              onChange={(e) => setWilling(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600 dark:bg-gray-700" />
          </label>
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <button
          onClick={handleConfirm}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {saving ? 'Setting…' : 'Confirm'}
        </button>
      </div>
    </div>
  );
}
