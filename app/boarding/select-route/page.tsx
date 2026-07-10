'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bus, Check, Loader2, MapPin, Clock, Users, Lock } from 'lucide-react';
import toast from 'react-hot-toast';

interface AvailableRoute {
  id: string;
  route_number: string | null;
  route_name: string | null;
  start_location: string | null;
  end_location: string | null;
  departure_time: string | null;
  arrival_time: string | null;
  total_capacity: number | null;
  current_passengers: number | null;
}

export default function SelectRoutePage() {
  const router = useRouter();
  const [routes, setRoutes] = useState<AvailableRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // If they already have a route, the picker is locked (no self-switch).
        const accessRes = await fetch('/api/boarding/access', { cache: 'no-store', credentials: 'same-origin' });
        const accessJson = await accessRes.json().catch(() => ({}));
        if (!cancelled && (accessJson?.data?.assignedRouteCount ?? 0) > 0) {
          setLocked(true);
          setLoading(false);
          return;
        }

        const res = await fetch('/api/boarding/available-routes', { cache: 'no-store', credentials: 'same-origin' });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load routes');
        if (!cancelled) setRoutes((json.data ?? []) as AvailableRoute[]);
      } catch (e) {
        if (!cancelled) {
          console.error('select-route load error:', e);
          toast.error('Failed to load routes');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleConfirm = async () => {
    if (!selectedId) return toast.error('Please select a bus/route first');
    setSaving(true);
    try {
      const res = await fetch('/api/boarding/self-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ routeId: selectedId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to select route');
      toast.success('You are now the in-charge of this bus');
      router.replace('/boarding/scan');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to select route');
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    );
  }

  if (locked) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
          <Lock className="h-6 w-6 text-gray-400" />
        </div>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Your route is set</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          You&apos;re already the in-charge of a bus. Contact an admin to change your route.
        </p>
        <button
          onClick={() => router.replace('/boarding/scan')}
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
        >
          Go to boarding
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-green-600">
          <Bus className="h-6 w-6 text-white" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Choose your bus</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Pick the bus you&apos;re in-charge of. You can only choose once — an admin can change it later.
        </p>
      </div>

      {routes.length === 0 ? (
        <p className="text-center text-sm text-gray-500">No active routes are available right now.</p>
      ) : (
        <div className="space-y-3">
          {routes.map((r) => {
            const active = r.id === selectedId;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedId(r.id)}
                className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors ${
                  active
                    ? 'border-green-600 bg-green-50 dark:bg-green-500/10'
                    : 'border-gray-200 bg-white hover:border-green-300 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-green-500/40'
                }`}
              >
                <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                  active ? 'border-green-600 bg-green-600 text-white' : 'border-gray-300 text-transparent'
                }`}>
                  <Check className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900 dark:text-white">{r.route_name || 'Route'}</span>
                    <span className="font-mono text-xs text-gray-500">{r.route_number || '—'}</span>
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                    <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{r.start_location || '—'} → {r.end_location || '—'}</span>
                    <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{r.departure_time || '—'} – {r.arrival_time || '—'}</span>
                    <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{r.current_passengers ?? 0}/{r.total_capacity ?? 0}</span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <button
          onClick={handleConfirm}
          disabled={saving || !selectedId}
          className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {saving ? 'Setting…' : "I'm the in-charge of this bus"}
        </button>
      </div>
    </div>
  );
}
