'use client';

import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

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

/** Minimal single-marker live map. Reused by the driver self-view and the student
 *  where's-my-bus page. Always load via next/dynamic with { ssr: false }. */
const LivePositionMap: React.FC<LivePositionMapProps> = ({ latitude, longitude, label, zoom = 15 }) => {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

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
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Initialise with the first coords only; updates handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Move marker + recentre when coords change.
  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;
    markerRef.current.setLatLng([latitude, longitude]);
    if (label) markerRef.current.bindPopup(label);
    mapRef.current.panTo([latitude, longitude]);
  }, [latitude, longitude, label]);

  return <div ref={elRef} style={{ width: '100%', height: '100%', minHeight: '320px' }} />;
};

export default LivePositionMap;
