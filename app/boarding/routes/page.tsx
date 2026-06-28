'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ListChecks, QrCode, Route as RouteIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RouteTicket, RouteNotice } from '@/components/routes/route-ticket';
import type { RouteDetail } from '@/lib/routes/detail';

async function fetchBoardingRoutes(): Promise<RouteDetail[]> {
  const res = await fetch('/api/boarding/routes', { cache: 'no-store', credentials: 'same-origin' });
  if (!res.ok) throw new Error('Failed to load routes');
  const json = await res.json();
  return (json.data?.routes ?? []) as RouteDetail[];
}

/** Pill selector shown only when a staffer supervises more than one route. */
function RouteSelector({
  routes, selectedId, onSelect,
}: {
  routes: RouteDetail[]; selectedId: string; onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">Routes</span>
      {routes.map((r) => {
        const active = r.id === selectedId;
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => onSelect(r.id)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
              active
                ? 'border-green-600 bg-green-600 text-white'
                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800'
            )}
          >
            <RouteIcon className="h-3.5 w-3.5" />
            {r.routeNumber ?? '—'}
          </button>
        );
      })}
    </div>
  );
}

export default function BoardingRoutesPage() {
  const { data: routes, isLoading, error } = useQuery({ queryKey: ['boarding-routes'], queryFn: fetchBoardingRoutes });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = useMemo(() => {
    const list = routes ?? [];
    if (list.length === 0) return null;
    return list.find((r) => r.id === selectedId) ?? list[0];
  }, [routes, selectedId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-300 border-t-green-600" />
      </div>
    );
  }

  if (error) {
    return (
      <RouteNotice
        tone="red"
        icon={AlertTriangle}
        title="Couldn't load your route"
        body="Something went wrong while loading your route. Please refresh the page or try again shortly."
      />
    );
  }

  if (!selected) {
    return (
      <RouteNotice
        tone="amber"
        icon={RouteIcon}
        title="No route assigned"
        body="You're not assigned to a transport route yet. Ask an admin to assign you to a route, then it will appear here."
      />
    );
  }

  return (
    <div className="space-y-6">
      {(routes?.length ?? 0) > 1 && (
        <RouteSelector routes={routes!} selectedId={selected.id} onSelect={setSelectedId} />
      )}

      <RouteTicket
        route={selected}
        actions={
          <>
            <Link
              href={`/boarding/routes/${selected.id}`}
              className="inline-flex items-center gap-2 rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-green-700 shadow-sm transition-colors hover:bg-white/90"
            >
              <ListChecks className="h-4 w-4" /> Open today's roster
            </Link>
            <Link
              href="/boarding/scan"
              className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-3.5 py-2 text-sm font-semibold text-white ring-1 ring-white/40 backdrop-blur transition-colors hover:bg-white/30"
            >
              <QrCode className="h-4 w-4" /> Scan
            </Link>
          </>
        }
      />
    </div>
  );
}
