'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Route as RouteIcon } from 'lucide-react';
import { Spinner, NoticeCard, PageHeader } from '@/components/driver/ui';
import { RouteCard, type DriverRouteDTO } from '@/components/driver/route-card';

type Resp = { data?: { routes: DriverRouteDTO[] }; notFound?: boolean };

async function fetchRoutes(): Promise<Resp> {
  const res = await fetch('/api/driver/routes', { cache: 'no-store', credentials: 'same-origin' });
  if (res.status === 404) return { notFound: true };
  if (!res.ok) throw new Error('Failed to load routes');
  return { data: (await res.json()).data as { routes: DriverRouteDTO[] } };
}

export default function DriverRoutesPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ['driver-routes'], queryFn: fetchRoutes });

  if (isLoading) return <Spinner />;
  if (error) {
    return (
      <NoticeCard
        tone="red"
        icon={AlertTriangle}
        title="Couldn't load your routes"
        body="Something went wrong loading your routes. Please refresh or try again shortly."
      />
    );
  }
  if (data?.notFound) {
    return (
      <NoticeCard
        tone="amber"
        icon={AlertTriangle}
        title="Driver profile not found"
        body="We couldn't find a driver record linked to your account. Please contact the transport office."
      />
    );
  }

  const routes = data?.data?.routes ?? [];
  if (routes.length === 0) {
    return (
      <NoticeCard
        tone="amber"
        icon={RouteIcon}
        title="No routes assigned"
        body="You have no routes assigned yet. Please contact the transport office."
      />
    );
  }

  return (
    <div className="space-y-8">
      {routes.length > 1 && (
        <PageHeader title="My Routes" subtitle={`You're assigned to ${routes.length} routes.`} />
      )}
      {routes.map((r) => (
        <RouteCard key={r.id} route={r} />
      ))}
    </div>
  );
}
