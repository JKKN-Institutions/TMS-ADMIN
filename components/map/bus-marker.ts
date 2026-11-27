/**
 * The bus marker, one drawing for every tracking map.
 *
 * A small yellow bus seen from above, which turns to face the way it is travelling
 * — the bus itself shows the direction, so there is no separate arrow.
 *
 *   live     yellow bus on a pulsing green halo
 *   delayed  yellow bus with an amber "!" — the position is minutes old
 *   off      grey, faded bus — only a last known place
 *   selected a little larger, with a blue ring that breathes around it
 *
 * The halo, the ring and the turn are CSS (app/globals.css, the .tms-bus-* rules)
 * and are switched off for people who ask for reduced motion.
 *
 * Client-only (imports leaflet): load only from components that are themselves loaded
 * with next/dynamic { ssr: false }.
 */
import L from 'leaflet';
import type { Liveness } from '@/lib/gps/liveness';
import { shortestTurn } from '@/lib/gps/interpolate';
import { escapeHtml } from './stop-pins';

export interface BusMarkerOptions {
  /** Route number shown under the bus. Omit on a single-bus map. */
  label?: string | null;
  liveness: Liveness;
  /** Degrees clockwise from north: the way the bus faces. Unknown = facing north. */
  heading?: number | null;
  selected?: boolean;
}

export const BUS_COLORS: Record<Liveness, string> = {
  live: '#16a34a',
  delayed: '#d97706',
  off: '#6b7280',
};

/** Side of the square the marker sits in. The bus position is its centre. */
const D = 40;
/** The drawn bus, in px. It is drawn facing north and turned by CSS. */
const BUS_W = 20;
const BUS_H = 36;

/** The bus from above, nose up. `body` and `roof` are the two paint colours. */
function busSvg(body: string, roof: string): string {
  return (
    `<svg width="${BUS_W}" height="${BUS_H}" viewBox="0 0 22 40" aria-hidden="true" style="display:block;">` +
    // wing mirrors
    '<rect x="0.4" y="7" width="3.2" height="3.6" rx="1" fill="#1f2937"/><rect x="18.4" y="7" width="3.2" height="3.6" rx="1" fill="#1f2937"/>' +
    // body
    `<rect x="3" y="1" width="16" height="38" rx="4.5" fill="${body}" stroke="#1f2937" stroke-width="1.2"/>` +
    // windscreen (front) and rear window
    '<rect x="5" y="4" width="12" height="6.5" rx="2" fill="#1f2937"/><rect x="6" y="34.2" width="10" height="2.4" rx="1" fill="#1f2937"/>' +
    // roof panel with two hatches
    `<rect x="6" y="14" width="10" height="16.5" rx="2" fill="${roof}"/>` +
    `<path d="M6 19.5h10M6 25h10" stroke="${body}" stroke-width="1"/>` +
    // headlights
    '<circle cx="6.2" cy="2.7" r="1" fill="#fff"/><circle cx="15.8" cy="2.7" r="1" fill="#fff"/>' +
    '</svg>'
  );
}

function degOf(heading: number | null | undefined): number {
  return heading != null && !Number.isNaN(heading) ? heading : 0;
}

/**
 * Everything the drawing depends on — markers are only redrawn when this changes.
 * The heading is deliberately not part of it: a turn is applied to the marker that
 * is already on the map (turnBusMarker), so the bus swings round instead of being
 * swapped for a new drawing.
 */
export function busMarkerSignature(o: BusMarkerOptions): string {
  return `${o.label ?? ''}|${o.liveness}|${o.selected ? 1 : 0}`;
}

export function busMarkerIcon(o: BusMarkerOptions): L.DivIcon {
  const color = BUS_COLORS[o.liveness];
  const live = o.liveness === 'live';
  const off = o.liveness === 'off';
  const deg = degOf(o.heading);

  const tag = o.liveness === 'delayed'
    ? `<span style="position:absolute;z-index:2;right:-3px;top:-3px;background:#b45309;color:#fff;font:700 10px/1 Arial,sans-serif;width:15px;height:15px;border-radius:50%;border:1.5px solid #fff;display:flex;align-items:center;justify-content:center;">!</span>`
    : '';
  // The route number hangs under the marker and never turns with the bus.
  const label = o.label
    ? `<span style="position:absolute;z-index:2;left:50%;bottom:-13px;transform:translateX(-50%);background:${color};color:#fff;font:700 12px/1 Arial,Helvetica,sans-serif;padding:2px 6px;border-radius:8px;border:1.5px solid #fff;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.3);">${escapeHtml(String(o.label).slice(0, 4))}</span>`
    : '';
  const bus = off ? busSvg('#d1d5db', '#9ca3af') : busSvg('#facc15', '#eab308');

  const html = `
    <div class="tms-bus${live ? ' tms-bus-live' : ''}${o.selected ? ' tms-bus-selected' : ''}" style="position:relative;width:${D}px;height:${D}px;--tms-bus:${color};">
      <div class="tms-bus-body" data-deg="${deg}" style="position:absolute;left:${(D - BUS_W) / 2}px;top:${(D - BUS_H) / 2}px;width:${BUS_W}px;height:${BUS_H}px;transform:rotate(${deg}deg);filter:drop-shadow(0 0 1px #fff) drop-shadow(0 1px 2px rgba(0,0,0,.45));${off ? 'opacity:.7;' : ''}">
        ${bus}
      </div>
      ${label}
      ${tag}
    </div>`;

  return L.divIcon({
    className: 'tms-bus-icon',
    html,
    iconSize: [D, D],
    iconAnchor: [D / 2, D / 2],
    popupAnchor: [0, -D / 2 - 4],
    tooltipAnchor: [0, -D / 2 - 2],
  });
}

/**
 * Turn a bus that is already on the map to face `heading`. The turn takes the short
 * way round and is eased by CSS. Does nothing when the heading is unknown (the bus
 * keeps facing the way it was) or while the marker is off the map.
 */
export function turnBusMarker(marker: L.Marker, heading: number | null | undefined): void {
  if (heading == null || Number.isNaN(heading)) return;
  const body = marker.getElement()?.querySelector<HTMLElement>('.tms-bus-body');
  if (!body) return;
  const current = Number(body.dataset.deg ?? 0);
  const next = shortestTurn(Number.isNaN(current) ? 0 : current, heading);
  if (next === current) return;
  body.dataset.deg = String(next);
  body.style.transform = `rotate(${next}deg)`;
}

/** A count badge standing in for several buses that overlap on screen. */
export function clusterMarkerIcon(count: number, anyLive: boolean): L.DivIcon {
  const color = anyLive ? BUS_COLORS.live : BUS_COLORS.off;
  const size = 38;
  return L.divIcon({
    className: 'tms-bus-icon',
    html: `<div class="${anyLive ? 'tms-bus-live' : ''}" style="position:relative;width:${size}px;height:${size}px;--tms-bus:${color};">
      <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#fff;border:3px solid ${color};border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,.35);color:#111827;font:700 15px/1 Arial,Helvetica,sans-serif;">${count}</div>
    </div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}
