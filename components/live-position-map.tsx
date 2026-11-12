'use client';

import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair, Maximize2, Minimize2, Route as RouteIcon } from 'lucide-react';
import { interpolateLatLng, shouldSnap, type LatLng } from '@/lib/gps/interpolate';
import { stopsSignature, type MapStop } from '@/lib/stops/map-stops';
import { drawStopPins } from '@/components/map/stop-pins';
import { busMarkerIcon, busMarkerSignature } from '@/components/map/bus-marker';
import { addBaseLayers } from '@/components/map/base-layers';
import type { Liveness } from '@/lib/gps/liveness';

// Fix Leaflet's default marker icon paths (same CDN icons the admin map uses).
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface LivePositionMapProps {
  latitude: number;
  longitude: number;
  label?: string;
  /** Zoom level; 15 ≈ street level. */
  zoom?: number;
  /** Compass heading (deg clockwise from north) — rotates the bus arrow. */
  heading?: number | null;
  /** GPS accuracy in metres — drawn as a translucent circle around the bus. */
  accuracyM?: number | null;
  /** Fixed destination (campus) marker. */
  destination?: { lat: number; lng: number; label?: string } | null;
  /** The viewer's own location ("you are here"). */
  viewer?: LatLng | null;
  /** The route's confirmed stops, as numbered pins (see lib/stops/map-stops). */
  stops?: MapStop[];
  /** Stops on the whole route, for "Stop 5 of 23" while some are still unplaced. */
  routeStopCount?: number;
  /**
   * live = the bus is reporting now. stale = this is only its last known position
   * (drawn faded, never followed). none = no position at all: the bus is not drawn and
   * the map frames the stops instead; latitude/longitude are then just a map centre.
   */
  busState?: 'live' | 'stale' | 'none';
  /**
   * How current the position is, for the marker's look (green LIVE / amber delayed /
   * grey). Defaults from busState: live → live, stale → off.
   */
  liveness?: Liveness;
  /** The road this route's bus drives, from a recorded trip: the route line. */
  routePath?: [number, number][] | null;
  /** Road route (bus → campus) as [lat,lng] points; drawn as a solid blue polyline. */
  routeGeometry?: [number, number][];
}

// Glide slightly under the 5s reader poll so the marker settles just before the next fix.
const GLIDE_MS = 4500;

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
/** Labels are free text from the DB and Leaflet renders popup HTML raw. */
function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => HTML_ESCAPES[c]);
}

function campusIcon(): L.DivIcon {
  return L.divIcon({
    className: 'campus-marker',
    html: `<div style="width:26px;height:26px;border-radius:6px;background:#dc2626;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font-size:14px;">🎓</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

function viewerIcon(): L.DivIcon {
  return L.divIcon({
    className: 'viewer-marker',
    html: `<div style="width:18px;height:18px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 4px rgba(37,99,235,.25);"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

const CONTROL_BTN =
  'inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 text-[13px] font-semibold text-gray-700 shadow-[0_1px_4px_rgba(0,0,0,0.25)] hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700';

/** Single-bus live map. Reused by the driver self-view, the student/boarding
 *  where's-my-bus pages and the admin Vehicles "Live track" popup. The bus GLIDES to
 *  each new fix; a campus pin, heading arrow, accuracy circle, "you" marker and the
 *  route's numbered stop pins layer on top. Always load via next/dynamic with
 *  { ssr: false }. */
const LivePositionMap: React.FC<LivePositionMapProps> = ({
  latitude, longitude, label, zoom = 15,
  heading, accuracyM, destination, viewer, stops, routeStopCount, routeGeometry, busState = 'live', liveness, routePath,
}) => {
  const look: Liveness = liveness ?? (busState === 'stale' ? 'off' : 'live');
  const iconSigRef = useRef('');
  const pathLayerRef = useRef<L.LayerGroup | null>(null);
  const busStateRef = useRef(busState);
  const prevBusStateRef = useRef(busState);
  busStateRef.current = busState;
  const wrapRef = useRef<HTMLDivElement>(null);
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const accuracyRef = useRef<L.Circle | null>(null);
  const campusRef = useRef<L.Marker | null>(null);
  const viewerRef = useRef<L.Marker | null>(null);
  const stopsRef = useRef<L.LayerGroup | null>(null);
  const routeLineRef = useRef<L.Polyline | null>(null);
  const hasFitRef = useRef(false);

  const animPosRef = useRef<LatLng>({ lat: latitude, lng: longitude });
  const fromRef = useRef<LatLng>({ lat: latitude, lng: longitude });
  const toRef = useRef<LatLng>({ lat: latitude, lng: longitude });
  const startRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);

  // The camera follows the bus until the user drags the map to look at something —
  // a stop pin, say. Without this the map snapped back to the bus on every fix, so a
  // pin could not be inspected for more than a few seconds. The ref is what the
  // per-fix effect reads; the state only shows/hides the "Follow bus" button.
  const followRef = useRef(true);
  const [following, setFollowing] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);

  // Latest stops for the "Whole route" button, without making it a dependency.
  const stopsLatestRef = useRef<MapStop[]>(stops ?? []);
  stopsLatestRef.current = stops ?? [];

  // Initialise once.
  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const map = L.map(elRef.current).setView([latitude, longitude], zoom);
    // Street / Light / Satellite, with the viewer's last choice remembered.
    addBaseLayers(map);
    pathLayerRef.current = L.layerGroup().addTo(map);
    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);
    // The bus always draws above every stop pin (their offsets top out at 300).
    const firstIcon = { liveness: look, heading };
    iconSigRef.current = busMarkerSignature(firstIcon);
    const marker = L.marker([latitude, longitude], { icon: busMarkerIcon(firstIcon), zIndexOffset: 1000 }).addTo(map);
    if (label) marker.bindPopup(esc(label));
    // Only a drag by the USER stops following; our own panTo calls do not fire dragstart.
    map.on('dragstart', () => {
      followRef.current = false;
      setFollowing(false);
    });
    mapRef.current = map;
    markerRef.current = marker;
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      accuracyRef.current = null;
      campusRef.current = null;
      viewerRef.current = null;
      stopsRef.current = null;
      routeLineRef.current = null;
      pathLayerRef.current = null;
      iconSigRef.current = '';
      hasFitRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fullscreen uses the browser's own Fullscreen API rather than a fixed-position
  // overlay: the map sits inside cards with their own stacking contexts, which would
  // trap an overlay under the app's navigation bars. Hidden where unsupported
  // (iPhone Safari).
  useEffect(() => {
    setCanFullscreen(typeof document !== 'undefined' && !!document.fullscreenEnabled);
    const onChange = () => {
      setFullscreen(document.fullscreenElement === wrapRef.current);
      // The container just changed size; Leaflet must re-measure or it leaves grey bands.
      setTimeout(() => mapRef.current?.invalidateSize(), 60);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // The map's box changes size when the details panel beside it opens or closes.
  // Leaflet only measures its container once, so tell it, or it leaves grey bands.
  useEffect(() => {
    const el = elRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => mapRef.current?.invalidateSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Faded for a last-known position, hidden when there is none.
  useEffect(() => {
    markerRef.current?.setOpacity(busState === 'none' ? 0 : 1);
    // A hidden bus must not be tappable either.
    const iconEl = markerRef.current?.getElement();
    if (iconEl) iconEl.style.pointerEvents = busState === 'none' ? 'none' : '';
    if (busState !== 'live') {
      followRef.current = false;
      setFollowing(false);
    } else if (prevBusStateRef.current !== 'live') {
      // The bus just appeared (the driver tapped START TRIP, or it began reporting):
      // go to it and follow it from here on.
      followRef.current = true;
      setFollowing(true);
      // This render's position: the glide effect below has not run yet.
      const p = { lat: latitude, lng: longitude };
      mapRef.current?.setView([p.lat, p.lng], 16, { animate: true });
    }
    prevBusStateRef.current = busState;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busState]);

  // Bus glide + icon + accuracy circle.
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    const target: LatLng = { lat: latitude, lng: longitude };
    // Rebuilding the icon restarts its animation, so only when its look really changed.
    const iconOpts = { liveness: look, heading };
    const sig = busMarkerSignature(iconOpts);
    if (sig !== iconSigRef.current) {
      marker.setIcon(busMarkerIcon(iconOpts));
      iconSigRef.current = sig;
      // setIcon replaces the element, so a hidden bus must be re-hidden from taps.
      const el = marker.getElement();
      if (el) el.style.pointerEvents = busStateRef.current === 'none' ? 'none' : '';
    }
    if (label) marker.bindPopup(esc(label));

    if (accuracyM != null && accuracyM > 0) {
      if (!accuracyRef.current) {
        accuracyRef.current = L.circle(target, {
          radius: accuracyM, color: '#16a34a', weight: 1, fillColor: '#16a34a', fillOpacity: 0.12,
        }).addTo(map);
      } else {
        accuracyRef.current.setLatLng(target);
        accuracyRef.current.setRadius(accuracyM);
      }
    } else if (accuracyRef.current) {
      accuracyRef.current.remove();
      accuracyRef.current = null;
    }

    // First fix or an implausible jump → place instantly.
    if (shouldSnap(animPosRef.current, target)) {
      animPosRef.current = target;
      fromRef.current = target;
      toRef.current = target;
      marker.setLatLng([target.lat, target.lng]);
      if (followRef.current) map.panTo([target.lat, target.lng], { animate: true });
      return;
    }

    fromRef.current = { ...animPosRef.current };
    toRef.current = target;
    startRef.current = performance.now();
    if (followRef.current) map.panTo([target.lat, target.lng], { animate: true });
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    const step = () => {
      const t = Math.min(1, (performance.now() - startRef.current) / GLIDE_MS);
      const pos = interpolateLatLng(fromRef.current, toRef.current, t);
      animPosRef.current = pos;
      markerRef.current?.setLatLng([pos.lat, pos.lng]);
      accuracyRef.current?.setLatLng([pos.lat, pos.lng]);
      rafRef.current = t < 1 ? requestAnimationFrame(step) : null;
    };
    rafRef.current = requestAnimationFrame(step);
  }, [latitude, longitude, label, heading, accuracyM, look]);

  // Campus destination marker.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (destination) {
      const pos: [number, number] = [destination.lat, destination.lng];
      if (!campusRef.current) {
        campusRef.current = L.marker(pos, { icon: campusIcon(), zIndexOffset: 500 }).addTo(map);
        campusRef.current.bindPopup(esc(destination.label ?? 'Campus'));
      } else {
        campusRef.current.setLatLng(pos);
      }
    } else if (campusRef.current) {
      campusRef.current.remove();
      campusRef.current = null;
    }
  }, [destination]);

  // Viewer ("you are here") marker.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (viewer) {
      const pos: [number, number] = [viewer.lat, viewer.lng];
      if (!viewerRef.current) {
        viewerRef.current = L.marker(pos, { icon: viewerIcon(), zIndexOffset: 600 }).addTo(map);
        viewerRef.current.bindPopup('You are here');
      } else {
        viewerRef.current.setLatLng(pos);
      }
    } else if (viewerRef.current) {
      viewerRef.current.remove();
      viewerRef.current = null;
    }
  }, [viewer]);

  // Stop pins. Keyed on a primitive signature, not the array: callers poll, so the
  // array is new every few seconds, and redrawing would close whatever popup is open.
  const stopsKey = stopsSignature(stops);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!stopsRef.current) stopsRef.current = L.layerGroup().addTo(map);
    drawStopPins(stopsRef.current, stopsLatestRef.current, routeStopCount);
  }, [stopsKey, routeStopCount]);

  // Road route (bus → campus): solid blue polyline. Redraws when the route changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (routeLineRef.current) {
      routeLineRef.current.remove();
      routeLineRef.current = null;
    }
    if (routeGeometry && routeGeometry.length > 1) {
      routeLineRef.current = L.polyline(routeGeometry, {
        color: '#2563eb',
        weight: 5,
        opacity: 0.8,
      }).addTo(map);
    }
  }, [routeGeometry]);

  // The route line: the road this bus really drives, from a recorded trip. A white
  // casing under a solid line so it reads on every map style. Keyed on a primitive
  // signature — callers poll, so the array is new each time.
  const pathKey = routePath && routePath.length > 1
    ? `${routePath.length}:${routePath[0].join(',')}:${routePath[routePath.length - 1].join(',')}`
    : '';
  useEffect(() => {
    const layer = pathLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (!routePath || routePath.length < 2) return;
    L.polyline(routePath, { color: '#ffffff', weight: 8, opacity: 0.9, interactive: false }).addTo(layer);
    L.polyline(routePath, { color: '#1d4ed8', weight: 4, opacity: 0.9, interactive: false }).addTo(layer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathKey]);

  // Frame bus + destination (+ viewer) into view ONCE; then leave the user's pan/zoom.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || hasFitRef.current) return;
    const pts: [number, number][] = busStateRef.current === 'none' ? [] : [[latitude, longitude]];
    if (destination) pts.push([destination.lat, destination.lng]);
    if (viewer) pts.push([viewer.lat, viewer.lng]);
    // With no live bus to look at, the stops are the picture.
    if (busStateRef.current !== 'live') for (const s of stopsLatestRef.current) pts.push([s.lat, s.lng]);
    if (pts.length > 1) {
      map.fitBounds(L.latLngBounds(pts).pad(0.2), { maxZoom: 16 });
      hasFitRef.current = true;
    }
  }, [latitude, longitude, destination, viewer]);

  const followBus = () => {
    followRef.current = true;
    setFollowing(true);
    const p = animPosRef.current;
    const map = mapRef.current;
    if (map) map.setView([p.lat, p.lng], Math.min(Math.max(map.getZoom(), 15), 17), { animate: true });
  };

  const showWholeRoute = () => {
    const map = mapRef.current;
    if (!map) return;
    const pts: [number, number][] = busStateRef.current === 'none' ? [] : [[animPosRef.current.lat, animPosRef.current.lng]];
    if (destination) pts.push([destination.lat, destination.lng]);
    for (const s of stopsLatestRef.current) pts.push([s.lat, s.lng]);
    if (pts.length < 2) return;
    // Zooming out to the whole route is the user choosing an overview: stop following
    // so the next fix does not drag the view back to the bus.
    followRef.current = false;
    setFollowing(false);
    map.fitBounds(L.latLngBounds(pts).pad(0.12), { maxZoom: 16 });
  };

  const toggleFullscreen = () => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen().catch(() => undefined);
  };

  return (
    <div ref={wrapRef} className="relative isolate h-full w-full bg-white" style={{ minHeight: '200px' }}>
      <div ref={elRef} className="absolute inset-0" />
      {/* Bottom-left, above the scale bar: top-right is Leaflet's layers control and
          bottom-right is where the app's floating buttons sit on a phone. */}
      <div className="absolute bottom-9 left-2 z-[1000] flex flex-col items-start gap-1.5">
        {!following && busState === 'live' && (
          <button type="button" onClick={followBus} className={CONTROL_BTN}>
            <Crosshair className="h-4 w-4" /> Follow bus
          </button>
        )}
        {(destination || (stops?.length ?? 0) > 0) && (
          <button type="button" onClick={showWholeRoute} className={CONTROL_BTN}>
            <RouteIcon className="h-4 w-4" /> Whole route
          </button>
        )}
        {canFullscreen && (
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={fullscreen ? 'Exit full screen' : 'Full screen map'}
            className={CONTROL_BTN}
          >
            {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            {fullscreen ? 'Exit' : 'Full screen'}
          </button>
        )}
      </div>
    </div>
  );
};

export default LivePositionMap;
