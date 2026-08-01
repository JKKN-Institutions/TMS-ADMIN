'use client';

import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { interpolateLatLng, shouldSnap, haversineMeters, type LatLng } from '@/lib/gps/interpolate';
import { shouldUseSnap } from '@/lib/geo/osrm';
import { CAMPUS } from '@/lib/gps/campus';
import type { TrackingState } from '@/lib/gps/route-status';

// Fix for default markers in Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

/**
 * One plottable bus, keyed by ROUTE — a route is the thing an admin tracks, and the
 * driver on it can change. The parent builds these from FleetRoute and only sends
 * routes that actually have a position; a route with no fix has nothing to draw.
 */
export interface MapBus {
  routeId: string;
  routeNumber: string | null;
  routeName: string | null;
  driverName: string | null;
  registrationNumber: string | null;
  lat: number;
  lng: number;
  heading: number | null;
  accuracyM: number | null;
  state: TrackingState;
  reason: string;
}

interface LiveTrackingMapProps {
  buses: MapBus[];
  /** Selection is owned by the parent so the fleet list and the map stay in step. */
  selectedRouteId: string | null;
  onSelectRoute: (routeId: string | null) => void;
}

// Glide slightly under the 5s reader poll so each marker settles just before the next fix.
const GLIDE_MS = 4500;
const DEFAULT_CENTER: [number, number] = [11.4444567, 77.730258]; // Tamil Nadu area

// Per-route marker + the segment it is currently animating along.
interface MarkerState {
  marker: L.Marker;
  circle: L.Circle | null;
  anim: LatLng;
  from: LatLng;
  to: LatLng;
  /**
   * The last RAW fix this marker was retargeted to. Tracked separately from `to`
   * because the snap pass overwrites `to` with the road-snapped point — so for
   * exactly the live buses that animate, `to` is NOT a record of the last position
   * we saw, and comparing against it could never detect "nothing actually moved".
   */
  rawTarget: LatLng;
  start: number;
  bus: MapBus;   // latest data for this marker, read by the click handler
}

interface Enrichment {
  snapped: LatLng | null;
  route: { geometry: [number, number][]; distanceKm: number; durationMin: number } | null;
  address: string | null;
}

// Distance (m) a bus must move before we re-query enrichment for it.
const REENRICH_M = 150;

async function fetchEnrichment(
  lat: number,
  lng: number,
  opts: { route: boolean; address: boolean },
): Promise<Enrichment | null> {
  try {
    const qs = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
      route: opts.route ? '1' : '0',
      address: opts.address ? '1' : '0',
    });
    const res = await fetch(`/api/admin/track-all/directions?${qs.toString()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json?.success) return null;
    const snapped: LatLng | null =
      json.snapped && shouldUseSnap(json.snapped.snapDistanceM)
        ? { lat: json.snapped.lat, lng: json.snapped.lng }
        : null;
    return { snapped, route: json.route ?? null, address: json.address ?? null };
  } catch {
    return null;
  }
}

const STATE_COLORS: Record<TrackingState, string> = {
  live: '#10B981',
  recent: '#10B981',
  paused: '#F59E0B',
  stuck: '#EF4444',
  off: '#6B7280',
  no_vehicle: '#6B7280',
  no_driver: '#6B7280',
  unconfigured: '#6B7280',
};

/**
 * Only live/recent fixes are trustworthy as "present"; everything else ghosts back —
 * including `off`/`no_driver`/etc, whose vehicle row can still carry a days- or
 * weeks-old `current_latitude/longitude` that nothing ever clears. Deriving
 * staleness from freshness (rather than enumerating the stale states) also means a
 * future `TrackingState` can't land in the un-ghosted set by omission.
 */
const FRESH_STATES: ReadonlySet<TrackingState> = new Set<TrackingState>(['live', 'recent']);

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
};

/** Route/driver names are free text from the DB and Leaflet renders popup HTML raw. */
function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => HTML_ESCAPES[c]);
}

function createBusIcon(bus: MapBus): L.DivIcon {
  const color = STATE_COLORS[bus.state];
  const stale = !FRESH_STATES.has(bus.state);
  const opacity = stale ? 0.45 : 1;
  const displayText = bus.routeNumber || '?';
  // A stale fix's heading is as old as the fix, so don't imply a current direction.
  const pointer =
    stale || bus.heading == null || Number.isNaN(bus.heading)
      ? ''
      : `<div style="position:absolute;inset:0;transform:rotate(${bus.heading}deg);">
           <div style="position:absolute;top:-6px;left:50%;margin-left:-4px;width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-bottom:7px solid ${color};"></div>
         </div>`;
  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="position:relative;width:30px;height:30px;opacity:${opacity};">
        ${pointer}
        <div style="
          position:absolute;top:3px;left:3px;background:${color};width:24px;height:24px;border-radius:50%;
          border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);
          display:flex;align-items:center;justify-content:center;
          color:white;font-weight:bold;font-size:11px;font-family:Arial,sans-serif;
        ">${esc(displayText)}</div>
      </div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

function buildPopup(bus: MapBus): string {
  const color = STATE_COLORS[bus.state];
  const title = `Route ${esc(bus.routeNumber ?? '?')}${bus.routeName ? ` · ${esc(bus.routeName)}` : ''}`;
  return `
    <div style="min-width:220px;font-family:system-ui,-apple-system,sans-serif;">
      <h3 style="margin:0 0 8px 0;color:#111827;font-size:15px;font-weight:600;">${title}</h3>
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
        <div style="width:8px;height:8px;border-radius:50%;background:${color};"></div>
        <span style="font-size:12px;color:#6B7280;">${esc(bus.reason)}</span>
      </div>
      <div style="font-size:13px;color:#374151;">
        ${bus.registrationNumber ? `<div style="margin-bottom:4px;"><strong>Bus:</strong> ${esc(bus.registrationNumber)}</div>` : ''}
        ${bus.driverName ? `<div><strong>Driver:</strong> ${esc(bus.driverName)}</div>` : ''}
      </div>
    </div>`;
}

const LiveTrackingMap: React.FC<LiveTrackingMapProps> = ({ buses, selectedRouteId, onSelectRoute }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, MarkerState>>(new Map());
  const rafRef = useRef<number | null>(null);
  const hasFitRef = useRef(false);
  const enrichRef = useRef<Map<string, { at: LatLng; snapped: LatLng | null }>>(new Map());
  const selectedIdRef = useRef<string | null>(null);
  const routeLineRef = useRef<L.Polyline | null>(null);
  const [enrichment, setEnrichment] = useState<{
    address: string | null;
    distanceKm: number | null;
    durationMin: number | null;
  } | null>(null);

  // Marker click handlers are bound exactly once (see the diffing effect) so Leaflet's
  // own popup handler survives. They reach the callback through this ref so a parent
  // that passes a fresh arrow each render can never leave a marker calling a stale one.
  const onSelectRouteRef = useRef(onSelectRoute);
  useEffect(() => {
    onSelectRouteRef.current = onSelectRoute;
  }, [onSelectRoute]);

  const fitToMarkers = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const markers = [...markersRef.current.values()].map((s) => s.marker);
    if (markers.length === 0) return;
    map.fitBounds(L.featureGroup(markers).getBounds().pad(0.15));
  };

  const clearRouteLine = () => {
    routeLineRef.current?.remove();
    routeLineRef.current = null;
  };

  // The one place "which bus is selected" is resolved — used by the enrichment effect
  // below and by the selection card. Read from the PROP, not markersRef: a ref read
  // during render does not re-render when the poll brings new data, and on the commit
  // that first adds a bus the ref is still holding the previous frame's map.
  const selectedBus = selectedRouteId
    ? (buses ?? []).find((b) => b.routeId === selectedRouteId) ?? null
    : null;

  // Mirror the selected-route prop into a ref so in-flight enrichment can still cancel
  // itself, and drop the previous route's line/address immediately — otherwise the old
  // road line hangs on the map until the new route's OSRM call resolves.
  useEffect(() => {
    selectedIdRef.current = selectedRouteId;
    clearRouteLine();
    setEnrichment(null);
  }, [selectedRouteId]);

  // Draw the road line + address for whichever route the parent has selected.
  //
  // The deps are the route id plus the PRESENCE of its bus — deliberately not `buses`
  // itself, and deliberately not the id alone:
  //   - depending on `buses` would re-fire the OSRM fetch every 5s poll and redraw the
  //     line under the user;
  //   - depending on the id alone strands a route selected while it had no position.
  //     The fleet list can select a route that is not reporting — that is the whole
  //     point of this feature — and when it later starts reporting, the effect would
  //     never retry, leaving the card stuck on "Locating…" until the user deselected
  //     and reselected.
  // `selectedBus != null` flips exactly once when the bus appears, so the effect
  // self-heals without costing a fetch per poll while the bus is present.
  const hasSelectedBus = selectedBus != null;
  useEffect(() => {
    if (!selectedBus) return;
    // Captured by value: `routeId` is `string` here, where `selectedRouteId` is
    // `string | null`, and they are equal by construction.
    const { routeId, lat, lng } = selectedBus;
    void fetchEnrichment(lat, lng, { route: true, address: true }).then((e) => {
      if (!e || selectedIdRef.current !== routeId) return;
      const map = mapInstanceRef.current;
      if (map && e.route) {
        clearRouteLine();
        routeLineRef.current = L.polyline(e.route.geometry, {
          color: '#2563eb', weight: 5, opacity: 0.85,
        }).addTo(map);
      }
      if (e.snapped) {
        // Cache the snap so the diffing effect's snap pass keeps this bus on-road each poll.
        enrichRef.current.set(routeId, { at: { lat, lng }, snapped: e.snapped });
        const cur = markersRef.current.get(routeId);
        if (cur) { cur.from = { ...cur.anim }; cur.to = e.snapped; cur.start = performance.now(); }
      }
      setEnrichment({
        address: e.address,
        distanceKm: e.route?.distanceKm ?? null,
        durationMin: e.route?.durationMin ?? null,
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRouteId, hasSelectedBus]);

  // Initialise the map once, and run ONE animation loop that glides every marker.
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current).setView(DEFAULT_CENTER, 10);
    // Street basemap: CARTO Voyager — clean, Google-like, free, no API key.
    const street = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 20,
      attribution: '© OpenStreetMap contributors © CARTO',
    });
    // Satellite basemap: Esri World Imagery — free with attribution, no key.
    const satellite = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 20, attribution: 'Tiles © Esri' },
    );
    street.addTo(map);
    L.control.layers({ Street: street, Satellite: satellite }, {}, { position: 'topright' }).addTo(map);

    L.marker([CAMPUS.lat, CAMPUS.lng], {
      icon: L.divIcon({
        className: 'campus-marker',
        html: `<div style="width:26px;height:26px;border-radius:6px;background:#dc2626;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font-size:14px;">🎓</div>`,
        iconSize: [26, 26], iconAnchor: [13, 13],
      }),
    }).addTo(map).bindPopup(CAMPUS.label);

    mapInstanceRef.current = map;

    const stepAll = () => {
      const now = performance.now();
      for (const st of markersRef.current.values()) {
        const t = Math.min(1, (now - st.start) / GLIDE_MS);
        const pos = interpolateLatLng(st.from, st.to, t);
        st.anim = pos;
        st.marker.setLatLng([pos.lat, pos.lng]);
        st.circle?.setLatLng([pos.lat, pos.lng]);
      }
      rafRef.current = requestAnimationFrame(stepAll);
    };
    rafRef.current = requestAnimationFrame(stepAll);

    return () => {
      // Reset EVERY ref this effect owns. React Strict Mode remounts in dev, and any
      // ref left populated makes the second mount silently skip the layer it guards.
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      markersRef.current.clear();
      enrichRef.current.clear();
      hasFitRef.current = false;
      routeLineRef.current?.remove();
      routeLineRef.current = null;
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Diff markers against the latest data: update existing (glide + icon + popup),
  // add new, remove gone. No clear-all, no fitBounds-every-poll (the old flicker).
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const list = buses ?? [];
    const seen = new Set<string>();

    for (const bus of list) {
      seen.add(bus.routeId);
      const target: LatLng = { lat: bus.lat, lng: bus.lng };
      const icon = createBusIcon(bus);
      const popup = buildPopup(bus);
      const existing = markersRef.current.get(bus.routeId);

      if (existing) {
        existing.marker.setIcon(icon);
        existing.bus = bus;
        const p = existing.marker.getPopup();
        if (p) p.setContent(popup);
        else existing.marker.bindPopup(popup);

        if (bus.accuracyM != null && bus.accuracyM > 0) {
          if (!existing.circle) {
            existing.circle = L.circle(target, { radius: bus.accuracyM, color: '#3B82F6', weight: 1, fillColor: '#3B82F6', fillOpacity: 0.1 }).addTo(map);
          } else {
            existing.circle.setLatLng(target);
            existing.circle.setRadius(bus.accuracyM);
          }
        } else if (existing.circle) {
          existing.circle.remove();
          existing.circle = null;
        }

        // Only restart the glide when the bus actually reported a NEW position.
        // This effect re-runs on any change of `buses` identity — which for an
        // unmemoized parent is every render, including every selection click. A
        // bare retarget would reset `start` each time, so the marker would re-glide
        // whatever distance remained over a fresh GLIDE_MS and crawl without ever
        // arriving. shouldSnap cannot rescue it: it only fires above 2 km.
        if (target.lat !== existing.rawTarget.lat || target.lng !== existing.rawTarget.lng) {
          existing.rawTarget = target;
          if (shouldSnap(existing.anim, target)) {
            existing.anim = target;
            existing.from = target;
            existing.to = target;
            existing.marker.setLatLng([target.lat, target.lng]);
          } else {
            existing.from = { ...existing.anim };
            existing.to = target;
            existing.start = performance.now();
          }
        }
      } else {
        const marker = L.marker([target.lat, target.lng], { icon }).addTo(map);
        marker.bindPopup(popup);
        const circle = bus.accuracyM != null && bus.accuracyM > 0
          ? L.circle([target.lat, target.lng], { radius: bus.accuracyM, color: '#3B82F6', weight: 1, fillColor: '#3B82F6', fillOpacity: 0.1 }).addTo(map)
          : null;
        const st: MarkerState = {
          marker, circle, anim: target, from: target, to: target, rawTarget: target,
          start: performance.now(), bus,
        };
        markersRef.current.set(bus.routeId, st);
        // Bind ONCE and never unbind: marker.off('click') would also strip the handler
        // bindPopup installs, and popups would silently stop opening. `st.bus` is
        // mutated each poll so this handler always reads the current route.
        marker.on('click', () => onSelectRouteRef.current(st.bus.routeId));
      }
    }

    // Snap pass — runs AFTER the main loop above (which retargets every marker to
    // the RAW fix each poll). For each fresh bus we (1) re-apply its cached snapped
    // point so the raw retarget doesn't undo it, and (2) (re)fetch a snap when the
    // bus is new or has moved > REENRICH_M. The selected bus's snap is owned by the
    // selection effect, which writes the same enrichRef cache.
    for (const bus of list) {
      const fresh = bus.state === 'live' || bus.state === 'recent';
      if (!fresh) continue;
      const here: LatLng = { lat: bus.lat, lng: bus.lng };
      const prev = enrichRef.current.get(bus.routeId);
      const movedFar = !prev || haversineMeters(prev.at, here) >= REENRICH_M;

      // (1) Keep the marker on its cached snapped point — but NOT if it just teleported
      //     far (a stale snap would misplace it until the refetch resolves).
      if (prev?.snapped && !movedFar) {
        const st = markersRef.current.get(bus.routeId);
        if (st) st.to = prev.snapped;
      }

      // (2) Non-selected buses: refetch a snap only when new or moved far.
      if (selectedIdRef.current === bus.routeId) continue;
      if (!movedFar) continue;
      enrichRef.current.set(bus.routeId, { at: here, snapped: prev?.snapped ?? null });
      void fetchEnrichment(here.lat, here.lng, { route: false, address: false }).then((e) => {
        if (!e) return;
        enrichRef.current.set(bus.routeId, { at: here, snapped: e.snapped });
        const st = markersRef.current.get(bus.routeId);
        if (st && e.snapped) {
          st.from = { ...st.anim };
          st.to = e.snapped;
          st.start = performance.now();
        }
      });
    }

    for (const [id, st] of markersRef.current) {
      if (!seen.has(id)) {
        st.marker.remove();
        st.circle?.remove();
        markersRef.current.delete(id);
        enrichRef.current.delete(id);   // drop stale snap cache for gone buses
      }
    }

    // Frame the buses once on first data; afterwards leave the user's zoom/pan alone.
    if (!hasFitRef.current && markersRef.current.size > 0) {
      fitToMarkers();
      hasFitRef.current = true;
    }
  }, [buses]);

  return (
    <div className="relative h-full min-h-[420px] w-full">
      <div ref={mapRef} className="h-full min-h-[420px] w-full" />
      <button
        type="button"
        onClick={fitToMarkers}
        className="absolute right-2.5 top-2.5 z-[1000] rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-[13px] font-semibold text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
      >
        Recenter
      </button>
      {selectedBus && (
        <div className="absolute bottom-3 left-3 z-[1000] max-w-[320px] rounded-xl border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-900">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                Route {selectedBus.routeNumber ?? '?'}
                {selectedBus.routeName ? ` · ${selectedBus.routeName}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onSelectRoute(null)}
              aria-label="Clear selection"
              className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              ×
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            📍 {enrichment?.address ?? 'Locating…'}
          </p>
          {enrichment?.distanceKm != null && (
            <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
              🚌 {enrichment.distanceKm.toFixed(1)} km to campus
              {enrichment.durationMin != null ? ` · ~${enrichment.durationMin} min` : ''}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default LiveTrackingMap;
