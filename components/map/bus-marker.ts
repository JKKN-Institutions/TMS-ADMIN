/**
 * The bus marker, one drawing for every tracking map.
 *
 *   live     green, pulsing halo, a small LIVE tag, and an arrow for the heading
 *   delayed  amber with a "!" — the position is minutes old
 *   off      grey — only a last known place
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

const BUS_GLYPH =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<rect x="4" y="3" width="16" height="14" rx="2.5"/><path d="M4 11h16"/><path d="M8 17v3M16 17v3"/><circle cx="8" cy="14" r="0.6" fill="#fff"/><circle cx="16" cy="14" r="0.6" fill="#fff"/></svg>';

const H = 30;

function widthOf(label: string | null | undefined): number {
  if (!label) return H;
  return 34 + Math.min(label.length, 4) * 8;
}

/** Everything the drawing depends on — markers are only redrawn when this changes. */
export function busMarkerSignature(o: BusMarkerOptions): string {
  const heading = o.liveness === 'live' && o.heading != null && !Number.isNaN(o.heading) ? Math.round(o.heading / 5) * 5 : '';
  return `${o.label ?? ''}|${o.liveness}|${heading}|${o.selected ? 1 : 0}`;
}

export function busMarkerIcon(o: BusMarkerOptions): L.DivIcon {
  const color = BUS_COLORS[o.liveness];
  const w = widthOf(o.label);
  const live = o.liveness === 'live';
  const showHeading = live && o.heading != null && !Number.isNaN(o.heading);

  const arrow = showHeading
    ? `<div style="position:absolute;left:50%;top:50%;width:0;height:0;transform:rotate(${o.heading}deg);">
         <div style="position:absolute;left:-6px;top:-${H / 2 + 11}px;width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:9px solid ${color};filter:drop-shadow(0 0 1px #fff);"></div>
       </div>`
    : '';
  const tag = live
    ? `<span style="position:absolute;right:-8px;top:-9px;background:#15803d;color:#fff;font:700 8px/1 Arial,sans-serif;letter-spacing:.5px;padding:2px 4px;border-radius:6px;border:1.5px solid #fff;">LIVE</span>`
    : o.liveness === 'delayed'
      ? `<span style="position:absolute;right:-6px;top:-8px;background:#b45309;color:#fff;font:700 10px/1 Arial,sans-serif;width:15px;height:15px;border-radius:50%;border:1.5px solid #fff;display:flex;align-items:center;justify-content:center;">!</span>`
      : '';
  const label = o.label
    ? `<span style="color:#fff;font:700 13px/1 Arial,Helvetica,sans-serif;padding-right:2px;">${escapeHtml(String(o.label).slice(0, 4))}</span>`
    : '';

  const html = `
    <div class="tms-bus${live ? ' tms-bus-live' : ''}${o.selected ? ' tms-bus-selected' : ''}" style="position:relative;width:${w}px;height:${H}px;--tms-bus:${color};">
      ${arrow}
      <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:4px;background:${color};border:2.5px solid #fff;border-radius:${H / 2}px;box-shadow:0 2px 6px rgba(0,0,0,.35);${o.liveness === 'off' ? 'opacity:.9;' : ''}">
        ${BUS_GLYPH}${label}
      </div>
      ${tag}
    </div>`;

  return L.divIcon({
    className: 'tms-bus-icon',
    html,
    iconSize: [w, H],
    iconAnchor: [w / 2, H / 2],
    popupAnchor: [0, -H / 2 - 6],
    tooltipAnchor: [0, -H / 2 - 4],
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
