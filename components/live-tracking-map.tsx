'use client';

import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { interpolateLatLng, shouldSnap, type LatLng } from '@/lib/gps/interpolate';
import { CAMPUS } from '@/lib/gps/campus';
import { haversineKm } from '@/lib/gps/distance';

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
  heading?: number | null;
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
  circle: L.Circle | null;
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

function createCustomIcon(
  status: string, isActive: boolean, routeNumber: string | null, heading: number | null | undefined,
): L.DivIcon {
  const color = isActive ? STATUS_COLORS[status] || STATUS_COLORS.inactive : STATUS_COLORS.inactive;
  const displayText = routeNumber || '?';
  const pointer = heading == null || Number.isNaN(heading)
    ? ''
    : `<div style="position:absolute;inset:0;transform:rotate(${heading}deg);">
         <div style="position:absolute;top:-6px;left:50%;margin-left:-4px;width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-bottom:7px solid ${color};"></div>
       </div>`;
  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="position:relative;width:30px;height:30px;">
        ${pointer}
        <div style="
          position:absolute;top:3px;left:3px;background:${color};width:24px;height:24px;border-radius:50%;
          border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);
          display:flex;align-items:center;justify-content:center;
          color:white;font-weight:bold;font-size:11px;font-family:Arial,sans-serif;
        ">${displayText}</div>
      </div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
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
        <div style="margin-bottom: 6px;"><strong>To campus:</strong> ${
          driver.current_latitude != null && driver.current_longitude != null
            ? `${haversineKm({ lat: driver.current_latitude, lng: driver.current_longitude }, CAMPUS).toFixed(1)} km`
            : '—'
        }</div>
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
      const icon = createCustomIcon(d.gps_status || 'offline', d.location_sharing_enabled, d.route_number, d.heading);
      const popup = buildPopup(d);
      const existing = markersRef.current.get(d.id);

      if (existing) {
        existing.marker.setIcon(icon);
        const p = existing.marker.getPopup();
        if (p) p.setContent(popup);
        else existing.marker.bindPopup(popup);

        if (d.location_accuracy != null && d.location_accuracy > 0) {
          if (!existing.circle) {
            existing.circle = L.circle(target, { radius: d.location_accuracy, color: '#3B82F6', weight: 1, fillColor: '#3B82F6', fillOpacity: 0.1 }).addTo(map);
          } else {
            existing.circle.setLatLng(target);
            existing.circle.setRadius(d.location_accuracy);
          }
        } else if (existing.circle) {
          existing.circle.remove();
          existing.circle = null;
        }

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
        const circle = d.location_accuracy != null && d.location_accuracy > 0
          ? L.circle([target.lat, target.lng], { radius: d.location_accuracy, color: '#3B82F6', weight: 1, fillColor: '#3B82F6', fillOpacity: 0.1 }).addTo(map)
          : null;
        markersRef.current.set(d.id, {
          marker, circle, anim: target, from: target, to: target, start: performance.now(),
        });
      }
    }

    for (const [id, st] of markersRef.current) {
      if (!seen.has(id)) {
        st.marker.remove();
        st.circle?.remove();
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
