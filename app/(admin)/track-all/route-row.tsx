'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell, Bus, ChevronDown, Crosshair, ExternalLink, Gauge, MapPin, Phone, School, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { humanizeAge } from '@/lib/gps/route-status';
import { etaMinutes, groupOf } from './status-groups';
import type { FleetRoute } from './types';

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

function Stat({ icon: Icon, label, value }: { icon: typeof Gauge; label: string; value: string }) {
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

const actionBtn =
  'inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-gray-300 bg-white px-2 text-[11px] font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700';

/** What the one-line row says on the right: speed when moving, else how long since the last fix. */
function liveText(r: FleetRoute): string {
  if (r.state === 'live' || r.state === 'recent') {
    return r.speedKmh != null ? `${Math.round(r.speedKmh)} km/h` : 'Reporting';
  }
  if (r.lastFixAt) return `Seen ${humanizeAge(Date.now() - Date.parse(r.lastFixAt))} ago`;
  return r.label;
}

export function RouteRow({
  route, expanded, selected, onToggle, onNudge, nudgeState, cooldownMin, rowRef,
}: {
  route: FleetRoute;
  expanded: boolean;
  selected: boolean;
  onToggle: () => void;
  onNudge: () => void;
  nudgeState: 'idle' | 'sending' | 'sent' | 'cooldown';
  cooldownMin: number | null;
  /** Lets the list scroll this row into view when it becomes selected (e.g. a marker click). */
  rowRef?: (el: HTMLLIElement | null) => void;
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

  const group = groupOf(route.state);
  const reporting = route.state === 'live' || route.state === 'recent';
  const eta = reporting ? etaMinutes(route) : null;
  const phone = route.driver?.phone ?? null;
  // Per-status action, so the obvious next step is one tap from the list.
  const needsBus = route.state === 'no_vehicle' || route.state === 'unconfigured';
  const needsDriver = route.state === 'no_driver';

  return (
    <li
      ref={rowRef}
      className={cn(
        'border-b border-gray-100 last:border-0 dark:border-gray-800',
        selected && 'bg-green-50/70 dark:bg-green-950/20',
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', group.dot)} aria-hidden />
          <span className="w-9 shrink-0 text-sm font-bold tabular-nums text-gray-900 dark:text-white">{route.routeNumber ?? '—'}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-gray-800 dark:text-gray-200">
              {route.vehicle?.registrationNumber ?? <span className="text-gray-400">No bus</span>}
            </span>
            <span className="block truncate text-[11px] text-gray-500 dark:text-gray-400" title={route.reason}>
              {liveText(route)}
              {eta != null && <span title="Estimate at a 30 km/h average"> · about {eta} min to campus</span>}
            </span>
          </span>
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-gray-400 transition-transform dark:text-gray-500', expanded && 'rotate-180')} />
        </button>

        {needsBus && (
          <Link href={`/routes/${route.routeId}/edit`} className={actionBtn} title="Pick a bus for this route">
            <Bus className="h-3.5 w-3.5" /> Assign bus
          </Link>
        )}
        {needsDriver && (
          <Link href={`/routes/${route.routeId}/edit`} className={actionBtn} title="Pick a driver for this route">
            <UserPlus className="h-3.5 w-3.5" /> Assign driver
          </Link>
        )}
        {phone && !needsBus && !needsDriver && (
          <a href={`tel:${phone.replace(/\s/g, '')}`} className={actionBtn} title={`Call ${route.driver?.name ?? 'driver'} · ${phone}`}>
            <Phone className="h-3.5 w-3.5" /> Call
          </a>
        )}
        {route.canNudge && (
          <button
            type="button"
            onClick={onNudge}
            disabled={nudgeState !== 'idle'}
            className={cn(actionBtn, 'border-green-600 text-green-700 disabled:opacity-60 dark:text-green-400')}
            title="Send the driver a reminder to share their location"
          >
            <Bell className="h-3.5 w-3.5" />
            {nudgeState === 'sending' ? 'Sending…' : nudgeState === 'sent' ? 'Sent' : nudgeState === 'cooldown' ? `${cooldownMin ?? 0}m ago` : 'Remind'}
          </button>
        )}
      </div>

      {expanded && (
        <div className="space-y-3 px-3 pb-3 pl-8">
          <p className="text-xs text-gray-600 dark:text-gray-400">
            {route.routeName ?? 'Unnamed route'} · <span className="font-medium">{route.label}</span> — {route.reason}
          </p>
          {route.position && (
            <p className="flex items-start gap-1.5 text-xs text-gray-600 dark:text-gray-400">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0">{address ?? 'Locating…'}</span>
            </p>
          )}

          <div className="grid grid-cols-3 gap-2">
            <Stat icon={School} label="To campus" value={route.distanceToCampusKm != null ? `${route.distanceToCampusKm.toFixed(1)} km` : '—'} />
            <Stat icon={Gauge} label="Speed" value={route.speedKmh != null ? `${Math.round(route.speedKmh)} km/h` : '—'} />
            <Stat icon={Crosshair} label="Accuracy" value={route.accuracyM != null ? `±${Math.round(route.accuracyM)} m` : '—'} />
          </div>

          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            <dt className="text-gray-400 dark:text-gray-500">Driver</dt>
            <dd className="min-w-0 truncate text-gray-700 dark:text-gray-300">
              {route.driver?.name ?? 'Not assigned'}
              {phone ? ` · ${phone}` : ''}
            </dd>
            <dt className="text-gray-400 dark:text-gray-500">Last fix</dt>
            <dd className="min-w-0 truncate text-gray-700 dark:text-gray-300">
              {route.lastFixAt ? new Date(route.lastFixAt).toLocaleString('en-IN') : 'Never'}
            </dd>
          </dl>

          {route.fixHref && (
            <Link
              href={route.fixHref}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {fixLabel(route.state)}
            </Link>
          )}
        </div>
      )}
    </li>
  );
}
