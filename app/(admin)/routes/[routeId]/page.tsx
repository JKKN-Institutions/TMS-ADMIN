'use client';

import { use, useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { MapPin, Navigation, Pencil, Users } from 'lucide-react';
import { DetailPageHeader, SectionCard, Field } from '@/components/ui/detail-view';
import { DataTable } from '@/components/ui/data-table';
import { stopColumns, fmtTime, STOP_TYPE_OPTIONS, type RouteStop } from './stops-columns';

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
  _vehicleCapacity?: number | null;
  _passengerCount?: number;
  _staffCount?: number;
}

interface DriverOption { id: string; name?: string | null }
interface VehicleOption { id: string; registration_number?: string | null; vehicle_number?: string | null }

// Occupancy "{riders} / {seats}". Riders = passengers = learners + staff (both
// occupy a seat), counted live by the API. Seats come from the assigned vehicle
// (tms_route's total_capacity is 0 for most routes).
function capacityLabel(route: RouteDetail): string {
  const riders = (route._passengerCount ?? 0) + (route._staffCount ?? 0);
  const seats =
    route._vehicleCapacity ??
    (route.total_capacity && route.total_capacity > 0 ? route.total_capacity : null);
  if (seats != null) return `${riders} / ${seats}`;
  return `${riders} rider${riders === 1 ? '' : 's'}`;
}

async function fetchRouteDetail(id: string): Promise<RouteDetail> {
  const res = await fetch(`/api/admin/routes/${id}`);
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load route');
  return json.data as RouteDetail;
}

// Same queryKey/shape as the Drivers and Vehicles list pages, so this page's
// parallel lookups can share their cache instead of always re-fetching.
async function fetchDrivers(): Promise<DriverOption[]> {
  const res = await fetch('/api/admin/drivers');
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to fetch drivers');
  return json.data as DriverOption[];
}

async function fetchVehicles(): Promise<VehicleOption[]> {
  const res = await fetch('/api/admin/vehicles');
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to fetch vehicles');
  return (json.data || []) as VehicleOption[];
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

  // Three independent queries fetched in PARALLEL — previously the route load
  // waited on a driver lookup, which then waited on a vehicle lookup (a
  // waterfall). Driver/vehicle names are derived below once all three land.
  const {
    data: route,
    isLoading: routeLoading,
    isError: routeIsError,
  } = useQuery({
    queryKey: ['route', routeId],
    queryFn: () => fetchRouteDetail(routeId),
    enabled: !!routeId,
  });

  const { data: drivers = [], isLoading: driversLoading } = useQuery({
    queryKey: ['drivers'],
    queryFn: fetchDrivers,
  });

  const { data: vehicles = [], isLoading: vehiclesLoading } = useQuery({
    queryKey: ['vehicles'],
    queryFn: fetchVehicles,
  });

  // Pre-sorted by sequence: the table has no default-sort prop, so data order
  // IS the default order. Memoised (before the early returns) so the table
  // isn't handed a fresh array on every render.
  const stops = useMemo(
    () => (route?.route_stops ?? []).slice().sort((a, b) => a.sequence_order - b.sequence_order),
    [route]
  );

  const loading = routeLoading || driversLoading || vehiclesLoading;
  const error = routeIsError;

  // Resolve driver / vehicle display names (loose refs, same approach as the old modal).
  const driverName = route?.driver_id
    ? drivers.find((d) => d.id === route.driver_id)?.name ?? null
    : null;
  const vehicleReg = route?.vehicle_id
    ? (() => {
        const found = vehicles.find((v) => v.id === route.vehicle_id);
        return found?.registration_number ?? found?.vehicle_number ?? null;
      })()
    : null;

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
          <Field
            label="Passengers"
            value={
              <Link
                href={`/routes/${route.id}/passengers`}
                className="inline-flex items-center gap-1.5 text-green-700 hover:underline dark:text-green-400"
              >
                <Users className="h-4 w-4" />
                {capacityLabel(route)}
                <span className="text-xs font-normal text-gray-400">· view learners &amp; staff</span>
              </Link>
            }
          />
          <Field label="Status" value={<StatusBadge status={route.status} />} />
        </div>
      </SectionCard>

      <SectionCard title="Assignment">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Driver" value={driverName || (route.driver_id ? route.driver_id : 'Unassigned')} />
          <Field label="Vehicle" value={vehicleReg || (route.vehicle_id ? route.vehicle_id : 'Unassigned')} />
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
          <DataTable
            columns={stopColumns}
            data={stops}
            entityName="stops"
            searchPlaceholder="Search stop name or time…"
            pinFirstColumn={false}
            getRowId={(s) => s.id}
            filters={stops.some((s) => s.is_major_stop) ? [{ columnId: 'type', title: 'Type', options: STOP_TYPE_OPTIONS }] : []}
            emptyMessage="No stops match."
          />
        )}
      </SectionCard>
    </div>
  );
}
