'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff, BellRing } from 'lucide-react';
import {
  getPushState,
  subscribeToPush,
  unsubscribeFromPush,
  type PushState,
} from '@/lib/notifications/push-client';

/**
 * Enable/disable web push. Shared across all portals: `variant="bell"` renders a
 * compact row for the notification-bell dropdown; `variant="row"` renders a
 * full-width settings row for profile pages. Renders nothing when push is
 * unsupported (SSR-safe: resolves state after mount).
 */
export default function PushToggle({ variant = 'row' }: { variant?: 'bell' | 'row' }) {
  const [state, setState] = useState<PushState>('default');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getPushState().then((s) => {
      setState(s);
      setReady(true);
    });
  }, []);

  if (!ready || state === 'unsupported') return null;

  const on = state === 'subscribed';
  const denied = state === 'denied';

  const toggle = async () => {
    setBusy(true);
    try {
      setState(on ? await unsubscribeFromPush() : await subscribeToPush());
    } finally {
      setBusy(false);
    }
  };

  if (variant === 'bell') {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={busy || denied}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-gray-600 border-t border-gray-100 hover:bg-gray-50 disabled:opacity-60 dark:text-gray-300 dark:border-gray-800 dark:hover:bg-gray-800/60"
      >
        {on ? <BellRing className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
        {denied
          ? 'Notifications blocked in browser settings'
          : on
            ? 'Push on — tap to turn off'
            : 'Enable push notifications'}
      </button>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-white">Push notifications</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {denied
            ? 'Blocked — re-enable in your browser settings.'
            : on
              ? 'This device receives push notifications.'
              : 'Get notified on this device even when the app is closed.'}
        </p>
      </div>
      <button
        type="button"
        onClick={toggle}
        disabled={busy || denied}
        className={`shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-60 ${
          on
            ? 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200'
            : 'bg-green-600 text-white hover:bg-green-700'
        }`}
      >
        {on ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
        {on ? 'Turn off' : 'Enable'}
      </button>
    </div>
  );
}
