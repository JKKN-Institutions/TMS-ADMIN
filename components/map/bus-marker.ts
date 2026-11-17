/**
 * The bus marker, one drawing for every tracking map.
 *
 * A round white badge holding the college bus photo. The ring and the route
 * number under it carry the state:
 *
 *   live     green, pulsing halo, a small LIVE tag, and an arrow for the heading
 *   delayed  amber with a "!" — the position is minutes old
 *   off      grey, photo greyed out — only a last known place
 *   selected a ring that breathes around whichever of the above it is
 *
 * The animations are CSS (app/globals.css, the .tms-bus-* rules) and are switched off
 * for people who ask for reduced motion.
 *
 * Client-only (imports leaflet): load only from components that are themselves loaded
 * with next/dynamic { ssr: false }.
 */
import L from 'leaflet';
import type { Liveness } from '@/lib/gps/liveness';
import { escapeHtml } from './stop-pins';

export interface BusMarkerOptions {
  /** Route number shown beside the bus glyph. Omit on a single-bus map. */
  label?: string | null;
  liveness: Liveness;
  /** Degrees clockwise from north. Only drawn while live. */
  heading?: number | null;
  selected?: boolean;
}

export const BUS_COLORS: Record<Liveness, string> = {
  live: '#16a34a',
  delayed: '#d97706',
  off: '#6b7280',
};

/**
 * The college bus photo, cut from public/icons/transport.ico to a 96px PNG (drawn
 * at 50px, so it stays sharp on high-density phone screens). The .ico itself is
 * 430 KB and holds nine sizes, which is the wrong thing to load once per marker.
 */
const BUS_IMAGE = '/icons/bus-marker.png';

/** Diameter of the round badge. It is a circle so the halo and the ring fit it. */
const D = 60;

/** Everything the drawing depends on — markers are only redrawn when this changes. */
export function busMarkerSignature(o: BusMarkerOptions): string {
  const heading = o.liveness === 'live' && o.heading != null && !Number.isNaN(o.heading) ? Math.round(o.heading / 5) * 5 : '';
  return `${o.label ?? ''}|${o.liveness}|${heading}|${o.selected ? 1 : 0}`;
}

export function busMarkerIcon(o: BusMarkerOptions): L.DivIcon {
  const color = BUS_COLORS[o.liveness];
  const live = o.liveness === 'live';
  const showHeading = live && o.heading != null && !Number.isNaN(o.heading);

  const arrow = showHeading
    ? `<div style="position:absolute;left:50%;top:50%;width:0;height:0;transform:rotate(${o.heading}deg);">
         <div style="position:absolute;left:-6px;top:-${D / 2 + 11}px;width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:9px solid ${color};filter:drop-shadow(0 0 1px #fff);"></div>
       </div>`
    : '';
  const tag = live
    ? `<span style="position:absolute;z-index:2;right:-8px;top:-9px;background:#15803d;color:#fff;font:700 8px/1 Arial,sans-serif;letter-spacing:.5px;padding:2px 4px;border-radius:6px;border:1.5px solid #fff;">LIVE</span>`
    : o.liveness === 'delayed'
      ? `<span style="position:absolute;z-index:2;right:-6px;top:-8px;background:#b45309;color:#fff;font:700 10px/1 Arial,sans-serif;width:15px;height:15px;border-radius:50%;border:1.5px solid #fff;display:flex;align-items:center;justify-content:center;">!</span>`
      : '';
  // The route number hangs under the badge, in the status colour, so the photo
  // stays uncovered and the place-name tooltip above it is not disturbed.
  const label = o.label
    ? `<span style="position:absolute;z-index:2;left:50%;bottom:-9px;transform:translateX(-50%);background:${color};color:#fff;font:700 13px/1 Arial,Helvetica,sans-serif;padding:2px 7px;border-radius:8px;border:1.5px solid #fff;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.3);">${escapeHtml(String(o.label).slice(0, 4))}</span>`
    : '';
  // A bus that is not reporting loses its colour, so "off" reads at a glance
  // even though the photo itself is always yellow.
  const dim = o.liveness === 'off' ? 'filter:grayscale(1);opacity:.75;' : '';

  const html = `
    <div class="tms-bus${live ? ' tms-bus-live' : ''}${o.selected ? ' tms-bus-selected' : ''}" style="position:relative;width:${D}px;height:${D}px;--tms-bus:${color};">
      ${arrow}
      <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#fff;border:3px solid ${color};border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,.35);">
        <img src="${BUS_IMAGE}" alt="" width="50" height="50" draggable="false" style="display:block;width:50px;height:50px;${dim}" />
      </div>
      ${label}
      ${tag}
    </div>`;

  return L.divIcon({
    className: 'tms-bus-icon',
    html,
    iconSize: [D, D],
    iconAnchor: [D / 2, D / 2],
    popupAnchor: [0, -D / 2 - 6],
    tooltipAnchor: [0, -D / 2 - 4],
  });
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
