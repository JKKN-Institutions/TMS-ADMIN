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

interface LivePositionMapProps {
  latitude: number;
  longitude: number;
  label?: string;
  /** Zoom level; 15 ≈ street level. */
  zoom?: number;
}

// Glide slightly under the 5s reader poll so the marker settles just before the next fix.
const GLIDE_MS = 4500;

/** Minimal single-marker live map. Reused by the driver self-view and the student/boarding
 *  where's-my-bus pages. The marker GLIDES to each new fix (see lib/gps/interpolate) instead
 *  of teleporting, so a 5s-polled position reads as continuous motion. Always load via
 *  next/dynamic with { ssr: false }. */
const LivePositionMap: React.FC<LivePositionMapProps> = ({ latitude, longitude, label, zoom = 15 }) => {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  // Glide state: where the marker is being drawn now, and the segment it's animating along.
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
    const marker = L.marker([latitude, longitude]).addTo(map);
    if (label) marker.bindPopup(label);
    mapRef.current = map;
    markerRef.current = marker;
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Initialise with the first coords only; updates handled by the glide effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Glide the marker to new coords when they change.
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    const target: LatLng = { lat: latitude, lng: longitude };
    if (label) marker.bindPopup(label);

    // First fix or an implausible jump → place instantly (gliding would streak the map).
    if (shouldSnap(animPosRef.current, target)) {
      animPosRef.current = target;
      fromRef.current = target;
      toRef.current = target;
      marker.setLatLng([target.lat, target.lng]);
      map.panTo([target.lat, target.lng], { animate: true });
      return;
    }

    // Glide from wherever the marker is being drawn now → the new fix over GLIDE_MS.
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
      rafRef.current = t < 1 ? requestAnimationFrame(step) : null;
    };
    rafRef.current = requestAnimationFrame(step);
  }, [latitude, longitude, label]);

  return <div ref={elRef} style={{ width: '100%', height: '100%', minHeight: '320px' }} />;
};

export default LivePositionMap;
