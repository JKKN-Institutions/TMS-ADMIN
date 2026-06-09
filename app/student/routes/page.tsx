'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface Stop {
  id: string;
  name: string;
  time: string | null;
  order: number | null;
  isMajor: boolean | null;
}
interface RouteData {
  id: string;
  routeNumber: string;
  routeName: string;
  startLocation: string | null;
  endLocation: string | null;
  departureTime: string | null;
  arrivalTime: string | null;
  distance: number | null;
  duration: number | null;
  fare: number | null;
  status: string | null;
  driverName: string | null;
  vehicle: { registrationNumber: string; model: string | null; capacity: number | null } | null;
  stops: Stop[];
}
type RouteResp = {
  data?: { route: RouteData | null; boardingStopId: string | null };
  notFound?: boolean;
};

async function fetchRoute(): Promise<RouteResp> {
  const res = await fetch('/api/student/route', { cache: 'no-store', credentials: 'same-origin' });
  if (res.status === 404) return { notFound: true };
  if (!res.ok) throw new Error('Failed to load route');
  const json = await res.json();
  return { data: json.data };
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-medium break-words">{value}</span>
    </div>
  );
}

export default function StudentRoutesPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ['student-route'], queryFn: fetchRoute });

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (error) return <div className="text-destructive">Could not load your route.</div>;
  if (data?.notFound) {
    return (
      <div className="text-muted-foreground text-sm">
        No learner record is linked to your account yet.
      </div>
    );
  }

  const route = data?.data?.route ?? null;
  const boardingStopId = data?.data?.boardingStopId ?? null;

  if (!route) {
    return (
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>No route allocated</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          You don&apos;t have a transport route allocated yet. Once enrolled, your route
          and stops will appear here.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">My Route</h1>

      <Card>
        <CardHeader>
          <CardTitle>
            Route {route.routeNumber} · {route.routeName}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <Field label="From" value={route.startLocation ?? '—'} />
          <Field label="To" value={route.endLocation ?? '—'} />
          <Field label="Departure" value={route.departureTime ?? '—'} />
          <Field label="Arrival" value={route.arrivalTime ?? '—'} />
          <Field label="Fare" value={route.fare != null ? `₹${route.fare}` : '—'} />
          <Field label="Driver" value={route.driverName ?? '—'} />
          <Field
            label="Vehicle"
            value={
              route.vehicle
                ? `${route.vehicle.registrationNumber}${route.vehicle.model ? ` (${route.vehicle.model})` : ''}`
                : '—'
            }
          />
          <Field label="Status" value={route.status ?? '—'} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Stops</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <ol className="space-y-1">
            {route.stops.length === 0 && (
              <li className="text-muted-foreground">No stops listed.</li>
            )}
            {route.stops.map((s) => {
              const isBoarding = s.id === boardingStopId;
              return (
                <li
                  key={s.id}
                  className={cn(
                    'flex items-center justify-between rounded-md px-3 py-2',
                    isBoarding ? 'bg-primary/10 text-primary font-medium' : 'odd:bg-muted/40'
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-5 text-right">
                      {s.order ?? ''}
                    </span>
                    {s.name}
                    {isBoarding && (
                      <span className="text-[10px] uppercase tracking-wide">your stop</span>
                    )}
                  </span>
                  <span className="text-muted-foreground">{s.time ?? ''}</span>
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
