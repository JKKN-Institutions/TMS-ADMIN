'use client';

import { X } from 'lucide-react';
import type { Problem } from '@/lib/boarding/offline/outbox';

const fmt = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/** Marks the server refused after they were queued. Kept until dismissed. */
export function OfflineProblemsPanel({
  problems, onDismiss,
}: {
  problems: Problem[];
  onDismiss: (clientId: string) => void;
}) {
  if (problems.length === 0) return null;
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
      <p className="font-medium">Not saved ({problems.length})</p>
      <ul className="mt-2 space-y-1.5">
        {problems.map((p) => (
          <li key={p.clientId} className="flex items-start justify-between gap-2">
            <span className="min-w-0">
              <span className="font-medium">{p.name ?? 'Unknown card or pass'}</span>
              {' — '}
              {p.message}
              <span className="text-xs opacity-75"> (tapped {fmt(p.tappedAt)})</span>
            </span>
            <button
              type="button"
              onClick={() => onDismiss(p.clientId)}
              aria-label="Dismiss"
              title="Dismiss"
              className="shrink-0 rounded p-0.5 hover:bg-red-100 dark:hover:bg-red-500/20"
            >
              <X className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs opacity-80">
        Show these to the transport office if any of them need correcting.
      </p>
    </div>
  );
}
