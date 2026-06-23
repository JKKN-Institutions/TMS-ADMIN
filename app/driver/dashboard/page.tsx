'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface DriverStop {
  id: string;
  name: string;
  time: string | null; // morning / inbound (to-college) pickup
  eveningTime: string | null; // evening / outbound (from-college) drop
  order: number | null;
  isMajor: boolean | null;
}
interface DriverMe {
  licenseNumber: string | null;
  licenseExpiry: string | null;
  status: string | null;
  experienceYears: number | null;
  rating: number | null;
  totalTrips: number | null;
  assignedRouteId: string | null;
  routeLabel: string | null;
  stops: DriverStop[];
}
type Resp = { data?: DriverMe; notFound?: boolean };

/** 'HH:MM:SS' / 'HH:MM' → '7:30 AM'; '—' when missing. */
function fmtTime(t: string | null): string {
  if (!t) return '—';
  const [hStr, mStr] = t.split(':');
  const h = parseInt(hStr, 10);
  if (Number.isNaN(h)) return t;
  const minute = mStr ?? '00';
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${minute} ${ampm}`;
}

async function fetchMe(): Promise<Resp> {
  const res = await fetch('/api/driver/me', { cache: 'no-store', credentials: 'same-origin' });
  if (res.status === 404) return { notFound: true };
  if (!res.ok) throw new Error('Failed to load driver profile');
  return { data: (await res.json()).data as DriverMe };
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-medium break-words">{value}</span>
    </div>
  );
}

export default function DriverDashboardPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ['driver-me'], queryFn: fetchMe });

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (error) return <div className="text-destructive">Could not load your driver profile.</div>;
  if (data?.notFound || !data?.data) {
    return (
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Driver profile not found</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          We couldn&apos;t find a driver record linked to your account. Please contact the
          transport office.
        </CardContent>
      </Card>
    );
  }

  const me = data.data;
  const stops = me.stops ?? [];
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">Driver Dashboard</h1>

      <Card>
        <CardHeader>
          <CardTitle>Assigned route</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {me.routeLabel ? (
            <p className="font-medium">{me.routeLabel}</p>
          ) : (
            <p className="text-muted-foreground">No route assigned yet.</p>
          )}
        </CardContent>
      </Card>

      {me.routeLabel && (
        <Card>
          <CardHeader>
            <CardTitle>Route timetable ({stops.length} stops)</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {stops.length === 0 ? (
              <p className="text-muted-foreground">No stops configured for this route yet.</p>
            ) : (
              <ol className="divide-y divide-border">
                {stops.map((s, i) => (
                  <li key={s.id} className="flex items-center gap-3 py-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                      {s.order ?? i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {s.name}
                      {s.isMajor && (
                        <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
                          Major
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-right tabular-nums text-muted-foreground">
                      <span className="block">
                        <span className="mr-1 text-[10px] uppercase tracking-wide text-gray-400">Morning</span>
                        {fmtTime(s.time)}
                      </span>
                      <span className="block">
                        <span className="mr-1 text-[10px] uppercase tracking-wide text-gray-400">Evening</span>
                        {fmtTime(s.eveningTime)}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>My details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <Field label="Status" value={me.status ?? '—'} />
          <Field label="License" value={me.licenseNumber ?? '—'} />
          <Field label="License expiry" value={me.licenseExpiry ?? '—'} />
          <Field
            label="Experience"
            value={me.experienceYears != null ? `${me.experienceYears} yrs` : '—'}
          />
          <Field label="Rating" value={me.rating != null ? String(me.rating) : '—'} />
          <Field label="Total trips" value={me.totalTrips != null ? String(me.totalTrips) : '—'} />
        </CardContent>
      </Card>
    </div>
  );
}
