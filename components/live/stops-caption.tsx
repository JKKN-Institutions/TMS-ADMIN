'use client';

import { MapPin } from 'lucide-react';
import { STOP_COLORS } from '@/lib/stops/map-stops';
import type { ProgressSummary } from '@/lib/stops/progress';

/**
 * The line above a tracking map that says where the bus is among its stops, plus a
 * key for the pin colours. Renders nothing when the route has no stop pins yet — the
 * map then looks exactly as it did before stop pins existed.
 */
export function StopsCaption({ summary, pinCount }: { summary: ProgressSummary | null; pinCount: number }) {
  if (pinCount === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      {summary && (
        <p className="flex min-w-0 items-center gap-2 text-sm text-gray-900 dark:text-white">
          <MapPin className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" />
          <span className="min-w-0">
            <span className="font-semibold">{summary.headline}</span>
            {summary.detail && <span className="text-gray-600 dark:text-gray-400"> · {summary.detail}</span>}
          </span>
        </p>
      )}
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: STOP_COLORS.upcoming }} aria-hidden />
          Stops ahead
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: STOP_COLORS.passed }} aria-hidden />
          Passed
        </span>
        <span>Tap a pin for the stop name and time</span>
      </p>
    </div>
  );
}
