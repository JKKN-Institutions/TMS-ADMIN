'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell, ExternalLink, Loader2, MessageSquare, PlusCircle } from 'lucide-react';
import toast from 'react-hot-toast';

interface SchedulingBlob {
  enableBookingTimeWindow: boolean;
  bookingWindowEndHour: number;
  bookingDaysAhead: number;
  autoNotifyPassengers: boolean;
  autoGenerateBills: boolean;
}

/**
 * Notifications tab. This app has exactly ONE notification-related control
 * that actually does something: the `autoNotifyPassengers` flag in the
 * scheduling blob, which `lib/booking/reminders.ts` reads before sending the
 * daily "you haven't booked for tomorrow" reminder. Everything else the old
 * tab showed (Email / SMS / Push channel toggles, maintenance/booking/payment
 * alert switches) had nothing behind it — the notification module is in-app
 * only, so those channels don't exist in this system.
 *
 * The flag lives in the SAME `admin_settings` scheduling record as the
 * booking cutoff hour and horizon, so loading/saving here goes through
 * `/api/admin/settings` and always round-trips the WHOLE blob — never just
 * this one key — or a save from this tab would silently wipe the booking
 * window settings configured on the Scheduling tab.
 *
 * The toggle re-fetches the blob immediately before POSTing rather than
 * spreading the copy snapshotted at mount: if another admin changed the
 * booking cutoff / horizon on the Scheduling tab after this tab loaded, a
 * save built from the stale mount-time blob would silently revert their
 * change the moment this toggle is flipped. Re-GETting right before the
 * write keeps the blast radius of this control to exactly the one flag it
 * claims to control.
 */
export function NotificationsSettings() {
  const [blob, setBlob] = useState<SchedulingBlob | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/settings', { cache: 'no-store', credentials: 'same-origin' });
        const json = await res.json();
        if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed to load settings');
        setBlob(json.data.settings as SchedulingBlob);
      } catch {
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toggleReminders = async () => {
    if (!blob) return;
    const targetValue = !blob.autoNotifyPassengers;
    setSaving(true);
    try {
      // Re-GET the current blob right before writing — do NOT reuse the copy
      // in state, which may have been snapshotted at mount and gone stale if
      // another admin edited the booking cutoff / horizon on the Scheduling
      // tab in the meantime. Only `autoNotifyPassengers` is actually meant to
      // change here.
      const freshRes = await fetch('/api/admin/settings', { cache: 'no-store', credentials: 'same-origin' });
      const freshJson = await freshRes.json();
      if (!freshRes.ok || !freshJson?.success) {
        throw new Error(freshJson?.error || 'Failed to load current settings');
      }
      const current = freshJson.data.settings as SchedulingBlob;
      const next = { ...current, autoNotifyPassengers: targetValue };

      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        // Send the WHOLE blob back — enableBookingTimeWindow, bookingWindowEndHour
        // and bookingDaysAhead ride along unchanged (from the fresh GET above,
        // not a stale mount-time snapshot) so this save can't clobber the live
        // booking cutoff / horizon configured on the Scheduling tab.
        body: JSON.stringify({ settings: next }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed to save settings');
      setBlob(json.data.settings as SchedulingBlob);
      toast.success(next.autoNotifyPassengers ? 'Booking reminders turned on' : 'Booking reminders turned off');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading notification settings…
      </div>
    );
  }

  if (loadError || !blob) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Could not load notification settings. Reload the page to try again.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Notifications</h3>
        <p className="mt-1 text-sm text-gray-600">
          Controls the automated in-app reminder sent to transport learners. Everything else in this
          module — announcements, alerts, replies — is sent manually from the Notifications module.
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Bell className="mt-0.5 h-5 w-5 text-amber-500" />
            <div>
              <div className="text-sm font-medium text-gray-900">Automatic booking reminders</div>
              <p className="mt-1 max-w-xl text-xs text-gray-600">
                When on, a daily in-app notification is sent to transport learners who have not booked a
                seat for tomorrow, delivered before the configured booking cutoff. When off, that daily
                run is skipped entirely — no reminder goes out.
              </p>
            </div>
          </div>
          <label className="relative inline-flex shrink-0 cursor-pointer items-center">
            <input
              type="checkbox"
              aria-label="Automatic booking reminders"
              checked={blob.autoNotifyPassengers}
              disabled={saving}
              onChange={toggleReminders}
              className="peer sr-only"
            />
            <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:top-[2px] after:left-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 peer-disabled:opacity-60"></div>
          </label>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
        <MessageSquare className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          In-app is the only notification channel this system delivers today. Email, SMS and push are not
          available — there is nothing behind those toggles, so they have been removed rather than shown
          as working switches.
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-4 border-t border-gray-100 pt-4 text-sm">
        <Link
          href="/notifications"
          className="inline-flex items-center gap-1.5 font-medium text-blue-600 hover:text-blue-700 hover:underline"
        >
          <ExternalLink className="h-4 w-4" /> View sent notifications
        </Link>
        <Link
          href="/notifications/new"
          className="inline-flex items-center gap-1.5 font-medium text-blue-600 hover:text-blue-700 hover:underline"
        >
          <PlusCircle className="h-4 w-4" /> Compose a notification
        </Link>
      </div>
    </div>
  );
}
