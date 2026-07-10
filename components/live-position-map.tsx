'use client';

import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { interpolateLatLng, shouldSnap, type LatLng } from '@/lib/gps/interpolate';

// Fix Leaflet's default marker icon paths (same CDN icons the admin map uses).
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

export interface StopPoint {
  name: string;
  lat: number;
  lng: number;
}

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
  /** Optional route stops (future phase — pins + dashed connecting line). */
  stops?: StopPoint[];
}

// Glide slightly under the 5s reader poll so the marker settles just before the next fix.
const GLIDE_MS = 4500;

// Bus marker: SVG arrow-in-circle we rotate to the heading; plain dot when unknown.
function busIcon(heading: number | null | undefined): L.DivIcon {
  const rot = heading == null || Number.isNaN(heading) ? null : heading;
  const glyph = rot == null
    ? `<circle cx="14" cy="14" r="6" fill="#fff"/>`
    : `<path d="M14 5 L20 21 L14 17 L8 21 Z" fill="#fff" transform="rotate(${rot} 14 14)"/>`;
  return L.divIcon({
    className: 'bus-marker',
    html: `<div style="width:28px;height:28px;border-radius:50%;background:#16a34a;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;"><svg width="28" height="28" viewBox="0 0 28 28">${glyph}</svg></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
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

/** Single-marker live map. Reused by the driver self-view and the student/boarding
 *  where's-my-bus pages. The bus GLIDES to each new fix; a campus pin, heading arrow,
 *  accuracy circle, "you" marker and (future) route stops layer on top. Always load
 *  via next/dynamic with { ssr: false }. */
const LivePositionMap: React.FC<LivePositionMapProps> = ({
  latitude, longitude, label, zoom = 15,
  heading, accuracyM, destination, viewer, stops,
}) => {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const accuracyRef = useRef<L.Circle | null>(null);
  const campusRef = useRef<L.Marker | null>(null);
  const viewerRef = useRef<L.Marker | null>(null);
  const stopsRef = useRef<L.LayerGroup | null>(null);
  const hasFitRef = useRef(false);

  const animPosRef = useRef<LatLng>({ lat: latitude, lng: longitude });
  const fromRef = useRef<LatLng>({ lat: latitude, lng: longitude });
  const toRef = useRef<LatLng>({ lat: latitude, lng: longitude });
  const startRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);

  // Initialise once.
  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const map = L.map(elRef.current).setView([latitude, longitude], zoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);
    const marker = L.marker([latitude, longitude], { icon: busIcon(heading) }).addTo(map);
    if (label) marker.bindPopup(label);
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
      hasFitRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bus glide + icon + accuracy circle.
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    const target: LatLng = { lat: latitude, lng: longitude };
    marker.setIcon(busIcon(heading));
    if (label) marker.bindPopup(label);

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
      map.panTo([target.lat, target.lng], { animate: true });
      return;
    }

    fromRef.current = { ...animPosRef.current };
    toRef.current = target;
    startRef.current = performance.now();
    map.panTo([target.lat, target.lng], { animate: true });
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
  }, [latitude, longitude, label, heading, accuracyM]);

  // Campus destination marker.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (destination) {
      const pos: [number, number] = [destination.lat, destination.lng];
      if (!campusRef.current) {
        campusRef.current = L.marker(pos, { icon: campusIcon() }).addTo(map);
        campusRef.current.bindPopup(destination.label ?? 'Campus');
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
        viewerRef.current = L.marker(pos, { icon: viewerIcon() }).addTo(map);
        viewerRef.current.bindPopup('You are here');
      } else {
        viewerRef.current.setLatLng(pos);
      }
    } else if (viewerRef.current) {
      viewerRef.current.remove();
      viewerRef.current = null;
    }
  }, [viewer]);

  // Optional route stops (future phase): pins + dashed connecting polyline.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (stopsRef.current) { stopsRef.current.remove(); stopsRef.current = null; }
    if (stops && stops.length > 0) {
      const group = L.layerGroup();
      const line: [number, number][] = [];
      for (const s of stops) {
        line.push([s.lat, s.lng]);
        // TODO (stops phase): stop names are free-text — escape before bindPopup (Leaflet renders raw HTML).
        L.circleMarker([s.lat, s.lng], {
          radius: 5, color: '#7c3aed', fillColor: '#7c3aed', fillOpacity: 0.9, weight: 2,
        }).bindPopup(s.name).addTo(group);
      }
      if (line.length > 1) {
        L.polyline(line, { color: '#7c3aed', weight: 3, opacity: 0.5, dashArray: '6 6' }).addTo(group);
      }
      group.addTo(map);
      stopsRef.current = group;
    }
  }, [stops]);

  // Frame bus + destination (+ viewer) into view ONCE; then leave the user's pan/zoom.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || hasFitRef.current) return;
    const pts: [number, number][] = [[latitude, longitude]];
    if (destination) pts.push([destination.lat, destination.lng]);
    if (viewer) pts.push([viewer.lat, viewer.lng]);
    if (pts.length > 1) {
      map.fitBounds(L.latLngBounds(pts).pad(0.2));
      hasFitRef.current = true;
    }
  }, [latitude, longitude, destination, viewer]);

  return <div ref={elRef} style={{ width: '100%', height: '100%', minHeight: '320px' }} />;
};

export default LivePositionMap;
