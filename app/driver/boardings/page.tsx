'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { istToday, addDays } from '@/lib/booking/window';

interface Rider { learner_id: string; name: string; roll: string | null }
interface StopGroup { stop_id: string | null; stop_name: string; stop_time: string | null; count: number; riders: Rider[] }
interface RouteBlock { id: string; label: string; counts: { booked: number; capacity: number }; stops: StopGroup[] }

const fmtDateLong = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });

export default function DriverBoardingsPage() {
  const today = istToday();
  const [date, setDate] = useState<string>(() => today);
  const [routes, setRoutes] = useState<RouteBlock[] | null>(null);
  const [activeRoute, setActiveRoute] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/driver/roster?date=${date}`, { cache: 'no-store', credentials: 'same-origin' });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load boardings');
        const rs = json.data.routes as RouteBlock[];
        setRoutes(rs);
        setActiveRoute((prev) => (prev && rs.some((r) => r.id === prev) ? prev : rs[0]?.id ?? null));
        setError(null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to load boardings';
        setError(msg);
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    })();
  }, [date]);

  const isToday = date === today;
  const current = routes?.find((r) => r.id === activeRoute) ?? routes?.[0] ?? null;

  return (
    <div className="space-y-6">
      {/* Date controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white p-1 dark:border-gray-700 dark:bg-gray-900">
          <button type="button" aria-label="Previous day" onClick={() => setDate((d) => addDays(d, -1))} className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value || today)} aria-label="Boardings date" className="cursor-pointer border-0 bg-transparent px-1 text-sm font-medium text-gray-900 focus:outline-none dark:text-gray-100" />
          <button type="button" aria-label="Next day" onClick={() => setDate((d) => addDays(d, 1))} className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        {!isToday && (
          <button type="button" onClick={() => setDate(today)} className="inline-flex h-9 items-center rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-blue-700 hover:bg-blue-50 dark:border-gray-700 dark:bg-gray-900 dark:text-blue-300">
            Today
          </button>
        )}
        <span className="text-sm text-gray-500">{fmtDateLong(date)}</span>
      </div>

      {/* Route selector (multi-route drivers) */}
      {routes && routes.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {routes.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setActiveRoute(r.id)}
              className={[
                'rounded-full px-3 py-1 text-sm font-medium',
                activeRoute === r.id ? 'bg-green-600 text-white' : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
              ].join(' ')}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-green-600" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">{error}</div>
      ) : !current ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">No route assigned to you.</div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <p className="min-w-0 truncate text-base font-semibold text-gray-900 dark:text-white">{current.label}</p>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700 dark:bg-green-500/15 dark:text-green-300">
              <Users className="h-4 w-4" /> {current.counts.booked} booked / {current.counts.capacity} seats
            </span>
          </div>

          {current.stops.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
              No students have booked for this day yet.
            </div>
          ) : (
            current.stops.map((st) => (
              <div key={st.stop_id ?? 'unset'} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                  <span className="min-w-0 truncate text-sm font-semibold text-gray-900 dark:text-white">
                    {st.stop_name}{st.stop_time ? ` · ${st.stop_time.slice(0, 5)}` : ''}
                  </span>
                  <span className="shrink-0 text-xs text-gray-500">{st.count} boarding</span>
                </div>
                <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                  {st.riders.map((r) => (
                    <li key={r.learner_id} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                      <span className="min-w-0 truncate text-gray-900 dark:text-gray-100">{r.name}</span>
                      {r.roll && <span className="shrink-0 text-gray-400">· {r.roll}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
