'use client';

import { CloudOff, RefreshCw, LogIn } from 'lucide-react';

const fmt = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/**
 * One line that says whether marks are reaching the server. Silent when
 * everything is normal, so an ordinary online morning looks exactly as before.
 */
export function OfflineStatusBar({
  online, pendingCount, savedAt, authRequired,
}: {
  online: boolean;
  pendingCount: number;
  /** Set when the roster on screen came from the phone, not the server. */
  savedAt: string | null;
  authRequired: boolean;
}) {
  const waiting = `${pendingCount} mark${pendingCount === 1 ? '' : 's'}`;

  if (authRequired) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
        <LogIn className="mt-0.5 h-4 w-4 shrink-0" />
        <span>Your sign-in has expired. Sign in again to send {waiting} saved on this phone.</span>
      </div>
    );
  }
  if (!online || savedAt) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
        <CloudOff className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          {online ? 'Cannot reach the server.' : 'No signal.'} Marks are saved on this phone and send
          when signal returns.
          {pendingCount > 0 ? ` ${waiting} waiting.` : ''}
          {savedAt ? ` Showing the list saved at ${fmt(savedAt)}.` : ''}
        </span>
      </div>
    );
  }
  if (pendingCount > 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200">
        <RefreshCw className="h-4 w-4 shrink-0 animate-spin" />
        <span>Sending {waiting}…</span>
      </div>
    );
  }
  return null;
}
