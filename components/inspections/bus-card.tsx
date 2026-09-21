import { Phone } from 'lucide-react';
import type { InspectionDetail, InspectionOverview } from '@/lib/inspections/types';
import type { DocTone } from '@/lib/inspections/doc-status';
import { fmtIST, fmtTime } from '@/lib/inspections/format';

const TONE: Record<DocTone, string> = {
  valid: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  expiring: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  expired: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  missing: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};
const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Not recorded');

function driverTripLine(trip: InspectionOverview['driverTrip']): string {
  if (!trip || !trip.startedAt) return 'No trip started in the driver app today';
  if (trip.endedAt) return `Trip started ${fmtIST(trip.startedAt)} · ended ${fmtIST(trip.endedAt)}`;
  return `Trip in progress since ${fmtIST(trip.startedAt)}`;
}

export function BusCard({ detail, overview, overviewError }: {
  detail: InspectionDetail;
  overview?: InspectionOverview;
  /** The live overview read failed — say so instead of silently dropping its lines. */
  overviewError?: boolean;
}) {
  const { vehicle, route, driver, previous } = detail;
  return (
    <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold">{vehicle.registration}</h2>
        {vehicle.status === 'maintenance' && <span className="rounded bg-red-600 px-2 py-0.5 text-xs font-bold text-white">GROUNDED</span>}
      </div>
      <p className="text-sm text-gray-600 dark:text-gray-400">
        {vehicle.model ?? 'Model not recorded'} · {vehicle.capacity ?? '—'} seats · {route ? `Route ${route.number ?? ''} ${route.name ?? ''}` : 'No active route'}
      </p>
      {driver ? (
        <p className="flex flex-wrap items-center gap-2 text-sm">Driver: <b>{driver.name}</b>
          {driver.phone && <a href={`tel:${driver.phone}`} className="inline-flex items-center gap-1 text-green-700 hover:underline dark:text-green-400"><Phone className="h-3.5 w-3.5" />{driver.phone}</a>}
        </p>
      ) : <p className="text-sm text-amber-700 dark:text-amber-400">No driver linked to this bus's route</p>}
      {overview?.route && (overview.route.start || overview.route.end) && (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {overview.route.start ?? '—'} → {overview.route.end ?? '—'}
          {' · '}Dep {fmtTime(overview.route.departure)} · Arr {fmtTime(overview.route.arrival)}
        </p>
      )}
      {overview && <p className="text-sm text-gray-600 dark:text-gray-400">{driverTripLine(overview.driverTrip)}</p>}
      {!overview && overviewError && <p className="text-xs text-red-600 dark:text-red-400">Could not load route/trip details</p>}
      <div className="flex flex-wrap gap-2">
        {vehicle.docs.map((d) => (
          <span key={d.key} title={fmt(d.expiry)} className={`rounded-full px-2.5 py-1 text-xs font-medium ${TONE[d.tone]}`}>
            {d.label}: {d.tone === 'missing' ? 'not recorded' : d.tone === 'expired' ? `expired ${fmt(d.expiry)}` : fmt(d.expiry)}
          </span>
        ))}
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Last inspection: {previous ? `${fmt(previous.submittedAt)} (${previous.result.replace(/_/g, ' ')})` : 'none'}
        {' · '}Location check: {detail.location.status === 'ok' ? `${detail.location.distanceM} m from bus GPS` : detail.location.status === 'bus_no_gps' ? 'bus has no GPS fix' : 'location not shared'}
      </p>
    </section>
  );
}
