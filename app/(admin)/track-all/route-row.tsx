'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ExternalLink, Bell, MapPin, Gauge, Crosshair, School } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FleetRoute } from './types';

const DOT: Record<FleetRoute['tone'], string> = {
  green: 'bg-green-500 dark:bg-green-400',
  amber: 'bg-amber-500 dark:bg-amber-400',
  red: 'bg-red-500 dark:bg-red-400',
  gray: 'bg-gray-400 dark:bg-gray-500',
};

const CHIP: Record<FleetRoute['tone'], string> = {
  green: 'bg-green-50 text-green-700 ring-green-200 dark:bg-green-950/30 dark:text-green-300 dark:ring-green-900/50',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-900/50',
  red: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/30 dark:text-red-300 dark:ring-red-900/50',
  gray: 'bg-gray-100 text-gray-600 ring-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700',
};

/** Label for the deep link, chosen by what the admin actually has to change. */
function fixLabel(state: FleetRoute['state']): string {
  switch (state) {
    case 'off':
    case 'paused':
      return 'Open driver';
    case 'stuck':
      return 'Clear session';
    default:
      return 'Fix route setup';
  }
}

function Stat({ icon: Icon, label, value }: {
  icon: typeof Gauge; label: string; value: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-gray-800 dark:bg-gray-800/40">
      <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
        <Icon className="h-3 w-3 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      <p className="mt-0.5 truncate text-sm font-semibold tabular-nums text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}

export function RouteRow({
  route, expanded, selected, onToggle, onNudge, nudgeState, cooldownMin,
}: {
  route: FleetRoute;
  expanded: boolean;
  selected: boolean;
  onToggle: () => void;
  onNudge: () => void;
  nudgeState: 'idle' | 'sending' | 'sent' | 'cooldown';
  cooldownMin: number | null;
}) {
  // Reverse-geocoded address, fetched only when the row is opened. Raw lat/lng is
  // never shown — it is not information an admin can act on.
  const [address, setAddress] = useState<string | null>(null);
  useEffect(() => {
    if (!expanded || !route.position || address !== null) return;
    let cancelled = false;
    const qs = new URLSearchParams({
      lat: String(route.position.lat), lng: String(route.position.lng), route: '0', address: '1',
    });
    fetch(`/api/admin/track-all/directions?${qs}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled) setAddress(j?.address ?? 'Location unavailable'); })
      .catch(() => { if (!cancelled) setAddress('Location unavailable'); });
    return () => { cancelled = true; };
  }, [expanded, route.position?.lat, route.position?.lng, address]);

  return (
    <li
      className={cn(
        'border-b border-gray-100 last:border-0 dark:border-gray-800',
        selected && 'bg-blue-50/60 dark:bg-blue-950/20',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50"
      >
        <span className={cn('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', DOT[route.tone])} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="shrink-0 text-sm font-bold text-gray-900 dark:text-white">
              {route.routeNumber ?? '—'}
            </span>
            <span className="truncate text-sm text-gray-700 dark:text-gray-300">
              {route.routeName ?? 'Unnamed route'}
            </span>
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium ring-1', CHIP[route.tone])}>
              {route.label}
            </span>
            <span className="truncate text-xs text-gray-500 dark:text-gray-400">{route.reason}</span>
          </span>
        </span>
        <ChevronDown
          className={cn(
            'mt-1 h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500 transition-transform',
            expanded && 'rotate-180',
          )}
        />
      </button>

      {expanded && (
        <div className="space-y-3 px-4 pb-4 pl-9">
          {route.position && (
            <p className="flex items-start gap-1.5 text-xs text-gray-600 dark:text-gray-400">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0">{address ?? 'Locating…'}</span>
            </p>
          )}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat
              icon={School}
              label="To campus"
              value={route.distanceToCampusKm != null ? `${route.distanceToCampusKm.toFixed(1)} km` : '—'}
            />
            <Stat
              icon={Gauge}
              label="Speed"
              value={route.speedKmh != null ? `${Math.round(route.speedKmh)} km/h` : '—'}
            />
            <Stat
              icon={Crosshair}
              label="Accuracy"
              value={route.accuracyM != null ? `±${Math.round(route.accuracyM)} m` : '—'}
            />
          </div>

          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            <dt className="text-gray-400 dark:text-gray-500">Bus</dt>
            <dd className="min-w-0 truncate text-gray-700 dark:text-gray-300">
              {route.vehicle?.registrationNumber ?? 'Not assigned'}
            </dd>
            <dt className="text-gray-400 dark:text-gray-500">Driver</dt>
            <dd className="min-w-0 truncate text-gray-700 dark:text-gray-300">
              {route.driver?.name ?? 'Not assigned'}
            </dd>
            <dt className="text-gray-400 dark:text-gray-500">Last fix</dt>
            <dd className="min-w-0 truncate text-gray-700 dark:text-gray-300">
              {route.lastFixAt ? new Date(route.lastFixAt).toLocaleString() : 'Never'}
            </dd>
          </dl>

          <div className="flex flex-wrap items-center gap-2">
            {route.fixHref && (
              <Link
                href={route.fixHref}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {fixLabel(route.state)}
              </Link>
            )}
            {route.canNudge && (
              <button
                type="button"
                onClick={onNudge}
                disabled={nudgeState !== 'idle'}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60 dark:bg-blue-500 dark:hover:bg-blue-600"
              >
                <Bell className="h-3.5 w-3.5" />
                {nudgeState === 'sending' && 'Sending…'}
                {nudgeState === 'sent' && 'Reminder sent'}
                {nudgeState === 'cooldown' && `Reminded ${cooldownMin ?? 0} min ago`}
                {nudgeState === 'idle' && 'Remind driver'}
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
