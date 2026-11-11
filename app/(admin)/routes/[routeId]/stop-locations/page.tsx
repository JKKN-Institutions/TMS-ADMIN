'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, MapPin, Save, Search, Sparkles, Undo2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { DetailPageHeader } from '@/components/ui/detail-view';
import type { EditorStop } from './editor-map';

const EditorMap = dynamic(() => import('./editor-map'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[360px] items-center justify-center bg-gray-100">
      <span className="text-sm text-gray-500">Loading map…</span>
    </div>
  ),
});

interface ApiStop {
  id: string;
  name: string;
  order: number;
  time: string | null;
  eveningTime: string | null;
  isMajor: boolean;
  lat: number | null;
  lng: number | null;
  confirmed: boolean;
}
interface ApiData {
  route: { id: string; routeNumber: string | null; routeName: string | null };
  setupPending: boolean;
  recordedTrips: number;
  stops: ApiStop[];
}
interface Suggestion {
  stopId: string;
  lat: number;
  lng: number;
  trips: number;
  basis: 'halt' | 'schedule';
}
/** A pending change: a position, or null = remove the saved location. */
type Draft = { lat: number; lng: number } | null;

async function fetchStops(routeId: string): Promise<ApiData> {
  const res = await fetch(`/api/admin/routes/${routeId}/stop-locations`, { cache: 'no-store' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load stops');
  return json as ApiData;
}

const fmt = (t: string | null) => (t ? t.slice(0, 5) : '—');

export default function StopLocationsPage({ params }: { params: Promise<{ routeId: string }> }) {
  const { routeId } = use(params);
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['route-stop-locations-editor', routeId],
    queryFn: () => fetchStops(routeId),
    enabled: !!routeId,
  });

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [trail, setTrail] = useState<[number, number][]>([]);
  const [suggestInfo, setSuggestInfo] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [places, setPlaces] = useState<Array<{ lat: number; lng: number; label: string }>>([]);
  const [focus, setFocus] = useState<{ lat: number; lng: number; nonce: number } | null>(null);

  const serverStops = useMemo(() => data?.stops ?? [], [data]);

  // What the map and list show: the saved location with any pending change on top.
  const rows = useMemo(
    () =>
      serverStops.map((s) => {
        const has = Object.prototype.hasOwnProperty.call(drafts, s.id);
        const d = has ? drafts[s.id] : undefined;
        const lat = d === undefined ? s.lat : d ? d.lat : null;
        const lng = d === undefined ? s.lng : d ? d.lng : null;
        return { ...s, lat, lng, unsaved: has, removing: has && d === null };
      }),
    [serverStops, drafts],
  );
  const editorStops: EditorStop[] = useMemo(
    () => rows.map((r) => ({ id: r.id, name: r.name, order: r.order, lat: r.lat, lng: r.lng, unsaved: r.unsaved })),
    [rows],
  );

  const located = rows.filter((r) => r.lat != null).length;
  const changeCount = Object.keys(drafts).length;
  const dirty = changeCount > 0;

  // Leaving with unsaved pins would silently lose the work.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // Start on the first stop that still needs a pin.
  const firstUnplacedId = serverStops.find((s) => s.lat == null)?.id ?? null;
  useEffect(() => {
    setActiveId((cur) => cur ?? firstUnplacedId);
  }, [firstUnplacedId]);

  const place = useCallback(
    (stopId: string, lat: number, lng: number) => {
      setDrafts((d) => ({ ...d, [stopId]: { lat, lng } }));
      // After placing the ACTIVE stop, move on to the next one without a pin, so a
      // whole route can be placed with one click per stop.
      setActiveId((cur) => {
        if (cur !== stopId) return cur;
        const i = rows.findIndex((r) => r.id === stopId);
        const rest = [...rows.slice(i + 1), ...rows.slice(0, i)];
        return rest.find((r) => r.lat == null)?.id ?? stopId;
      });
    },
    [rows],
  );

  const removeLocation = (stopId: string) => {
    const saved = serverStops.find((s) => s.id === stopId);
    setDrafts((d) => {
      const next = { ...d };
      // An unsaved pin on a stop with nothing saved simply disappears; a saved
      // location becomes a pending removal.
      if (saved?.lat == null) delete next[stopId];
      else next[stopId] = null;
      return next;
    });
  };

  const undoChange = (stopId: string) =>
    setDrafts((d) => {
      const next = { ...d };
      delete next[stopId];
      return next;
    });

  const suggest = async () => {
    setSuggesting(true);
    try {
      const res = await fetch(`/api/admin/routes/${routeId}/stop-locations?suggest=1`, { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || 'Could not read the recorded trips');
      const suggestions = (json.suggestions ?? []) as Suggestion[];
      setTrail((json.trail ?? []) as [number, number][]);
      // Only stops with no pin get a suggestion — a location someone already placed
      // by hand is never overwritten by a guess.
      const open = new Set(rows.filter((r) => r.lat == null).map((r) => r.id));
      const fill = suggestions.filter((s) => open.has(s.stopId));
      if (fill.length > 0) {
        setDrafts((d) => {
          const next = { ...d };
          for (const s of fill) next[s.stopId] = { lat: s.lat, lng: s.lng };
          return next;
        });
      }
      const exact = fill.filter((s) => s.basis === 'halt').length;
      setSuggestInfo(
        fill.length === 0
          ? `Nothing new to suggest from ${json.tripsUsed ?? 0} recorded trips. The blue line is the bus's usual path.`
          : `${fill.length} stop${fill.length === 1 ? '' : 's'} placed from ${json.tripsUsed ?? 0} recorded trips — ${exact} where the bus regularly halts, ${fill.length - exact} from the timetable (these can be a few hundred metres off). Check each orange pin, drag any that is wrong, then save.`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not read the recorded trips');
    } finally {
      setSuggesting(false);
    }
  };

  const runSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim().length < 3) return;
    setSearching(true);
    try {
      const res = await fetch(
        `/api/admin/routes/${routeId}/stop-locations?search=${encodeURIComponent(query.trim())}`,
        { cache: 'no-store' },
      );
      const json = await res.json().catch(() => ({}));
      const found = (json.places ?? []) as Array<{ lat: number; lng: number; label: string }>;
      setPlaces(found);
      if (found.length === 0) toast('No place found by that name — pan the map instead.');
      else if (found.length === 1) setFocus({ ...found[0], nonce: Date.now() });
    } finally {
      setSearching(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const set = Object.entries(drafts)
        .filter((e): e is [string, { lat: number; lng: number }] => e[1] !== null)
        .map(([stopId, p]) => ({ stopId, lat: p.lat, lng: p.lng }));
      const clear = Object.entries(drafts).filter((e) => e[1] === null).map(([stopId]) => stopId);
      const res = await fetch(`/api/admin/routes/${routeId}/stop-locations`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ set, clear }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || 'Could not save');
      setDrafts({});
      setSuggestInfo(null);
      // The editor, the Track All pins and the route page's stop table all show this.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['route-stop-locations-editor', routeId] }),
        queryClient.invalidateQueries({ queryKey: ['route-stop-locations', routeId] }),
        queryClient.invalidateQueries({ queryKey: ['route', routeId] }),
      ]);
      toast.success('Stop locations saved — they now show on the tracking maps');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const title = data ? `Route ${data.route.routeNumber ?? ''} · Stop locations` : 'Stop locations';
  const crumbs = [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Routes', href: '/routes' },
    { label: data ? `Route ${data.route.routeNumber ?? ''}` : 'Route', href: `/routes/${routeId}` },
    { label: 'Stop locations' },
  ];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <DetailPageHeader crumbs={crumbs} backHref={`/routes/${routeId}`} title="Loading…" />
        <div className="h-96 animate-pulse rounded-xl border border-gray-200 bg-white" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="space-y-6">
        <DetailPageHeader crumbs={crumbs} backHref={`/routes/${routeId}`} title="Stop locations" />
        <p className="text-gray-600">
          The stops for this route could not be loaded.{' '}
          <Link href={`/routes/${routeId}`} className="text-green-700 hover:underline">Back to the route</Link>
        </p>
      </div>
    );
  }

  const active = rows.find((r) => r.id === activeId) ?? null;

  return (
    <div className="space-y-4">
      <DetailPageHeader
        crumbs={crumbs}
        backHref={`/routes/${routeId}`}
        title={title}
        subtitle={data.route.routeName ?? undefined}
        actions={
          <>
            {dirty && (
              <button
                type="button"
                onClick={() => { setDrafts({}); setSuggestInfo(null); }}
                disabled={saving}
                className="inline-flex h-[38px] items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                <Undo2 className="h-4 w-4" /> Discard changes
              </button>
            )}
            <button
              type="button"
              onClick={() => void save()}
              disabled={!dirty || saving || data.setupPending}
              className="inline-flex h-[38px] items-center gap-2 rounded-lg bg-green-600 px-4 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Saving…' : dirty ? `Save ${changeCount} change${changeCount === 1 ? '' : 's'}` : 'Saved'}
            </button>
          </>
        }
      />

      {data.setupPending && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Stop locations can&apos;t be saved yet — a database update for this feature is still pending.
          You can try the map, but Save is switched off until it is applied.
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900">
              {located} of {rows.length} stops have a map location
            </p>
            <p className="mt-0.5 text-sm text-gray-600">
              {active
                ? active.lat == null
                  ? <>Click the map where <span className="font-semibold text-gray-900">{active.order}. {active.name}</span> is. Drag any pin to adjust it.</>
                  : <>Click the map to move <span className="font-semibold text-gray-900">{active.order}. {active.name}</span>, or drag its pin.</>
                : 'Pick a stop from the list, then click the map where it is.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <form onSubmit={(e) => void runSearch(e)} className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a place on the map…"
                aria-label="Find a place on the map"
                className="h-[38px] w-56 rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400"
              />
              {searching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />}
            </form>
            <button
              type="button"
              onClick={() => void suggest()}
              disabled={suggesting || data.recordedTrips === 0}
              title={
                data.recordedTrips === 0
                  ? "This route's bus has not recorded any trips yet, so there is nothing to suggest from"
                  : 'Place the stops without a pin from where the bus has actually driven'
              }
              className="inline-flex h-[38px] items-center gap-2 rounded-lg border border-violet-300 bg-violet-50 px-3 text-sm font-medium text-violet-800 hover:bg-violet-100 disabled:opacity-50"
            >
              {suggesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {suggesting ? 'Reading trips…' : `Suggest from bus trips (${data.recordedTrips})`}
            </button>
          </div>
        </div>

        {places.length > 1 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-gray-500">Go to:</span>
            {places.map((p, i) => (
              <button
                key={`${p.lat}-${p.lng}-${i}`}
                type="button"
                onClick={() => setFocus({ lat: p.lat, lng: p.lng, nonce: Date.now() })}
                className="max-w-[260px] truncate rounded-full border border-gray-300 bg-white px-2.5 py-1 text-gray-700 hover:bg-gray-50"
                title={p.label}
              >
                {p.label}
              </button>
            ))}
            <button type="button" onClick={() => setPlaces([])} aria-label="Clear search results" className="text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {suggestInfo && (
          <p className="mt-3 rounded-lg bg-violet-50 px-3 py-2 text-sm text-violet-900">{suggestInfo}</p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
        {/* Map first on a phone: it is the thing being worked on. */}
        <div className="isolate order-1 h-[60dvh] min-h-[360px] overflow-hidden rounded-xl border border-gray-200 lg:order-2 lg:h-[calc(100dvh-20rem)]">
          <EditorMap
            stops={editorStops}
            activeId={activeId}
            trail={trail}
            focus={focus}
            onPlace={place}
            onSelect={setActiveId}
          />
        </div>

        <div className="order-2 flex min-h-0 flex-col rounded-xl border border-gray-200 bg-white lg:order-1 lg:h-[calc(100dvh-20rem)]">
          <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-2.5 text-xs text-gray-600">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-violet-600" aria-hidden /> Saved</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-orange-600" aria-hidden /> Not saved yet</span>
          </div>
          <ul className="min-h-0 flex-1 divide-y divide-gray-100 overflow-y-auto">
            {rows.map((r) => (
              <li key={r.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setActiveId(r.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveId(r.id); } }}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 px-4 py-2.5 text-left',
                    r.id === activeId ? 'bg-violet-50' : 'hover:bg-gray-50',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                      r.lat == null
                        ? 'bg-gray-100 text-gray-500'
                        : r.unsaved
                          ? 'bg-orange-100 text-orange-700'
                          : 'bg-violet-100 text-violet-700',
                    )}
                  >
                    {r.order}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-gray-900">{r.name}</span>
                    <span className="block text-xs text-gray-500">
                      {fmt(r.time)}
                      {r.eveningTime ? ` · ${fmt(r.eveningTime)}` : ''}
                      {' · '}
                      {r.removing ? (
                        <span className="text-orange-700">Location will be removed</span>
                      ) : r.lat == null ? (
                        'No location'
                      ) : r.unsaved ? (
                        <span className="text-orange-700">Placed — not saved</span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 text-violet-700"><Check className="h-3 w-3" /> On the map</span>
                      )}
                    </span>
                  </span>
                  {r.unsaved ? (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); undoChange(r.id); }}
                      className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
                    >
                      Undo
                    </button>
                  ) : r.lat != null ? (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeLocation(r.id); }}
                      className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
                    >
                      Remove
                    </button>
                  ) : (
                    <MapPin className="h-4 w-4 shrink-0 text-gray-300" />
                  )}
                </div>
              </li>
            ))}
            {rows.length === 0 && (
              <li className="px-4 py-10 text-center text-sm text-gray-500">This route has no stops yet.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
