'use client';

import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { ConsolidationSuggestion } from '@/lib/route-optimization/types';

export type StopPoints = Record<string, { lat: number; lng: number; name: string | null }>;

// One colour per under-used route, so each route's moves read as a group.
const PALETTE = ['#16a34a', '#2563eb', '#d97706', '#9333ea', '#dc2626', '#0891b2', '#db2777', '#65a30d'];

/**
 * Suggested consolidations on a map: a line from each passenger's current stop
 * to the stop they would board instead, coloured by the route being emptied.
 * Only stops with coordinates can be drawn — "Find stop locations" fills them in.
 * Standard OSM street tiles, same as the live tracking map.
 */
export default function ConsolidationMap({
  suggestions,
  stopPoints,
}: {
  suggestions: ConsolidationSuggestion[];
  stopPoints: StopPoints;
}) {
  const el = useRef<HTMLDivElement>(null);

  const moves = useMemo(() => {
    const out: { from: [number, number]; to: [number, number]; color: string; label: string }[] = [];
    suggestions.forEach((sug, i) => {
      const color = PALETTE[i % PALETTE.length];
      // Several passengers usually share a stop pair — draw each pair once.
      const seen = new Set<string>();
      for (const r of sug.relocations) {
        if (!r.feasible || !r.fromStopId || !r.toStopId) continue;
        const key = `${r.fromStopId}>${r.toStopId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const a = stopPoints[r.fromStopId];
        const b = stopPoints[r.toStopId];
        if (!a || !b) continue;
        out.push({
          from: [a.lat, a.lng],
          to: [b.lat, b.lng],
          color,
          label: `Route ${sug.routeNumber ?? '—'} → ${r.targetRouteNumber ?? '—'}: ${a.name ?? 'stop'} → ${b.name ?? 'stop'}`,
        });
      }
    });
    return out;
  }, [suggestions, stopPoints]);

  useEffect(() => {
    if (!el.current || moves.length === 0) return;
    const map = L.map(el.current, { scrollWheelZoom: false });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    const bounds = L.latLngBounds([]);
    for (const m of moves) {
      L.polyline([m.from, m.to], { color: m.color, weight: 3, opacity: 0.8, dashArray: '6 4' }).bindTooltip(m.label).addTo(map);
      L.circleMarker(m.from, { radius: 5, color: m.color, fillColor: '#fff', fillOpacity: 1, weight: 2 }).bindTooltip(`From: ${m.label}`).addTo(map);
      L.circleMarker(m.to, { radius: 6, color: m.color, fillColor: m.color, fillOpacity: 1, weight: 2 }).bindTooltip(`To: ${m.label}`).addTo(map);
      bounds.extend(m.from).extend(m.to);
    }
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 });
    return () => {
      map.remove();
    };
  }, [moves]);

  if (moves.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
        No suggested move can be drawn yet — the stops involved have no map location. Use <strong>Find stop locations</strong> above.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div ref={el} className="h-80 w-full overflow-hidden rounded-xl border border-gray-200" />
      <p className="text-xs text-gray-500">
        Hollow dot = where the passenger boards now · solid dot = the stop on the other route · one colour per route being emptied.
      </p>
    </div>
  );
}
