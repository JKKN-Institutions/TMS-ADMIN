'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface DriverMe {
  licenseNumber: string | null;
  licenseExpiry: string | null;
  status: string | null;
  experienceYears: number | null;
  rating: number | null;
  totalTrips: number | null;
  assignedRouteId: string | null;
  routeLabel: string | null;
}
type Resp = { data?: DriverMe; notFound?: boolean };

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
