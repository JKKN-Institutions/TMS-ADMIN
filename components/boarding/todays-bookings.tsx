'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarCheck, ChevronRight, Users } from 'lucide-react';

interface Rider { learner_id: string; name: string; roll: string | null }
interface StopGroup { stop_id: string | null; stop_name: string; stop_time: string | null; count: number; riders: Rider[] }
interface RouteBlock { id: string; label: string; counts: { booked: number; capacity: number }; stops: StopGroup[] }

/** Deep-link a booked student to the scanner, pre-selected for a one-tap mark. */
function scanHref(routeId: string, r: Rider, stopName: string): string {
  const p = new URLSearchParams({ learner: r.learner_id, route: routeId, name: r.name });
  if (r.roll) p.set('roll', r.roll);
  if (stopName) p.set('stop', stopName);
  return `/boarding/scan?${p.toString()}`;
}

export default function TodaysBookings() {
  const [routes, setRoutes] = useState<RouteBlock[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/boarding/bookings-today', { cache: 'no-store', credentials: 'same-origin' });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load bookings');
        setRoutes(json.data.routes as RouteBlock[]);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load bookings');
      }
    })();
  }, []);

  const totalBooked = (routes ?? []).reduce((n, r) => n + r.counts.booked, 0);

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-200 bg-gradient-to-r from-green-50 to-emerald-50 px-6 py-4">
        <div className="flex items-center space-x-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/40">
            <CalendarCheck className="h-5 w-5 text-green-600 dark:text-green-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">Today&apos;s Bookings</h3>
        </div>
        <span className="text-sm text-gray-500">{totalBooked} booked</span>
      </div>
      <div className="space-y-6 p-6">
        {error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : !routes ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : totalBooked === 0 ? (
          <p className="text-sm text-gray-500">No students have booked for today yet.</p>
        ) : (
          routes
            .filter((r) => r.stops.length > 0)
            .map((rt) => (
              <div key={rt.id} className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="min-w-0 truncate text-sm font-semibold text-gray-900">{rt.label}</p>
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs text-gray-500">
                    <Users className="h-3.5 w-3.5" /> {rt.counts.booked}/{rt.counts.capacity}
                  </span>
                </div>
                {rt.stops.map((st) => (
                  <div key={st.stop_id ?? 'unset'} className="rounded-lg border border-gray-100 dark:border-gray-800">
                    <div className="flex items-center justify-between bg-gray-50 px-3 py-2 dark:bg-gray-800/50">
                      <span className="min-w-0 truncate text-sm font-medium text-gray-700 dark:text-gray-200">
                        {st.stop_name}{st.stop_time ? ` · ${st.stop_time.slice(0, 5)}` : ''}
                      </span>
                      <span className="shrink-0 text-xs text-gray-500">{st.count}</span>
                    </div>
                    <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                      {st.riders.map((r) => (
                        <li key={r.learner_id}>
                          <Link href={scanHref(rt.id, r, st.stop_name)} className="flex items-center justify-between px-3 py-2 hover:bg-green-50 dark:hover:bg-green-950/20">
                            <span className="min-w-0 truncate text-sm text-gray-900 dark:text-gray-100">
                              {r.name}{r.roll ? <span className="text-gray-500"> · {r.roll}</span> : null}
                            </span>
                            <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ))
        )}
      </div>
    </div>
  );
}
