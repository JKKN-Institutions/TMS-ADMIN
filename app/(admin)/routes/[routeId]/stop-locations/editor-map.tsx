'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { CAMPUS } from '@/lib/gps/campus';
import { STOP_COLORS } from '@/lib/stops/map-stops';
import { stopPinIcon, escapeHtml } from '@/components/map/stop-pins';

export interface EditorStop {
  id: string;
  name: string;
  order: number;
  lat: number | null;
  lng: number | null;
  /** Placed or moved in this session and not saved yet. */
  unsaved: boolean;
}

interface Props {
  stops: EditorStop[];
  /** The stop the next map click will place. */
  activeId: string | null;
  /** A recorded trip's path, drawn as a guide to place pins along. */
  trail: [number, number][];
  /** Move the map here (a search result). `nonce` re-triggers the same place. */
  focus: { lat: number; lng: number; nonce: number } | null;
  onPlace: (stopId: string, lat: number, lng: number) => void;
  onSelect: (stopId: string) => void;
}

/**
 * The map half of Routes -> Stop locations: click to drop the active stop's pin, drag
 * any pin to adjust it. Always loaded with next/dynamic { ssr: false }.
 */
export default function EditorMap({ stops, activeId, trail, focus, onPlace, onSelect }: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const pinsRef = useRef<L.LayerGroup | null>(null);
  const trailRef = useRef<L.Polyline | null>(null);
  const framedRef = useRef(false);
  const framedTrailRef = useRef('');

  // Leaflet handlers are bound once; they reach the latest props through refs so a
  // click never places a stop that was active several renders ago.
  const activeIdRef = useRef(activeId);
  const onPlaceRef = useRef(onPlace);
  const onSelectRef = useRef(onSelect);
  const stopsRef = useRef(stops);
  useEffect(() => {
    activeIdRef.current = activeId;
    onPlaceRef.current = onPlace;
    onSelectRef.current = onSelect;
    stopsRef.current = stops;
  });

  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const map = L.map(elRef.current).setView([CAMPUS.lat, CAMPUS.lng], 11);
    const street = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 20,
      maxNativeZoom: 19,
      attribution: '© OpenStreetMap contributors',
    });
    const satellite = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 20, attribution: 'Tiles © Esri' },
    );
    street.addTo(map);
    L.control.layers({ Street: street, Satellite: satellite }, {}, { position: 'topright' }).addTo(map);
    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);
    L.marker([CAMPUS.lat, CAMPUS.lng], {
      icon: L.divIcon({
        className: 'campus-marker',
        html: `<div style="width:26px;height:26px;border-radius:6px;background:#dc2626;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font-size:14px;">🎓</div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      }),
      interactive: false,
    }).addTo(map);
    pinsRef.current = L.layerGroup().addTo(map);
    map.on('click', (e: L.LeafletMouseEvent) => {
      const id = activeIdRef.current;
      if (id) onPlaceRef.current(id, e.latlng.lat, e.latlng.lng);
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      pinsRef.current = null;
      trailRef.current = null;
      framedRef.current = false;
    };
  }, []);

  // Pins. Rebuilt from a primitive signature: at most a few dozen markers, and a
  // rebuild can never interrupt a drag because a drag only reports when it ends.
  const signature = stops.map((s) => `${s.id}:${s.order}:${s.lat}:${s.lng}:${s.unsaved}:${s.name}`).join('|');
  useEffect(() => {
    const group = pinsRef.current;
    if (!group) return;
    group.clearLayers();
    for (const s of stopsRef.current) {
      if (s.lat == null || s.lng == null) continue;
      const active = s.id === activeId;
      const marker = L.marker([s.lat, s.lng], {
        icon: stopPinIcon(s.order, s.unsaved ? STOP_COLORS.draft : STOP_COLORS.upcoming, { large: active }),
        draggable: true,
        zIndexOffset: active ? 500 : 0,
        keyboard: false,
      });
      marker.bindTooltip(`${s.order}. ${escapeHtml(s.name)}`, { direction: 'top' });
      marker.on('click', () => onSelectRef.current(s.id));
      marker.on('dragend', () => {
        const p = marker.getLatLng();
        onPlaceRef.current(s.id, p.lat, p.lng);
      });
      marker.addTo(group);
    }
  }, [signature, activeId]);

  // Guide line.
  const trailKey = trail.length ? `${trail.length}:${trail[0][0]}:${trail[0][1]}` : '';
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    trailRef.current?.remove();
    trailRef.current = null;
    if (trail.length > 1) {
      trailRef.current = L.polyline(trail, {
        color: '#2563eb', weight: 4, opacity: 0.55, interactive: false,
      }).addTo(map);
      trailRef.current.bringToBack();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trailKey]);

  // Frame what there is to look at — once when pins first exist, and again when a
  // guide line arrives. After that the admin's own pan/zoom is left alone.
  const hasPins = stops.some((s) => s.lat != null && s.lng != null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const pts: [number, number][] = [];
    for (const s of stopsRef.current) if (s.lat != null && s.lng != null) pts.push([s.lat, s.lng]);
    for (const p of trail) pts.push(p);
    if (pts.length === 0) return;
    if (framedRef.current && framedTrailRef.current === trailKey) return;
    pts.push([CAMPUS.lat, CAMPUS.lng]);
    map.fitBounds(L.latLngBounds(pts).pad(0.1));
    framedRef.current = true;
    framedTrailRef.current = trailKey;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPins, trailKey]);

  // Bring the active stop into view when it already has a pin.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !activeId) return;
    const s = stopsRef.current.find((x) => x.id === activeId);
    if (s && s.lat != null && s.lng != null && !map.getBounds().contains([s.lat, s.lng])) {
      map.panTo([s.lat, s.lng]);
    }
  }, [activeId]);

  // Search result → move the map there.
  const focusKey = focus ? `${focus.lat}:${focus.lng}:${focus.nonce}` : '';
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    map.setView([focus.lat, focus.lng], Math.max(map.getZoom(), 15));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);

  return (
    <div
      ref={elRef}
      className="h-full min-h-[360px] w-full"
      // A crosshair says "your next click places a pin".
      style={{ cursor: activeId ? 'crosshair' : undefined }}
    />
  );
}
