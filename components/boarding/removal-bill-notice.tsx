'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * The removal-bill explanation, shown above the willingness toggle.
 *
 * This is the delivery surface, not a decoration. A removed in-charge is
 * redirected here from every /boarding path and this screen has no notification
 * bell, so the tms_notification row written alongside it cannot be read. If the
 * message does not appear here, it does not reach anyone.
 *
 * Renders nothing at all when there is no notice — the toggle is the normal
 * first-login experience and must not gain an empty box.
 */

/**
 * Lines the copy builder emits as section headings. Matched exactly rather than
 * inferred from punctuation, so a body sentence can never be mistaken for a
 * heading and rendered bold.
 */
const HEADINGS = new Set(['Why this happened', 'Why that means a fee', 'If this looks wrong']);

interface Notice {
  title: string;
  body: string;
}

export default function RemovalBillNotice() {
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/boarding/incharge-removal-notice', {
          cache: 'no-store',
          credentials: 'same-origin',
        });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && json?.data) setNotice(json.data as Notice);
      } catch {
        // Silent: the toggle underneath must still work if this fetch fails.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!notice) return null;

  const lines = notice.body.split('\n');

  return (
    <div
      role="alert"
      className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-5 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/30 sm:p-6"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/50">
          <AlertTriangle className="h-5 w-5 text-amber-700 dark:text-amber-400" />
        </div>
        {/* min-w-0 so long stop and route names wrap instead of forcing the card
            wider than the phone viewport. */}
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-amber-900 dark:text-amber-200 sm:text-lg">
            {notice.title}
          </h2>
          <div className="mt-3 space-y-2">
            {lines.map((line, i) =>
              line.trim() === '' ? null : HEADINGS.has(line) ? (
                <p
                  key={i}
                  className="pt-1 text-sm font-semibold text-amber-900 dark:text-amber-200"
                >
                  {line}
                </p>
              ) : (
                <p key={i} className="text-sm leading-relaxed text-amber-900/90 dark:text-amber-100/80">
                  {line}
                </p>
              ),
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
