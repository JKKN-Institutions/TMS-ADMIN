'use client';

import type { ComponentType } from 'react';
import { School, Navigation2, Clock, Crosshair, Gauge } from 'lucide-react';
import { CAMPUS } from '@/lib/gps/campus';
import { haversineKm, bearingDeg, isApproaching, etaMinutes, type LatLng } from '@/lib/gps/distance';
import type { ViewerLocationStatus } from '@/lib/hooks/use-viewer-location';

interface BusContextStripProps {
  position: LatLng | null;
  heading: number | null;
  speedKmh: number | null;
  accuracyM: number | null;
  viewer?: LatLng | null;
  viewerStatus?: ViewerLocationStatus;
  viewerMessage?: string | null;
  onLocateMe?: () => void;
}

function Chip({
  icon: Icon, label, value,
}: { icon: ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-800/40">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="mt-1 truncate font-semibold text-gray-900 tabular-nums dark:text-white">{value}</p>
    </div>
  );
}

/** Distance in a human unit: metres under 1 km, else one-decimal km. */
function fmtKm(n: number): string {
  return n < 1 ? `${Math.round(n * 1000)} m` : `${n.toFixed(1)} km`;
}

export function BusContextStrip({
  position, heading, speedKmh, accuracyM,
  viewer, viewerStatus, viewerMessage, onLocateMe,
}: BusContextStripProps) {
  if (!position) return null;
  const distKm = haversineKm(position, CAMPUS);
  const approaching = isApproaching(heading, bearingDeg(position, CAMPUS));
  const eta = approaching ? etaMinutes(distKm, speedKmh) : null;
  const fromMe = viewer ? haversineKm(position, viewer) : null;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Chip icon={School} label="To campus" value={fmtKm(distKm)} />
        <Chip
          icon={Clock}
          label="ETA (approx)"
          value={eta != null ? `~${eta} min` : heading == null ? '—' : approaching ? '—' : 'heading away'}
        />
        <Chip icon={Gauge} label="Speed" value={speedKmh != null ? `${Math.round(speedKmh)} km/h` : '—'} />
        <Chip icon={Navigation2} label="GPS accuracy" value={accuracyM != null ? `±${Math.round(accuracyM)} m` : '—'} />
      </div>

      {onLocateMe && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onLocateMe}
            disabled={viewerStatus === 'loading'}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
          >
            <Crosshair className="h-4 w-4" />
            {viewerStatus === 'loading' ? 'Locating…' : fromMe != null ? 'Update my location' : 'Show distance from me'}
          </button>
          {fromMe != null && (
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Bus is <span className="tabular-nums">{fmtKm(fromMe)}</span> from you
            </span>
          )}
          {viewerMessage && <span className="text-sm text-amber-600 dark:text-amber-400">{viewerMessage}</span>}
        </div>
      )}
    </div>
  );
}
