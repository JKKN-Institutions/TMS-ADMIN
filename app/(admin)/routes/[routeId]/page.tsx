'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { MapPin, Navigation, Pencil } from 'lucide-react';
import { DetailPageHeader, SectionCard, Field } from '@/components/ui/detail-view';

interface RouteStop {
  id: string;
  stop_name: string;
  stop_time: string; // morning / inbound (to-college) pickup
  evening_time?: string | null; // evening / outbound (from-college) drop
  sequence_order: number;
  is_major_stop: boolean;
  latitude?: number | null;
  longitude?: number | null;
}

interface RouteDetail {
  id: string;
  route_number: string;
  route_name: string;
  start_location?: string;
  end_location?: string;
  start_latitude?: number | null;
  start_longitude?: number | null;
  end_latitude?: number | null;
  end_longitude?: number | null;
  departure_time?: string;
  arrival_time?: string;
  distance?: number | string;
  duration?: string;
  total_capacity?: number;
  current_passengers?: number;
  fare?: number | string;
  status?: string;
  driver_id?: string | null;
  vehicle_id?: string | null;
  route_stops?: RouteStop[];
  _driverName?: string | null;
  _vehicleReg?: string | null;
  _vehicleCapacity?: number | null;
  _passengerCount?: number;
}

const fmtTime = (t?: string | null) => (t ? t.slice(0, 5) : '—');

// Occupancy "{riders} / {seats}". Seats come from the assigned vehicle (tms_route's
// total_capacity is 0 for most routes); riders are counted live by the API.
function capacityLabel(route: RouteDetail): string {
  const seats =
    route._vehicleCapacity ??
    (route.total_capacity && route.total_capacity > 0 ? route.total_capacity : null);
  if (seats != null) return `${route._passengerCount ?? 0} / ${seats}`;
  return route._passengerCount != null ? `${route._passengerCount} riders` : '—';
}

async function fetchRouteDetail(id: string): Promise<RouteDetail> {
  const res = await fetch(`/api/admin/routes/${id}`);
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load route');
  const route: RouteDetail = json.data;

  // Resolve driver / vehicle display names (loose refs, same approach as the old modal).
  if (route.driver_id) {
    try {
      const d = await (await fetch('/api/admin/drivers')).json();
      if (d.success) route._driverName = d.data.find((x: { id: string }) => x.id === route.driver_id)?.name ?? null;
    } catch {
      /* non-fatal */
    }
  }
  if (route.vehicle_id) {
    try {
      const v = await (await fetch('/api/admin/vehicles')).json();
      if (v.success) {
        const found = v.data.find((x: { id: string }) => x.id === route.vehicle_id);
        route._vehicleReg = found?.registration_number ?? found?.vehicle_number ?? null;
      }
    } catch {
      /* non-fatal */
    }
  }
  return route;
}

function StatusBadge({ status }: { status?: string }) {
  const map: Record<string, string> = {
    active: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
    maintenance: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-400',
    inactive: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
  };
  const cls = map[status ?? ''] ?? 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${cls}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {status ?? 'unknown'}
    </span>
  );
}

const crumbs = (label: string) => [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Routes', href: '/routes' },
  { label },
];

export default function RouteViewPage({ params }: { params: Promise<{ routeId: string }> }) {
  const { routeId } = use(params);
  const [route, setRoute] = useState<RouteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchRouteDetail(routeId)
      .then((r) => active && setRoute(r))
      .catch((e) => active && setError(e instanceof Error ? e.message : 'Failed to load route'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [routeId]);

  if (loading) {
    return (
      <div className="space-y-6">
        <DetailPageHeader crumbs={crumbs('Loading…')} backHref="/routes" title="Loading…" />
        <div className="h-40 animate-pulse rounded-xl border border-gray-200 bg-white" />
      </div>
    );
  }

  if (error || !route) {
    return (
      <div className="space-y-6">
        <DetailPageHeader crumbs={crumbs('Not found')} backHref="/routes" title="Route not found" />
        <p className="text-gray-600">
          This route could not be loaded.{' '}
          <Link href="/routes" className="text-green-700 hover:underline">Back to routes</Link>
        </p>
      </div>
    );
  }

  const stops = (route.route_stops ?? []).slice().sort((a, b) => a.sequence_order - b.sequence_order);
  const hasGps = !!(route.start_latitude && route.start_longitude);

  return (
    <div className="space-y-6">
      <DetailPageHeader
        crumbs={crumbs(`Route ${route.route_number}`)}
        backHref="/routes"
        title={`Route ${route.route_number}`}
        subtitle={route.route_name}
        actions={
          <>
            <StatusBadge status={route.status} />
            {hasGps && (
              <Link
                href="/track-all"
                className="inline-flex h-[38px] items-center gap-2 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                <Navigation className="h-4 w-4" /> Live track
              </Link>
            )}
            <Link
              href={`/routes/${route.id}/edit`}
              className="inline-flex h-[38px] items-center gap-2 rounded-lg bg-green-600 px-3 text-sm font-medium text-white transition-colors hover:bg-green-700"
            >
              <Pencil className="h-4 w-4" /> Edit
            </Link>
          </>
        }
      />

      <SectionCard title="Route information">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Start location" value={route.start_location} />
          <Field label="End location" value={route.end_location} />
          <Field label="Departure" value={fmtTime(route.departure_time)} />
          <Field label="Arrival" value={fmtTime(route.arrival_time)} />
          <Field label="Distance" value={route.distance ? `${route.distance} km` : ''} />
          <Field label="Duration" value={route.duration} />
          <Field label="Fare" value={route.fare ? `₹${route.fare}` : ''} />
          <Field label="Capacity" value={capacityLabel(route)} />
          <Field label="Status" value={<StatusBadge status={route.status} />} />
        </div>
      </SectionCard>

      <SectionCard title="Assignment">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Driver" value={route._driverName || (route.driver_id ? route.driver_id : 'Unassigned')} />
          <Field label="Vehicle" value={route._vehicleReg || (route.vehicle_id ? route.vehicle_id : 'Unassigned')} />
        </div>
      </SectionCard>

      {(route.start_latitude || route.end_latitude) && (
        <SectionCard title="GPS coordinates">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Start (lat, lng)"
              value={route.start_latitude && route.start_longitude ? `${route.start_latitude}, ${route.start_longitude}` : ''}
            />
            <Field
              label="End (lat, lng)"
              value={route.end_latitude && route.end_longitude ? `${route.end_latitude}, ${route.end_longitude}` : ''}
            />
          </div>
        </SectionCard>
      )}

      <SectionCard title={`Stops (${stops.length})`}>
        {stops.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-gray-500">
            <MapPin className="h-4 w-4 text-gray-400" /> No stops configured for this route.
          </p>
        ) : (
          <ol className="space-y-2">
            {stops.map((s, i) => (
              <li key={s.id} className="flex items-center gap-3 rounded-lg border border-gray-200 px-4 py-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs font-semibold text-green-700 dark:bg-green-500/20 dark:text-green-300">
                  {s.sequence_order ?? i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-gray-900">{s.stop_name}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs">
                    <span className="text-gray-600 dark:text-gray-300">
                      <span className="text-gray-400 dark:text-gray-500">Morning</span> {fmtTime(s.stop_time)}
                    </span>
                    <span className="text-gray-600 dark:text-gray-300">
                      <span className="text-gray-400 dark:text-gray-500">Evening</span> {fmtTime(s.evening_time)}
                    </span>
                  </div>
                </div>
                {s.is_major_stop && (
                  <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
                    Major
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}
      </SectionCard>
    </div>
  );
}
