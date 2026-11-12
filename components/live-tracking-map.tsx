'use client';

import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair, Maximize2, Minimize2, Scan } from 'lucide-react';
import { interpolateLatLng, shouldSnap, haversineMeters, type LatLng } from '@/lib/gps/interpolate';
import { shouldUseSnap } from '@/lib/geo/osrm';
import { CAMPUS } from '@/lib/gps/campus';
import type { TrackingState } from '@/lib/gps/route-status';
import { agoText, compassOf, livenessOf, type Liveness } from '@/lib/gps/liveness';
import { clusterPoints } from '@/lib/tracking/cluster';
import { stopsSignature, type MapStop } from '@/lib/stops/map-stops';
import { drawStopPins, escapeHtml } from '@/components/map/stop-pins';
import { busMarkerIcon, busMarkerSignature, clusterMarkerIcon, BUS_COLORS } from '@/components/map/bus-marker';
import { addBaseLayers } from '@/components/map/base-layers';

// Fix for default markers in Leaflet
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
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
  /** For the selected-bus card's Call button; tel: link, omitted when null. */
  driverPhone?: string | null;
  speedKmh?: number | null;
  /** When the position was reported (ISO). Liveness is worked out from this. */
  lastFixAt?: string | null;
}

interface LiveTrackingMapProps {
  buses: MapBus[];
  /** Selection is owned by the parent so the fleet list and the map stay in step. */
  selectedRouteId: string | null;
  onSelectRoute: (routeId: string | null) => void;
  /** Shown over the map when no bus has a position (the map still renders). */
  emptyMessage?: { title: string; detail?: string };
  /**
   * Confirmed stop pins of the route the admin picked. Drawn even when that route's
   * bus has no position — seeing where a route's stops are does not need a live bus.
   */
  routeStops?: MapStop[];
  /** Which route `routeStops` belongs to; a change re-frames the map on its stops. */
  routeStopsRouteId?: string | null;
  /** Stops on the whole route, for "Stop 5 of 23" while some are still unplaced. */
  routeStopCount?: number;
  /** One line for the selected-bus card, e.g. "Next stop: KUMARAMANGALAM". */
  stopSummary?: { headline: string; detail: string | null } | null;
  /** Shown in the selected-bus card when the route has no stop pins yet. */
  stopsSetupHref?: string | null;
  /**
   * Which way the buses are running. On the evening ('return') run the road line and
   * the "km to campus" time are left out: the bus is driving away from campus.
   */
  direction?: 'onward' | 'return' | null;
  /**
   * The road the picked route's bus actually drives, from a recorded trip. When
   * present it is the route line, and the "road to campus" guess is not drawn.
   */
  routePath?: [number, number][] | null;
  /**
   * A coarse clock from the parent (it may step every few seconds). Liveness — LIVE,
   * delayed, last known — is worked out against it, so a marker stops saying LIVE by
   * itself when its position ages. Defaults to the time of each render.
   */
  nowMs?: number;
}

// Glide slightly under the 5s reader poll so each marker settles just before the next fix.
const GLIDE_MS = 4500;
/** Markers closer than this on screen (px, centre to centre) merge into one badge. */
const CLUSTER_RADIUS_PX = 34;
/** Fitting never zooms closer than this: one bus must not fill the screen with blank tiles. */
const FIT_MAX_ZOOM = 15;

// Per-route marker + the segment it is currently animating along.
interface MarkerState {
  marker: L.Marker;
  circle: L.Circle | null;
  anim: LatLng;
  from: LatLng;
  to: LatLng;
  /**
   * The last RAW fix this marker was retargeted to. Tracked separately from `to`
   * because the snap pass overwrites `to` with the road-snapped point.
   */
  rawTarget: LatLng;
  start: number;
  /** A glide is in progress. The animation loop only touches markers with this set. */
  moving: boolean;
  bus: MapBus;
  /** What the icon was last drawn from; the icon is rebuilt only when this changes. */
  iconSig: string;
  /** False while the bus is folded into a group badge. */
  shown: boolean;
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

/** Kept for callers that colour by the server's status group. */
export const STATE_COLORS: Record<TrackingState, string> = {
  live: '#10B981',
  recent: '#10B981',
  paused: '#F59E0B',
  stuck: '#F59E0B',
  off: '#EAB308',
  no_vehicle: '#EF4444',
  no_driver: '#EF4444',
  unconfigured: '#6B7280',
};

const CONTROL_BTN =
  'inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 text-[13px] font-semibold text-gray-700 shadow-[0_1px_4px_rgba(0,0,0,0.25)] hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700';

const LIVENESS_CHIP: Record<Liveness, string> = {
  live: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300',
  delayed: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  off: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

const LiveTrackingMap: React.FC<LiveTrackingMapProps> = ({
  buses, selectedRouteId, onSelectRoute, emptyMessage,
  routeStops, routeStopsRouteId, routeStopCount, stopSummary, stopsSetupHref, direction, routePath,
  nowMs: nowProp,
}) => {
  const nowMs = nowProp ?? Date.now();
  const toCampus = direction !== 'return';
  const toCampusRef = useRef(toCampus);
  toCampusRef.current = toCampus;
  const hasRoutePath = !!routePath && routePath.length > 1;
  const hasRoutePathRef = useRef(hasRoutePath);
  hasRoutePathRef.current = hasRoutePath;

  const wrapRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, MarkerState>>(new Map());
  const clusterLayerRef = useRef<L.LayerGroup | null>(null);
  const clusterSigRef = useRef('');
  const rafRef = useRef<number | null>(null);
  const aliveRef = useRef(false);
  const enrichRef = useRef<Map<string, { at: LatLng; snapped: LatLng | null }>>(new Map());
  const selectedIdRef = useRef<string | null>(null);
  const routeLineRef = useRef<L.Polyline | null>(null);
  const pathLayerRef = useRef<L.LayerGroup | null>(null);
  const stopsLayerRef = useRef<L.LayerGroup | null>(null);
  const stopsFramedForRef = useRef<string | null>(null);
  const routeStopsLatestRef = useRef<MapStop[]>(routeStops ?? []);
  routeStopsLatestRef.current = routeStops ?? [];
  const nowRef = useRef(nowMs);
  nowRef.current = nowMs;

  // The view fits itself to the active buses until the user moves the map; "Fit all
  // buses" hands control back. `fitSigRef` remembers which set of buses the view was
  // last fitted to, so it re-fits when a bus starts or stops, not on every position.
  const autoFitRef = useRef(true);
  const fitSigRef = useRef<string | null>(null);
  // The picked bus is followed until the user drags the map away.
  const followRef = useRef(false);
  const [following, setFollowing] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  // Where the browser has no Fullscreen API (iPhone Safari), or refuses it, the map is
  // pinned over the window instead.
  const [pseudoFull, setPseudoFull] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [copied, setCopied] = useState(false);

  const [enrichment, setEnrichment] = useState<{
    address: string | null;
    distanceKm: number | null;
    durationMin: number | null;
  } | null>(null);

  // Marker click handlers are bound exactly once so Leaflet's own handlers survive.
  // They reach the callback through this ref so a parent that passes a fresh arrow
  // each render can never leave a marker calling a stale one.
  const onSelectRouteRef = useRef(onSelectRoute);
  useEffect(() => {
    onSelectRouteRef.current = onSelectRoute;
  }, [onSelectRoute]);

  const livenessOfBus = (b: MapBus) => livenessOf(b.lastFixAt, nowRef.current);

  /** Start the animation loop if it is not running. It stops itself when nothing moves. */
  const ensureLoop = () => {
    if (rafRef.current != null || !aliveRef.current) return;
    const step = () => {
      const now = performance.now();
      let anyMoving = false;
      for (const st of markersRef.current.values()) {
        if (!st.moving) continue;
        const t = Math.min(1, (now - st.start) / GLIDE_MS);
        const pos = interpolateLatLng(st.from, st.to, t);
        st.anim = pos;
        st.marker.setLatLng([pos.lat, pos.lng]);
        st.circle?.setLatLng([pos.lat, pos.lng]);
        if (t >= 1) st.moving = false;
        else anyMoving = true;
      }
      rafRef.current = anyMoving && aliveRef.current ? requestAnimationFrame(step) : null;
    };
    rafRef.current = requestAnimationFrame(step);
  };

  const glideTo = (st: MarkerState, target: LatLng) => {
    st.from = { ...st.anim };
    st.to = target;
    st.start = performance.now();
    st.moving = true;
    ensureLoop();
  };

  /** Frame the buses worth looking at: live ones if any, else every drawn bus — plus the college. */
  const fitToBuses = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const all = [...markersRef.current.values()];
    const active = all.filter((s) => livenessOfBus(s.bus) !== 'off');
    const use = active.length > 0 ? active : all;
    const pts: [number, number][] = use.map((s) => [s.to.lat, s.to.lng]);
    pts.push([CAMPUS.lat, CAMPUS.lng]);
    if (pts.length === 1) {
      map.setView(pts[0], 13, { animate: true });
      return;
    }
    map.fitBounds(L.latLngBounds(pts).pad(0.2), { maxZoom: FIT_MAX_ZOOM });
  };

  const clearRouteLine = () => {
    routeLineRef.current?.remove();
    routeLineRef.current = null;
  };

  /**
   * Fold markers that overlap on screen into count badges. The picked bus is never
   * folded away. Runs when positions, the zoom or the selection change.
   */
  const recluster = () => {
    const map = mapInstanceRef.current;
    const layer = clusterLayerRef.current;
    if (!map || !layer) return;
    const selected = selectedIdRef.current;

    const pts: { id: string; x: number; y: number }[] = [];
    for (const [id, st] of markersRef.current) {
      if (id === selected) continue;
      const p = map.latLngToContainerPoint([st.to.lat, st.to.lng]);
      pts.push({ id, x: p.x, y: p.y });
    }
    const groups = clusterPoints(pts, CLUSTER_RADIUS_PX).filter((g) => g.ids.length > 1);
    const folded = new Set<string>();
    for (const g of groups) for (const id of g.ids) folded.add(id);

    for (const [id, st] of markersRef.current) {
      const show = !folded.has(id);
      if (show === st.shown) continue;
      st.shown = show;
      if (show) {
        st.marker.addTo(map);
        st.circle?.addTo(map);
      } else {
        st.marker.remove();
        st.circle?.remove();
      }
    }

    // Redraw the badges only when the grouping (or a group's live-ness) changed.
    const sig = groups
      .map((g) => `${g.key}:${g.ids.some((id) => livenessOfBus(markersRef.current.get(id)!.bus) === 'live') ? 1 : 0}`)
      .join(';');
    if (sig === clusterSigRef.current) return;
    clusterSigRef.current = sig;
    layer.clearLayers();

    for (const g of groups) {
      const members = g.ids.map((id) => markersRef.current.get(id)!).filter(Boolean);
      const lat = members.reduce((n, m) => n + m.to.lat, 0) / members.length;
      const lng = members.reduce((n, m) => n + m.to.lng, 0) / members.length;
      const anyLive = members.some((m) => livenessOfBus(m.bus) === 'live');
      const badge = L.marker([lat, lng], { icon: clusterMarkerIcon(members.length, anyLive), zIndexOffset: 900, keyboard: false });

      badge.on('click', () => {
        const bounds = L.latLngBounds(members.map((m) => [m.to.lat, m.to.lng] as [number, number]));
        const spreadM = haversineMeters(
          { lat: bounds.getSouth(), lng: bounds.getWest() },
          { lat: bounds.getNorth(), lng: bounds.getEast() },
        );
        // Far enough apart that zooming in will separate them: zoom. Otherwise they are
        // parked on the same spot and no zoom helps — list them.
        if (spreadM > 60 && map.getZoom() < 17) {
          map.fitBounds(bounds.pad(0.4), { maxZoom: 17 });
          return;
        }
        const box = L.DomUtil.create('div');
        box.style.cssText = 'font-family:system-ui,-apple-system,sans-serif;min-width:190px;';
        const title = L.DomUtil.create('div', '', box);
        title.style.cssText = 'font-weight:600;font-size:13px;color:#111827;margin-bottom:6px;';
        title.textContent = `${members.length} buses here`;
        for (const m of members) {
          const lv = livenessOfBus(m.bus);
          const row = L.DomUtil.create('button', '', box) as HTMLButtonElement;
          row.type = 'button';
          row.style.cssText =
            'display:flex;align-items:center;gap:8px;width:100%;padding:7px 4px;border:0;border-top:1px solid #f3f4f6;background:none;text-align:left;cursor:pointer;font-size:13px;color:#111827;';
          row.innerHTML = `<span style="width:9px;height:9px;border-radius:50%;background:${BUS_COLORS[lv]};flex:none;"></span>
            <span style="font-weight:700;min-width:26px;">${escapeHtml(m.bus.routeNumber ?? '?')}</span>
            <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#374151;">${escapeHtml(m.bus.registrationNumber ?? m.bus.routeName ?? '')}</span>
            <span style="color:#6b7280;font-size:11px;flex:none;">${lv === 'live' ? 'Live' : escapeHtml(agoText(m.bus.lastFixAt, nowRef.current))}</span>`;
          L.DomEvent.on(row, 'click', (e) => {
            L.DomEvent.stop(e);
            map.closePopup();
            onSelectRouteRef.current(m.bus.routeId);
          });
        }
        L.popup({ offset: [0, -14], maxWidth: 280 }).setLatLng([lat, lng]).setContent(box).openOn(map);
      });
      badge.addTo(layer);
    }
  };

  // The one place "which bus is selected" is resolved. Read from the PROP, not
  // markersRef: a ref read during render does not re-render when new data arrives.
  const selectedBus = selectedRouteId
    ? (buses ?? []).find((b) => b.routeId === selectedRouteId) ?? null
    : null;

  // Initialise the map once.
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    aliveRef.current = true;

    const el = mapRef.current;
    const map = L.map(el).setView([CAMPUS.lat, CAMPUS.lng], 12);
    addBaseLayers(map);
    L.control.scale({ imperial: false, position: 'bottomright' }).addTo(map);

    L.marker([CAMPUS.lat, CAMPUS.lng], {
      icon: L.divIcon({
        className: 'campus-marker',
        html: `<div style="width:26px;height:26px;border-radius:6px;background:#dc2626;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font-size:14px;">🎓</div>`,
        iconSize: [26, 26], iconAnchor: [13, 13],
      }),
      zIndexOffset: -100,
    }).addTo(map).bindPopup(CAMPUS.label);

    clusterLayerRef.current = L.layerGroup().addTo(map);
    pathLayerRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;

    // Any touch, click or wheel on the map itself is the user taking over the view.
    // (Our own buttons sit outside this element, so they do not count.)
    const userTookOver = () => {
      autoFitRef.current = false;
    };
    el.addEventListener('pointerdown', userTookOver);
    el.addEventListener('wheel', userTookOver, { passive: true });
    map.on('dragstart', () => {
      followRef.current = false;
      setFollowing(false);
    });
    map.on('zoomend', recluster);

    // The box changes size when the phone's route list opens or the map goes full
    // screen. Leaflet measures its container once, so tell it.
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => map.invalidateSize()) : null;
    ro?.observe(el);

    return () => {
      // Reset EVERY ref this effect owns. React Strict Mode remounts in dev, and any
      // ref left populated makes the second mount silently skip the layer it guards.
      aliveRef.current = false;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      ro?.disconnect();
      el.removeEventListener('pointerdown', userTookOver);
      el.removeEventListener('wheel', userTookOver);
      markersRef.current.clear();
      enrichRef.current.clear();
      clusterLayerRef.current = null;
      clusterSigRef.current = '';
      pathLayerRef.current = null;
      stopsLayerRef.current = null;
      stopsFramedForRef.current = null;
      routeLineRef.current = null;
      fitSigRef.current = null;
      autoFitRef.current = true;
      map.remove();
      mapInstanceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Full screen uses the browser's own API on the wrapper, so the card and buttons
  // come along. Tracking the real state means Esc (which the browser handles) also
  // flips the button back.
  useEffect(() => {
    const onChange = () => {
      setFullscreen(document.fullscreenElement === wrapRef.current);
      setTimeout(() => mapInstanceRef.current?.invalidateSize(), 60);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Selection changed: drop the previous route's line and address, un-fold the picked
  // bus from any group, and centre + follow it.
  useEffect(() => {
    selectedIdRef.current = selectedRouteId;
    clearRouteLine();
    setEnrichment(null);
    setShowMore(false);
    const map = mapInstanceRef.current;
    const st = selectedRouteId ? markersRef.current.get(selectedRouteId) : null;
    if (map && st) {
      followRef.current = true;
      setFollowing(true);
      map.setView([st.anim.lat, st.anim.lng], Math.min(Math.max(map.getZoom(), 14), 16), { animate: true });
    } else {
      followRef.current = false;
      setFollowing(false);
    }
    recluster();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRouteId]);

  // Address + road snap (+ the road to campus when there is no recorded route line)
  // for the picked bus. Deps are the id plus the PRESENCE of its bus — not `buses`,
  // which would re-fire the lookup on every poll.
  const hasSelectedBus = selectedBus != null;
  useEffect(() => {
    if (!selectedBus) return;
    const { routeId, lat, lng } = selectedBus;
    void fetchEnrichment(lat, lng, { route: true, address: true }).then((e) => {
      if (!e || !aliveRef.current || selectedIdRef.current !== routeId) return;
      const map = mapInstanceRef.current;
      if (map && e.route && toCampusRef.current && !hasRoutePathRef.current) {
        clearRouteLine();
        routeLineRef.current = L.polyline(e.route.geometry, {
          color: '#2563eb', weight: 5, opacity: 0.85,
        }).addTo(map);
      }
      if (e.snapped) {
        enrichRef.current.set(routeId, { at: { lat, lng }, snapped: e.snapped });
        const cur = markersRef.current.get(routeId);
        if (cur) glideTo(cur, e.snapped);
      }
      setEnrichment({
        address: e.address,
        distanceKm: e.route?.distanceKm ?? null,
        durationMin: e.route?.durationMin ?? null,
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRouteId, hasSelectedBus]);

  // The picked route's recorded road: a white casing under a solid line, so it reads
  // on any map style. Keyed on a primitive signature of the points.
  const pathKey = hasRoutePath ? `${routePath!.length}:${routePath![0].join(',')}:${routePath![routePath!.length - 1].join(',')}` : '';
  useEffect(() => {
    const layer = pathLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (!hasRoutePath) return;
    clearRouteLine(); // the recorded road replaces the "road to campus" guess
    L.polyline(routePath!, { color: '#ffffff', weight: 8, opacity: 0.9, interactive: false }).addTo(layer);
    L.polyline(routePath!, { color: '#1d4ed8', weight: 4, opacity: 0.9, interactive: false }).addTo(layer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathKey]);

  // Stop pins for the picked route. Keyed on a primitive signature — this page polls,
  // so the array is new every few seconds and a redraw would close any open popup.
  const routeStopsKey = stopsSignature(routeStops);
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (!stopsLayerRef.current) stopsLayerRef.current = L.layerGroup().addTo(map);
    const list = routeStopsLatestRef.current;
    drawStopPins(stopsLayerRef.current, list, routeStopCount);

    // Frame the route ONCE per pick — and only for a route with no bus to follow.
    const key = list.length > 0 ? routeStopsRouteId ?? null : null;
    if (key && stopsFramedForRef.current !== key && !markersRef.current.has(key)) {
      const pts: [number, number][] = list.map((s) => [s.lat, s.lng]);
      pts.push([CAMPUS.lat, CAMPUS.lng]);
      map.fitBounds(L.latLngBounds(pts).pad(0.12), { maxZoom: FIT_MAX_ZOOM });
    }
    stopsFramedForRef.current = key;
  }, [routeStopsKey, routeStopsRouteId, routeStopCount]);

  // Diff markers against the latest data: update existing (glide + icon), add new,
  // remove gone. Also re-runs on the coarse clock, so a marker's LIVE tag expires.
  // The clock is bucketed to 10 s so a parent that ticks faster does not re-run this.
  const clockBucket = Math.floor(nowMs / 10_000);
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const list = buses ?? [];
    const seen = new Set<string>();

    for (const bus of list) {
      seen.add(bus.routeId);
      const target: LatLng = { lat: bus.lat, lng: bus.lng };
      const liveness = livenessOf(bus.lastFixAt, nowRef.current);
      const selected = bus.routeId === selectedRouteId;
      const iconOpts = { label: bus.routeNumber || '?', liveness, heading: bus.heading, selected };
      const sig = busMarkerSignature(iconOpts);
      const existing = markersRef.current.get(bus.routeId);
      const accuracy = liveness !== 'off' && bus.accuracyM != null && bus.accuracyM > 0 ? bus.accuracyM : null;
      const tip = escapeHtml(bus.registrationNumber ?? `Route ${bus.routeNumber ?? '?'}`);

      if (existing) {
        existing.bus = bus;
        // Rebuilding the icon restarts its animation, so only when it really changed.
        if (existing.iconSig !== sig) {
          existing.marker.setIcon(busMarkerIcon(iconOpts));
          existing.iconSig = sig;
        }
        existing.marker.setZIndexOffset(selected ? 2000 : liveness === 'live' ? 1200 : 1000);
        existing.marker.getTooltip()?.setContent(tip);

        if (accuracy != null) {
          if (!existing.circle) {
            existing.circle = L.circle([existing.anim.lat, existing.anim.lng], { radius: accuracy, color: '#16a34a', weight: 1, fillColor: '#16a34a', fillOpacity: 0.1, interactive: false });
            if (existing.shown) existing.circle.addTo(map);
          } else {
            existing.circle.setRadius(accuracy);
          }
        } else if (existing.circle) {
          existing.circle.remove();
          existing.circle = null;
        }

        // Only restart the glide when the bus actually reported a NEW position.
        if (target.lat !== existing.rawTarget.lat || target.lng !== existing.rawTarget.lng) {
          existing.rawTarget = target;
          if (shouldSnap(existing.anim, target)) {
            existing.anim = target;
            existing.from = target;
            existing.to = target;
            existing.moving = false;
            existing.marker.setLatLng([target.lat, target.lng]);
            existing.circle?.setLatLng([target.lat, target.lng]);
          } else {
            glideTo(existing, target);
          }
          if (selected && followRef.current) map.panTo([target.lat, target.lng], { animate: true });
        }
      } else {
        const marker = L.marker([target.lat, target.lng], {
          icon: busMarkerIcon(iconOpts),
          zIndexOffset: selected ? 2000 : liveness === 'live' ? 1200 : 1000,
        }).addTo(map);
        marker.bindTooltip(tip, { direction: 'top' });
        const circle = accuracy != null
          ? L.circle([target.lat, target.lng], { radius: accuracy, color: '#16a34a', weight: 1, fillColor: '#16a34a', fillOpacity: 0.1, interactive: false }).addTo(map)
          : null;
        const st: MarkerState = {
          marker, circle, anim: target, from: target, to: target, rawTarget: target,
          start: 0, moving: false, bus, iconSig: sig, shown: true,
        };
        markersRef.current.set(bus.routeId, st);
        // Bound ONCE. `st.bus` is replaced each update, so this always reads the current route.
        marker.on('click', () => onSelectRouteRef.current(st.bus.routeId));
      }
    }

    // Snap pass — keep reporting buses on the road. Runs after the loop above, which
    // retargets every marker to the RAW fix.
    for (const bus of list) {
      if (livenessOf(bus.lastFixAt, nowRef.current) === 'off') continue;
      const here: LatLng = { lat: bus.lat, lng: bus.lng };
      const prev = enrichRef.current.get(bus.routeId);
      const movedFar = !prev || haversineMeters(prev.at, here) >= REENRICH_M;

      if (prev?.snapped && !movedFar) {
        const st = markersRef.current.get(bus.routeId);
        if (st) st.to = prev.snapped;
      }

      if (selectedIdRef.current === bus.routeId) continue;
      if (!movedFar) continue;
      enrichRef.current.set(bus.routeId, { at: here, snapped: prev?.snapped ?? null });
      void fetchEnrichment(here.lat, here.lng, { route: false, address: false }).then((e) => {
        if (!e || !aliveRef.current) return;
        enrichRef.current.set(bus.routeId, { at: here, snapped: e.snapped });
        const st = markersRef.current.get(bus.routeId);
        if (st && e.snapped) glideTo(st, e.snapped);
      });
    }

    for (const [id, st] of markersRef.current) {
      if (!seen.has(id)) {
        st.marker.remove();
        st.circle?.remove();
        markersRef.current.delete(id);
        enrichRef.current.delete(id);
      }
    }

    recluster();

    // Auto-fit: when the SET of buses worth framing changes (first data, a bus starts
    // or stops), and only while the user has not taken over and nothing is picked.
    const active = list.filter((b) => livenessOf(b.lastFixAt, nowRef.current) !== 'off').map((b) => b.routeId).sort();
    const fitSig = active.length > 0 ? `a:${active.join(',')}` : `n:${list.map((b) => b.routeId).sort().join(',')}`;
    if (autoFitRef.current && !selectedIdRef.current && fitSigRef.current !== fitSig) {
      fitSigRef.current = fitSig;
      fitToBuses();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buses, clockBucket, selectedRouteId]);

  const fitAll = () => {
    autoFitRef.current = true;
    followRef.current = false;
    setFollowing(false);
    fitToBuses();
  };

  const focusSelected = () => {
    const map = mapInstanceRef.current;
    const st = selectedRouteId ? markersRef.current.get(selectedRouteId) : null;
    if (!map || !st) return;
    followRef.current = true;
    setFollowing(true);
    map.setView([st.anim.lat, st.anim.lng], Math.min(Math.max(map.getZoom(), 15), 17), { animate: true });
  };

  // The pinned fallback has no browser Esc handling, so add it.
  useEffect(() => {
    if (!pseudoFull) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPseudoFull(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pseudoFull]);

  const toggleFullscreen = () => {
    const el = wrapRef.current;
    if (!el) return;
    if (pseudoFull) {
      setPseudoFull(false);
      return;
    }
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    if (document.fullscreenEnabled && el.requestFullscreen) {
      // If the browser refuses (policy, iframe), fall back to the pinned view.
      el.requestFullscreen().catch(() => setPseudoFull(true));
    } else {
      setPseudoFull(true);
    }
  };
  const isFull = fullscreen || pseudoFull;

  const copyCoords = (text: string) => {
    void navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => undefined,
    );
  };

  const selLiveness = selectedBus ? livenessOf(selectedBus.lastFixAt, nowMs) : 'off';
  const selCompass = selectedBus && selLiveness === 'live' ? compassOf(selectedBus.heading) : null;
  const selCoords = selectedBus ? `${selectedBus.lat.toFixed(5)}, ${selectedBus.lng.toFixed(5)}` : '';
  const hasOld = buses.some((b) => livenessOf(b.lastFixAt, nowMs) === 'off');

  return (
    // No tall min-height here: the caller sizes the box.
    <div
      ref={wrapRef}
      className={
        pseudoFull
          ? 'fixed inset-0 z-[9999] isolate h-dvh w-screen bg-white dark:bg-gray-900'
          : 'relative isolate h-full min-h-[120px] w-full bg-white dark:bg-gray-900'
      }
    >
      <div ref={mapRef} className="absolute inset-0" />

      {/* Top-right, under Leaflet's layers button. The bottom of the map belongs to the
          selected-bus card, which is as wide as the map on a phone. */}
      <div className="absolute right-2.5 top-[4.25rem] z-[1000] flex flex-col items-end gap-1.5">
        {buses.length > 0 && (
          <button type="button" onClick={fitAll} className={CONTROL_BTN}>
            <Scan className="h-4 w-4" /> Fit all buses
          </button>
        )}
        {selectedBus && !following && (
          <button type="button" onClick={focusSelected} className={CONTROL_BTN}>
            <Crosshair className="h-4 w-4" /> Focus bus
          </button>
        )}
        <button
          type="button"
          onClick={toggleFullscreen}
          aria-label={isFull ? 'Exit full screen' : 'Full screen map'}
          title={isFull ? 'Exit full screen (Esc)' : 'Full screen map'}
          className={CONTROL_BTN}
        >
          {isFull ? <Minimize2 className="h-4 w-4" aria-hidden /> : <Maximize2 className="h-4 w-4" aria-hidden />}
          {isFull ? 'Exit' : 'Full screen'}
        </button>
      </div>

      {hasOld && (
        <p className="pointer-events-none absolute left-14 top-2.5 z-[1000] rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium text-gray-600 shadow-sm dark:bg-gray-900/90 dark:text-gray-300">
          Grey bus = last known place
        </p>
      )}

      {buses.length === 0 && emptyMessage && (
        <div className="pointer-events-none absolute inset-0 z-[1000] flex items-center justify-center p-4">
          <div className="rounded-xl border border-gray-200 bg-white/95 px-4 py-3 text-center shadow-lg dark:border-gray-700 dark:bg-gray-900/95">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">{emptyMessage.title}</p>
            {emptyMessage.detail && <p className="mt-0.5 max-w-xs text-xs text-gray-500 dark:text-gray-400">{emptyMessage.detail}</p>}
          </div>
        </div>
      )}

      {selectedBus && (
        <div className="absolute bottom-3 left-3 right-3 z-[1000] max-w-[330px] rounded-xl border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-900">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-base font-bold tracking-wide text-gray-900 dark:text-white">
                {selectedBus.registrationNumber ?? 'No bus number'}
              </p>
              <p className="truncate text-xs text-gray-600 dark:text-gray-300">
                Route {selectedBus.routeNumber ?? '?'}
                {selectedBus.routeName ? ` · ${selectedBus.routeName}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onSelectRoute(null)}
              aria-label="Clear selection"
              className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            >
              ×
            </button>
          </div>

          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-semibold ${LIVENESS_CHIP[selLiveness]}`}>
              <span className="h-2 w-2 rounded-full" style={{ background: BUS_COLORS[selLiveness] }} aria-hidden />
              {selLiveness === 'live' ? 'LIVE' : selLiveness === 'delayed' ? 'Delayed' : 'Not sharing now'}
            </span>
            <span className="text-gray-600 dark:text-gray-300">
              {selectedBus.lastFixAt
                ? `${selLiveness === 'off' ? 'last seen' : 'updated'} ${agoText(selectedBus.lastFixAt, nowMs)}`
                : 'no position yet'}
            </span>
          </p>
          {selLiveness === 'off' && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{selectedBus.reason}</p>
          )}

          {selLiveness !== 'off' && (
            <p className="mt-1.5 text-xs font-medium text-gray-800 dark:text-gray-200">
              {[
                selectedBus.speedKmh != null ? `${Math.round(selectedBus.speedKmh)} km/h` : null,
                selCompass ? `heading ${selCompass}` : null,
                selectedBus.accuracyM != null ? `±${Math.round(selectedBus.accuracyM)} m` : null,
              ].filter(Boolean).join(' · ') || 'Speed not reported'}
            </p>
          )}

          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {enrichment?.address ?? 'Finding the place…'}
          </p>
          {toCampus && selLiveness !== 'off' && enrichment?.distanceKm != null && (
            <p className="mt-1 text-xs text-green-700 dark:text-green-400">
              {enrichment.distanceKm.toFixed(1)} km to campus
              {enrichment.durationMin != null ? ` · about ${enrichment.durationMin} min` : ''}
            </p>
          )}
          {stopSummary && selLiveness !== 'off' ? (
            <p className="mt-1 text-xs font-medium text-violet-700 dark:text-violet-300">
              {stopSummary.headline}
              {stopSummary.detail ? <span className="font-normal"> · {stopSummary.detail}</span> : null}
            </p>
          ) : stopsSetupHref ? (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              No stop pins for this route yet.{' '}
              <a href={stopsSetupHref} className="font-medium text-violet-700 underline dark:text-violet-300">
                Set stop locations
              </a>
            </p>
          ) : null}

          {showMore && (
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-gray-100 pt-2 text-xs dark:border-gray-800">
              <dt className="text-gray-400 dark:text-gray-500">Position</dt>
              <dd className="flex min-w-0 items-center gap-2 text-gray-700 dark:text-gray-300">
                <span className="truncate font-mono">{selCoords}</span>
                <button type="button" onClick={() => copyCoords(selCoords)} className="shrink-0 font-medium text-blue-700 underline dark:text-blue-400">
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </dd>
              <dt className="text-gray-400 dark:text-gray-500">Reported</dt>
              <dd className="truncate text-gray-700 dark:text-gray-300">
                {selectedBus.lastFixAt ? new Date(selectedBus.lastFixAt).toLocaleString('en-IN') : 'Never'}
              </dd>
              <dt className="text-gray-400 dark:text-gray-500">Heading</dt>
              <dd className="text-gray-700 dark:text-gray-300">
                {selectedBus.heading != null ? `${Math.round(selectedBus.heading)}°${compassOf(selectedBus.heading) ? ` (${compassOf(selectedBus.heading)})` : ''}` : 'Not reported'}
              </dd>
              <dt className="text-gray-400 dark:text-gray-500">Accuracy</dt>
              <dd className="text-gray-700 dark:text-gray-300">
                {selectedBus.accuracyM != null ? `within ${Math.round(selectedBus.accuracyM)} m` : 'Not reported'}
              </dd>
            </dl>
          )}

          <div className="mt-2 flex items-center justify-between gap-2 border-t border-gray-100 pt-2 dark:border-gray-800">
            <span className="min-w-0 truncate text-xs text-gray-600 dark:text-gray-300">
              {selectedBus.driverName ?? 'No driver assigned'}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setShowMore((v) => !v)}
                aria-expanded={showMore}
                className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                {showMore ? 'Less' : 'More'}
              </button>
              {selectedBus.driverPhone && (
                <a
                  href={`tel:${selectedBus.driverPhone.replace(/\s/g, '')}`}
                  className="rounded-lg bg-green-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-green-700"
                >
                  Call driver
                </a>
              )}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveTrackingMap;
