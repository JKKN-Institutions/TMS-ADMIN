'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Clock, Loader2, MapPin, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { DetailPageHeader, SectionCard } from '@/components/ui/detail-view';
import { SelectMenu } from '@/components/ui/select-menu';
import PossibleStopsManager from '@/components/possible-stops-manager';

interface Stop {
  id?: string;
  stop_name: string;
  stop_time: string;
  sequence_order: number;
  is_major_stop: boolean;
}

interface FormState {
  route_number: string;
  route_name: string;
  start_location: string;
  end_location: string;
  start_latitude: string;
  start_longitude: string;
  end_latitude: string;
  end_longitude: string;
  departure_time: string;
  arrival_time: string;
  distance: string;
  duration: string;
  total_capacity: string;
  fare: string;
  driver_id: string;
  vehicle_id: string;
  status: string;
}

const EMPTY: FormState = {
  route_number: '', route_name: '', start_location: '', end_location: '',
  start_latitude: '', start_longitude: '', end_latitude: '', end_longitude: '',
  departure_time: '', arrival_time: '', distance: '', duration: '',
  total_capacity: '', fare: '', driver_id: '', vehicle_id: '', status: 'active',
};

const t5 = (t?: string) => (t ? t.slice(0, 5) : '');

const crumbs = (label: string, routeId: string) => [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Routes', href: '/routes' },
  { label, href: `/routes/${routeId}` },
  { label: 'Edit' },
];

export default function RouteEditPage({ params }: { params: Promise<{ routeId: string }> }) {
  const { routeId } = use(params);
  const router = useRouter();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [routeNumber, setRouteNumber] = useState('');
  const [drivers, setDrivers] = useState<{ id: string; name: string }[]>([]);
  const [vehicles, setVehicles] = useState<{ id: string; label: string }[]>([]);
  const [stops, setStops] = useState<Stop[]>([]);
  const [newStop, setNewStop] = useState({ stop_name: '', stop_time: '', is_major_stop: false });
  const [insertAfter, setInsertAfter] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [stopBusy, setStopBusy] = useState(false);

  const set = (k: keyof FormState, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const loadStops = async () => {
    const res = await fetch('/api/admin/routes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'getRouteStops', routeId }),
    });
    const json = await res.json();
    setStops(json.success ? json.data : []);
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/admin/routes/${routeId}`);
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load route');
        const r = json.data;
        if (!active) return;
        setRouteNumber(r.route_number);
        setForm({
          route_number: r.route_number ?? '',
          route_name: r.route_name ?? '',
          start_location: r.start_location ?? '',
          end_location: r.end_location ?? '',
          start_latitude: r.start_latitude?.toString() ?? '',
          start_longitude: r.start_longitude?.toString() ?? '',
          end_latitude: r.end_latitude?.toString() ?? '',
          end_longitude: r.end_longitude?.toString() ?? '',
          departure_time: t5(r.departure_time),
          arrival_time: t5(r.arrival_time),
          distance: r.distance?.toString() ?? '',
          duration: r.duration ?? '',
          total_capacity: r.total_capacity?.toString() ?? '',
          fare: r.fare?.toString() ?? '',
          driver_id: r.driver_id ?? '',
          vehicle_id: r.vehicle_id ?? '',
          status: r.status ?? 'active',
        });
        setStops((r.route_stops ?? []).map((s: Stop) => ({ ...s, stop_time: t5(s.stop_time) })));

        // Assignment dropdown options (best-effort).
        try {
          const d = await (await fetch('/api/admin/drivers')).json();
          if (active && d.success) setDrivers(d.data.map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })));
        } catch { /* non-fatal */ }
        try {
          const v = await (await fetch('/api/admin/vehicles')).json();
          if (active && v.success) {
            setVehicles(
              v.data.map((x: { id: string; registration_number?: string; vehicle_number?: string; model?: string }) => ({
                id: x.id,
                label: `${x.registration_number || x.vehicle_number || x.id}${x.model ? ` — ${x.model}` : ''}`,
              }))
            );
          }
        } catch { /* non-fatal */ }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Failed to load route');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [routeId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.route_number.trim() || !form.route_name.trim()) {
      toast.error('Route number and name are required');
      return;
    }
    if (form.departure_time && form.arrival_time && form.departure_time >= form.arrival_time) {
      toast.error('Arrival time must be after departure time');
      return;
    }
    setSaving(true);
    try {
      const routeData = {
        route_number: form.route_number,
        route_name: form.route_name,
        start_location: form.start_location,
        end_location: form.end_location,
        start_latitude: form.start_latitude ? parseFloat(form.start_latitude) : null,
        start_longitude: form.start_longitude ? parseFloat(form.start_longitude) : null,
        end_latitude: form.end_latitude ? parseFloat(form.end_latitude) : null,
        end_longitude: form.end_longitude ? parseFloat(form.end_longitude) : null,
        departure_time: form.departure_time,
        arrival_time: form.arrival_time,
        distance: form.distance ? Number(form.distance) : 0,
        duration: form.duration,
        total_capacity: form.total_capacity ? Number(form.total_capacity) : 0,
        fare: form.fare ? Number(form.fare) : 0,
        status: form.status,
        driver_id: form.driver_id || null,
        vehicle_id: form.vehicle_id || null,
      };
      const res = await fetch('/api/admin/routes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routeId, routeData }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to update route');
      toast.success('Route updated');
      router.push(`/routes/${routeId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update route');
    } finally {
      setSaving(false);
    }
  };

  const addStop = async () => {
    if (!newStop.stop_name.trim() || !newStop.stop_time) {
      toast.error('Enter a stop name and time');
      return;
    }
    setStopBusy(true);
    try {
      const insertAfterSequence = insertAfter ? stops.find((s) => s.id === insertAfter)?.sequence_order : undefined;
      const res = await fetch(`/api/admin/routes/${routeId}/stops`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stopData: { stop_name: newStop.stop_name.trim(), stop_time: newStop.stop_time, is_major_stop: newStop.is_major_stop },
          insertAfterSequence,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to add stop');
      setNewStop({ stop_name: '', stop_time: '', is_major_stop: false });
      setInsertAfter('');
      await loadStops();
      toast.success('Stop added');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add stop');
    } finally {
      setStopBusy(false);
    }
  };

  const deleteStop = async (stop: Stop) => {
    if (!stop.id || !confirm(`Delete the stop "${stop.stop_name}"?`)) return;
    setStopBusy(true);
    try {
      const res = await fetch(`/api/admin/routes/${routeId}/stops?stopId=${stop.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to delete stop');
      await loadStops();
      toast.success('Stop deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete stop');
    } finally {
      setStopBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <DetailPageHeader crumbs={crumbs('Loading…', routeId)} backHref={`/routes/${routeId}`} title="Edit Route" />
        <div className="h-40 animate-pulse rounded-xl border border-gray-200 bg-white" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <DetailPageHeader crumbs={crumbs('Not found', routeId)} backHref="/routes" title="Route not found" />
        <p className="text-gray-600">
          {error}. <Link href="/routes" className="text-green-700 hover:underline">Back to routes</Link>
        </p>
      </div>
    );
  }

  const field = 'block text-sm';
  const labelText = 'text-gray-600';

  return (
    <div className="space-y-6">
      <DetailPageHeader
        crumbs={crumbs(`Route ${routeNumber}`, routeId)}
        backHref={`/routes/${routeId}`}
        title={`Edit Route ${routeNumber}`}
        subtitle="Update route details, assignment and stops"
      />

      <form onSubmit={handleSave} className="space-y-6">
        <SectionCard title="Route details">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className={field}><span className={labelText}>Route Number</span><input className="input mt-1" value={form.route_number} onChange={(e) => set('route_number', e.target.value)} /></label>
            <label className={field}><span className={labelText}>Route Name</span><input className="input mt-1" value={form.route_name} onChange={(e) => set('route_name', e.target.value)} /></label>
            <label className={field}><span className={labelText}>Start Location</span><input className="input mt-1" value={form.start_location} onChange={(e) => set('start_location', e.target.value)} /></label>
            <label className={field}><span className={labelText}>End Location</span><input className="input mt-1" value={form.end_location} onChange={(e) => set('end_location', e.target.value)} /></label>
            <label className={field}><span className={labelText}>Departure Time</span><input type="time" className="input mt-1" value={form.departure_time} onChange={(e) => set('departure_time', e.target.value)} /></label>
            <label className={field}><span className={labelText}>Arrival Time</span><input type="time" className="input mt-1" value={form.arrival_time} onChange={(e) => set('arrival_time', e.target.value)} /></label>
            <label className={field}><span className={labelText}>Distance (km)</span><input type="number" min="0" className="input mt-1" value={form.distance} onChange={(e) => set('distance', e.target.value)} /></label>
            <label className={field}><span className={labelText}>Duration</span><input className="input mt-1" placeholder="1h 30m" value={form.duration} onChange={(e) => set('duration', e.target.value)} /></label>
            <label className={field}><span className={labelText}>Total Capacity</span><input type="number" min="0" className="input mt-1" value={form.total_capacity} onChange={(e) => set('total_capacity', e.target.value)} /></label>
            <label className={field}><span className={labelText}>Monthly Fare (₹)</span><input type="number" min="0" className="input mt-1" value={form.fare} onChange={(e) => set('fare', e.target.value)} /></label>
            <label className={field}>
              <span className={labelText}>Status</span>
              <select className="input mt-1" value={form.status} onChange={(e) => set('status', e.target.value)}>
                <option value="active">Active</option>
                <option value="maintenance">Maintenance</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
          </div>
        </SectionCard>

        <SectionCard title="GPS coordinates (optional)">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className={field}><span className={labelText}>Start Latitude</span><input className="input mt-1" value={form.start_latitude} onChange={(e) => set('start_latitude', e.target.value)} /></label>
            <label className={field}><span className={labelText}>Start Longitude</span><input className="input mt-1" value={form.start_longitude} onChange={(e) => set('start_longitude', e.target.value)} /></label>
            <label className={field}><span className={labelText}>End Latitude</span><input className="input mt-1" value={form.end_latitude} onChange={(e) => set('end_latitude', e.target.value)} /></label>
            <label className={field}><span className={labelText}>End Longitude</span><input className="input mt-1" value={form.end_longitude} onChange={(e) => set('end_longitude', e.target.value)} /></label>
          </div>
        </SectionCard>

        <SectionCard title="Assignment">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className={field}>
              <span className={labelText}>Driver</span>
              <SelectMenu
                className="mt-1"
                ariaLabel="Driver"
                value={form.driver_id}
                onValueChange={(v) => set('driver_id', v)}
                placeholder="Unassigned"
                options={[{ value: '', label: 'Unassigned' }, ...drivers.map((d) => ({ value: d.id, label: d.name }))]}
              />
            </div>
            <div className={field}>
              <span className={labelText}>Vehicle</span>
              <SelectMenu
                className="mt-1"
                ariaLabel="Vehicle"
                value={form.vehicle_id}
                onValueChange={(v) => set('vehicle_id', v)}
                placeholder="Unassigned"
                options={[{ value: '', label: 'Unassigned' }, ...vehicles.map((v) => ({ value: v.id, label: v.label }))]}
              />
            </div>
          </div>
        </SectionCard>

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={() => router.push(`/routes/${routeId}`)} disabled={saving}>
            Cancel
          </button>
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
            disabled={saving}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>

      <SectionCard title={`Stops (${stops.length})`}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
          <input className="input sm:col-span-4" placeholder="Stop name" value={newStop.stop_name} onChange={(e) => setNewStop((p) => ({ ...p, stop_name: e.target.value }))} />
          <input type="time" className="input sm:col-span-2" value={newStop.stop_time} onChange={(e) => setNewStop((p) => ({ ...p, stop_time: e.target.value }))} />
          <select className="input sm:col-span-3" value={insertAfter} onChange={(e) => setInsertAfter(e.target.value)}>
            <option value="">Add to end</option>
            {stops.map((s) => <option key={s.id} value={s.id}>After: {s.stop_name}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-sm sm:col-span-2">
            <input type="checkbox" checked={newStop.is_major_stop} onChange={(e) => setNewStop((p) => ({ ...p, is_major_stop: e.target.checked }))} /> Major
          </label>
          <button
            type="button"
            onClick={addStop}
            disabled={stopBusy}
            className="inline-flex items-center justify-center gap-1 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50 sm:col-span-1"
          >
            {stopBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {stops.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-gray-500">
              <MapPin className="h-4 w-4 text-gray-400" /> No stops yet.
            </p>
          ) : (
            stops.map((s, i) => (
              <div key={s.id ?? i} className="flex items-center gap-3 rounded-lg border border-gray-200 px-4 py-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs font-semibold text-green-700 dark:bg-green-500/20 dark:text-green-300">
                  {s.sequence_order ?? i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-gray-900">{s.stop_name}</p>
                  <p className="flex items-center gap-1 text-xs text-gray-500"><Clock className="h-3 w-3" /> {s.stop_time}</p>
                </div>
                {s.is_major_stop && (
                  <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">Major</span>
                )}
                <button
                  type="button"
                  onClick={() => deleteStop(s)}
                  disabled={stopBusy || !s.id}
                  className="shrink-0 rounded-md p-1.5 text-red-500 transition-colors hover:bg-red-50 disabled:opacity-40 dark:hover:bg-red-500/10"
                  aria-label={`Delete ${s.stop_name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </SectionCard>

      <SectionCard title="Possible stops">
        <PossibleStopsManager routeId={routeId} routeName={form.route_name} />
      </SectionCard>
    </div>
  );
}
