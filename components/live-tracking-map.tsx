'use client';

import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { interpolateLatLng, shouldSnap, type LatLng } from '@/lib/gps/interpolate';

// Fix for default markers in Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface DriverLocation {
  id: string;
  name: string;
  current_latitude: number;
  current_longitude: number;
  location_accuracy: number | null;
  location_timestamp: string;
  last_location_update: string;
  location_sharing_enabled: boolean;
  location_tracking_status: string;
  route_id: string | null;
  route_number: string | null;
  route_name: string | null;
  vehicle_id: string | null;
  registration_number: string | null;
  gps_status?: string;
  time_since_update?: number | null;
}

interface LiveTrackingMapProps {
  driverLocations: DriverLocation[];
}

// Glide slightly under the 5s reader poll so each marker settles just before the next fix.
const GLIDE_MS = 4500;
const DEFAULT_CENTER: [number, number] = [11.4444567, 77.730258]; // Tamil Nadu area

// Per-driver marker + the segment it is currently animating along.
interface MarkerState {
  marker: L.Marker;
  anim: LatLng;
  from: LatLng;
  to: LatLng;
  start: number;
}

const STATUS_COLORS: Record<string, string> = {
  online: '#10B981',
  recent: '#F59E0B',
  offline: '#EF4444',
  inactive: '#6B7280',
};

function createCustomIcon(status: string, isActive: boolean, routeNumber: string | null): L.DivIcon {
  const color = isActive ? STATUS_COLORS[status] || STATUS_COLORS.inactive : STATUS_COLORS.inactive;
  const displayText = routeNumber || '?';
  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="
        background: ${color}; width: 24px; height: 24px; border-radius: 50%;
        border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        display: flex; align-items: center; justify-content: center;
        color: white; font-weight: bold; font-size: 11px; font-family: Arial, sans-serif;
      ">${displayText}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

function buildPopup(driver: DriverLocation): string {
  const status = driver.gps_status || 'offline';
  const dot = STATUS_COLORS[status] || STATUS_COLORS.offline;
  return `
    <div style="min-width: 250px; font-family: system-ui, -apple-system, sans-serif;">
      <div style="margin-bottom: 12px;">
        <h3 style="margin: 0 0 8px 0; color: #111827; font-size: 16px; font-weight: 600;">${driver.name}</h3>
        <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 8px;">
          <div style="width: 8px; height: 8px; border-radius: 50%; background: ${dot};"></div>
          <span style="font-size: 12px; color: #6B7280; text-transform: capitalize;">
            ${status} ${driver.location_sharing_enabled ? '(Active)' : '(Inactive)'}
          </span>
        </div>
      </div>
      <div style="font-size: 13px; color: #374151;">
        ${driver.route_name ? `<div style="margin-bottom: 6px;"><strong>Route:</strong> ${driver.route_number} - ${driver.route_name}</div>` : ''}
        ${driver.registration_number ? `<div style="margin-bottom: 6px;"><strong>Vehicle:</strong> ${driver.registration_number}</div>` : ''}
        <div style="margin-bottom: 6px;"><strong>Last Update:</strong> ${
          driver.time_since_update != null ? `${driver.time_since_update} min ago` : 'Never'
        }</div>
        ${driver.location_accuracy ? `<div style="margin-bottom: 6px;"><strong>Accuracy:</strong> ±${Math.round(driver.location_accuracy)}m</div>` : ''}
        <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #E5E7EB;">
          <div style="font-size: 11px; color: #9CA3AF;">${driver.current_latitude.toFixed(6)}, ${driver.current_longitude.toFixed(6)}</div>
        </div>
      </div>
    </div>`;
}

const LiveTrackingMap: React.FC<LiveTrackingMapProps> = ({ driverLocations }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, MarkerState>>(new Map());
  const rafRef = useRef<number | null>(null);
  const hasFitRef = useRef(false);

  const fitToMarkers = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const markers = [...markersRef.current.values()].map((s) => s.marker);
    if (markers.length === 0) return;
    map.fitBounds(L.featureGroup(markers).getBounds().pad(0.15));
  };

  // Initialise the map once, and run ONE animation loop that glides every marker.
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current).setView(DEFAULT_CENTER, 10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);
    mapInstanceRef.current = map;

    const stepAll = () => {
      const now = performance.now();
      for (const st of markersRef.current.values()) {
        const t = Math.min(1, (now - st.start) / GLIDE_MS);
        const pos = interpolateLatLng(st.from, st.to, t);
        st.anim = pos;
        st.marker.setLatLng([pos.lat, pos.lng]);
      }
      rafRef.current = requestAnimationFrame(stepAll);
    };
    rafRef.current = requestAnimationFrame(stepAll);

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      markersRef.current.clear();
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Diff markers against the latest data: update existing (glide + icon + popup),
  // add new, remove gone. No clear-all, no fitBounds-every-poll (the old flicker).
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const withLoc = (driverLocations || []).filter(
      (d) => d.current_latitude && d.current_longitude
    );
    const seen = new Set<string>();

    for (const d of withLoc) {
      seen.add(d.id);
      const target: LatLng = { lat: d.current_latitude, lng: d.current_longitude };
      const icon = createCustomIcon(d.gps_status || 'offline', d.location_sharing_enabled, d.route_number);
      const popup = buildPopup(d);
      const existing = markersRef.current.get(d.id);

      if (existing) {
        existing.marker.setIcon(icon);
        const p = existing.marker.getPopup();
        if (p) p.setContent(popup);
        else existing.marker.bindPopup(popup);

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
      } else {
        const marker = L.marker([target.lat, target.lng], { icon }).addTo(map);
        marker.bindPopup(popup);
        markersRef.current.set(d.id, {
          marker,
          anim: target,
          from: target,
          to: target,
          start: performance.now(),
        });
      }
    }

    for (const [id, st] of markersRef.current) {
      if (!seen.has(id)) {
        st.marker.remove();
        markersRef.current.delete(id);
      }
    }

    // Frame the buses once on first data; afterwards leave the user's zoom/pan alone.
    if (!hasFitRef.current && markersRef.current.size > 0) {
      fitToMarkers();
      hasFitRef.current = true;
    }
  }, [driverLocations]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '600px' }}>
      <div ref={mapRef} style={{ width: '100%', height: '100%', minHeight: '600px' }} />
      <button
        type="button"
        onClick={fitToMarkers}
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          zIndex: 1000,
          background: 'white',
          border: '1px solid #D1D5DB',
          borderRadius: 8,
          padding: '6px 12px',
          fontSize: 13,
          fontWeight: 600,
          color: '#374151',
          boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
          cursor: 'pointer',
        }}
      >
        Recenter
      </button>
    </div>
  );
};

export default LiveTrackingMap;
