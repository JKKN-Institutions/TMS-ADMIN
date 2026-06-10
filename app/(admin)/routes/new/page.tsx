'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bus, Clock, Loader2, MapPin, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { DetailPageHeader, SectionCard } from '@/components/ui/detail-view';

interface NewStop {
  stop_name: string;
  stop_time: string;
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

const CRUMBS = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Routes', href: '/routes' },
  { label: 'Add Route' },
];

// Returns an error message or null. A lat/lng pair must be given together and in range.
function coordError(lat: string, lng: string, which: string): string | null {
  if (!lat && !lng) return null;
  if (!lat || !lng) return `${which} latitude and longitude must be provided together`;
  const la = parseFloat(lat);
  const ln = parseFloat(lng);
  if (isNaN(la) || la < -90 || la > 90) return `${which} latitude must be between -90 and 90`;
  if (isNaN(ln) || ln < -180 || ln > 180) return `${which} longitude must be between -180 and 180`;
  return null;
}

export default function NewRoutePage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [drivers, setDrivers] = useState<{ id: string; name: string }[]>([]);
  const [vehicles, setVehicles] = useState<{ id: string; label: string }[]>([]);
  const [stops, setStops] = useState<NewStop[]>([]);
  const [newStop, setNewStop] = useState<NewStop>({ stop_name: '', stop_time: '', is_major_stop: false });
  const [saving, setSaving] = useState(false);

  const set = (k: keyof FormState, v: string) => setForm((p) => ({ ...p, [k]: v }));

  // Assignment dropdown options (best-effort, same as the edit page).
  useEffect(() => {
    let active = true;
    (async () => {
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
    })();
    return () => {
      active = false;
    };
  }, []);

  const addStop = () => {
    if (!newStop.stop_name.trim() || !newStop.stop_time) {
      toast.error('Enter a stop name and time');
      return;
    }
    setStops((p) =>
      [...p, { ...newStop, stop_name: newStop.stop_name.trim() }].sort((a, b) => a.stop_time.localeCompare(b.stop_time))
    );
    setNewStop({ stop_name: '', stop_time: '', is_major_stop: false });
  };

  const removeStop = (index: number) => setStops((p) => p.filter((_, i) => i !== index));

  const validate = (): string | null => {
    if (!form.route_number.trim()) return 'Route number is required';
    if (!form.route_name.trim()) return 'Route name is required';
    if (!form.start_location.trim()) return 'Start location is required';
    if (!form.end_location.trim()) return 'End location is required';
    if (!form.departure_time) return 'Departure time is required';
    if (!form.arrival_time) return 'Arrival time is required';
    if (form.departure_time >= form.arrival_time) return 'Arrival time must be after departure time';
    if (form.distance && Number(form.distance) <= 0) return 'Distance must be greater than 0';
    if (form.total_capacity && Number(form.total_capacity) <= 0) return 'Capacity must be greater than 0';
    if (form.fare && Number(form.fare) <= 0) return 'Fare must be greater than 0';
    const ce = coordError(form.start_latitude, form.start_longitude, 'Start') ?? coordError(form.end_latitude, form.end_longitude, 'End');
    if (ce) return ce;
    for (const s of stops) {
      if (s.stop_time <= form.departure_time) return `Stop "${s.stop_name}" must be after the departure time`;
      if (s.stop_time >= form.arrival_time) return `Stop "${s.stop_name}" must be before the arrival time`;
    }
    return null;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    setSaving(true);
    try {
      const routeData = {
        route_number: form.route_number.trim(),
        route_name: form.route_name.trim(),
        start_location: form.start_location.trim(),
        end_location: form.end_location.trim(),
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
      // The starting location is always saved as stop #1 (same behaviour as the old modal).
      const stopsPayload = [
        {
          stop_name: form.start_location.trim(),
          stop_time: form.departure_time,
          sequence_order: 1,
          is_major_stop: true,
          latitude: form.start_latitude ? parseFloat(form.start_latitude) : null,
          longitude: form.start_longitude ? parseFloat(form.start_longitude) : null,
        },
        ...stops.map((s, i) => ({ ...s, sequence_order: i + 2 })),
      ];
      const res = await fetch('/api/admin/routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'addRoute', routeData, stops: stopsPayload }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to add route');
      toast.success('Route created');
      router.push(json.data?.id ? `/routes/${json.data.id}` : '/routes');
    } catch (err2) {
      toast.error(err2 instanceof Error ? err2.message : 'Failed to add route');
    } finally {
      setSaving(false);
    }
  };

  const field = 'block text-sm';
  const labelText = 'text-gray-600';

  return (
    <div className="space-y-6">
      <DetailPageHeader
        crumbs={CRUMBS}
        backHref="/routes"
        title="Add Route"
        subtitle="Create a new transportation route with its stops"
      />

      <form onSubmit={handleSave} className="space-y-6">
        <SectionCard title="Route details">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className={field}><span className={labelText}>Route Number *</span><input className="input mt-1" placeholder="01" value={form.route_number} onChange={(e) => set('route_number', e.target.value)} /></label>
            <label className={field}><span className={labelText}>Route Name *</span><input className="input mt-1" placeholder="City - College Express" value={form.route_name} onChange={(e) => set('route_name', e.target.value)} /></label>
            <label className={field}><span className={labelText}>Start Location *</span><input className="input mt-1" placeholder="Starting point" value={form.start_location} onChange={(e) => set('start_location', e.target.value)} /></label>
            <label className={field}><span className={labelText}>End Location *</span><input className="input mt-1" placeholder="Destination" value={form.end_location} onChange={(e) => set('end_location', e.target.value)} /></label>
            <label className={field}><span className={labelText}>Departure Time *</span><input type="time" className="input mt-1" value={form.departure_time} onChange={(e) => set('departure_time', e.target.value)} /></label>
            <label className={field}><span className={labelText}>Arrival Time *</span><input type="time" className="input mt-1" value={form.arrival_time} onChange={(e) => set('arrival_time', e.target.value)} /></label>
            <label className={field}><span className={labelText}>Distance (km)</span><input type="number" min="0" className="input mt-1" placeholder="45" value={form.distance} onChange={(e) => set('distance', e.target.value)} /></label>
            <label className={field}><span className={labelText}>Duration</span><input className="input mt-1" placeholder="1h 30m" value={form.duration} onChange={(e) => set('duration', e.target.value)} /></label>
            <label className={field}><span className={labelText}>Total Capacity</span><input type="number" min="0" className="input mt-1" placeholder="70" value={form.total_capacity} onChange={(e) => set('total_capacity', e.target.value)} /></label>
            <label className={field}><span className={labelText}>Monthly Fare (₹)</span><input type="number" min="0" className="input mt-1" placeholder="2500" value={form.fare} onChange={(e) => set('fare', e.target.value)} /></label>
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

        <SectionCard title="GPS coordinates (optional, for live tracking)">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className={field}><span className={labelText}>Start Latitude</span><input type="number" step="0.000001" className="input mt-1" placeholder="12.9716" value={form.start_latitude} onChange={(e) => set('start_latitude', e.target.value)} /></label>
            <label className={field}><span className={labelText}>Start Longitude</span><input type="number" step="0.000001" className="input mt-1" placeholder="77.5946" value={form.start_longitude} onChange={(e) => set('start_longitude', e.target.value)} /></label>
            <label className={field}><span className={labelText}>End Latitude</span><input type="number" step="0.000001" className="input mt-1" placeholder="12.8797" value={form.end_latitude} onChange={(e) => set('end_latitude', e.target.value)} /></label>
            <label className={field}><span className={labelText}>End Longitude</span><input type="number" step="0.000001" className="input mt-1" placeholder="77.6130" value={form.end_longitude} onChange={(e) => set('end_longitude', e.target.value)} /></label>
          </div>
        </SectionCard>

        <SectionCard title="Assignment (optional)">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className={field}>
              <span className={labelText}>Driver</span>
              <select className="input mt-1" value={form.driver_id} onChange={(e) => set('driver_id', e.target.value)}>
                <option value="">Unassigned</option>
                {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
            <label className={field}>
              <span className={labelText}>Vehicle</span>
              <select className="input mt-1" value={form.vehicle_id} onChange={(e) => set('vehicle_id', e.target.value)}>
                <option value="">Unassigned</option>
                {vehicles.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
            </label>
          </div>
          <p className="mt-3 text-xs text-gray-400">You can also assign a driver and vehicle later from the route&apos;s edit page.</p>
        </SectionCard>

        <SectionCard title={`Stops (${stops.length + 1})`}>
          {/* Starting point is derived from the route details and always saved as stop #1. */}
          <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 dark:border-green-500/20 dark:bg-green-500/10">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-600 text-white">
              <Bus className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-gray-900">{form.start_location || 'Starting point'}</p>
              <p className="flex items-center gap-1 text-xs text-gray-500">
                <Clock className="h-3 w-3" /> Departure {form.departure_time || '—'}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-500/20 dark:text-green-300">
              Start
            </span>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-12">
            <input className="input sm:col-span-5" placeholder="Stop name" value={newStop.stop_name} onChange={(e) => setNewStop((p) => ({ ...p, stop_name: e.target.value }))} />
            <input type="time" className="input sm:col-span-3" value={newStop.stop_time} onChange={(e) => setNewStop((p) => ({ ...p, stop_time: e.target.value }))} />
            <label className="flex items-center gap-1.5 text-sm sm:col-span-2">
              <input type="checkbox" checked={newStop.is_major_stop} onChange={(e) => setNewStop((p) => ({ ...p, is_major_stop: e.target.checked }))} /> Major
            </label>
            <button
              type="button"
              onClick={addStop}
              className="inline-flex items-center justify-center gap-1 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 sm:col-span-2"
            >
              <Plus className="h-4 w-4" /> Add
            </button>
          </div>

          <div className="mt-4 space-y-2">
            {stops.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-gray-500">
                <MapPin className="h-4 w-4 text-gray-400" /> No intermediate stops yet. They are kept sorted by time.
              </p>
            ) : (
              stops.map((s, i) => (
                <div key={`${s.stop_name}-${i}`} className="flex items-center gap-3 rounded-lg border border-gray-200 px-4 py-2.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs font-semibold text-green-700 dark:bg-green-500/20 dark:text-green-300">
                    {i + 2}
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
                    onClick={() => removeStop(i)}
                    className="shrink-0 rounded-md p-1.5 text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-500/10"
                    aria-label={`Remove ${s.stop_name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </SectionCard>

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={() => router.push('/routes')} disabled={saving}>
            Cancel
          </button>
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
            disabled={saving}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? 'Creating…' : 'Create Route'}
          </button>
        </div>
      </form>
    </div>
  );
}
