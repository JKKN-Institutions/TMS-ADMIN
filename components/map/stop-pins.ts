/**
 * Leaflet drawing for stop pins — one renderer shared by the learner / boarding /
 * driver map, the admin Track All map and the stop-location editor, so a stop looks
 * the same wherever it appears.
 *
 * Client-only (imports leaflet): only ever import this from a component that is
 * itself loaded with next/dynamic { ssr: false }. Pages take the Leaflet-free types
 * and helpers from lib/stops/map-stops instead.
 */
import L from 'leaflet';
import type { StopPinState } from '@/lib/stops/progress';
import { STOP_COLORS, type MapStop } from '@/lib/stops/map-stops';

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
/** Stop names are free text from the DB and Leaflet renders popup/tooltip HTML raw. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => HTML_ESCAPES[c]);
}

/**
 * A numbered teardrop pin whose TIP sits on the coordinate (the anchor is the bottom
 * centre, not the middle) — so the pin points at the stop instead of covering it.
 */
export function stopPinIcon(
  order: number | string,
  color: string,
  opts: { large?: boolean; faded?: boolean } = {},
): L.DivIcon {
  const w = opts.large ? 34 : 26;
  const h = opts.large ? 44 : 34;
  const label = String(order);
  const fontSize = label.length > 2 ? 9 : label.length > 1 ? 11 : 13;
  return L.divIcon({
    className: 'stop-pin',
    html: `<div style="width:${w}px;height:${h}px;opacity:${opts.faded ? 0.7 : 1};filter:drop-shadow(0 2px 2px rgba(0,0,0,.35));">
      <svg width="${w}" height="${h}" viewBox="0 0 28 36" style="display:block;overflow:visible;">
        <path d="M14 1C6.82 1 1 6.82 1 14c0 9.2 13 21 13 21s13-11.8 13-21C27 6.82 21.18 1 14 1z" fill="${color}" stroke="#fff" stroke-width="2"/>
        <text x="14" y="${14 + fontSize * 0.36}" text-anchor="middle" font-size="${fontSize}" font-weight="700" font-family="Arial,Helvetica,sans-serif" fill="#fff">${escapeHtml(label)}</text>
      </svg>
    </div>`,
    iconSize: [w, h],
    iconAnchor: [w / 2, h],
    popupAnchor: [0, -h + 6],
    tooltipAnchor: [0, -h + 4],
  });
}

const STATE_NOTE: Record<StopPinState, string | null> = {
  next: 'Next stop',
  passed: 'Bus has passed',
  upcoming: null,
  plain: null,
};

function popupHtml(stop: MapStop, total: number): string {
  const note = stop.state ? STATE_NOTE[stop.state] : null;
  return `<div style="font-family:system-ui,-apple-system,sans-serif;min-width:150px;">
    <div style="font-weight:600;font-size:14px;color:#111827;">${escapeHtml(stop.name)}</div>
    <div style="font-size:12px;color:#6b7280;margin-top:2px;">Stop ${stop.order}${total > 1 ? ` of ${total}` : ''}</div>
    ${stop.timeLabel ? `<div style="font-size:12px;color:#374151;margin-top:4px;">${escapeHtml(stop.timeLabel)}</div>` : ''}
    ${note ? `<div style="font-size:12px;font-weight:600;color:${stop.state === 'next' ? STOP_COLORS.next : '#6b7280'};margin-top:4px;">${note}</div>` : ''}
  </div>`;
}

/**
 * (Re)draw a route's stop pins into `group`: a faint dashed line joining the stops in
 * route order, then one numbered pin each. The next stop is larger, darker and
 * carries its name; passed stops fade to grey.
 *
 * `routeStopCount` is the number of stops on the whole route, for "Stop 5 of 23" —
 * it can exceed stops.length while some stops are still unplaced.
 */
export function drawStopPins(group: L.LayerGroup, stops: ReadonlyArray<MapStop>, routeStopCount?: number): void {
  group.clearLayers();
  if (stops.length === 0) return;
  const ordered = [...stops].sort((a, b) => a.order - b.order);
  const total = routeStopCount ?? ordered.length;

  if (ordered.length > 1) {
    L.polyline(
      ordered.map((s) => [s.lat, s.lng] as [number, number]),
      { color: STOP_COLORS.upcoming, weight: 2, opacity: 0.45, dashArray: '4 7', interactive: false },
    ).addTo(group);
  }

  for (const s of ordered) {
    const state = s.state ?? 'plain';
    const marker = L.marker([s.lat, s.lng], {
      icon: stopPinIcon(s.order, s.mine ? STOP_COLORS.mine : STOP_COLORS[state], {
        large: state === 'next' || !!s.mine,
        faded: state === 'passed' && !s.mine,
      }),
      // Passed pins sink, the next stop rises; the bus marker (offset 1000) stays on top of all.
      zIndexOffset: s.mine ? 350 : state === 'next' ? 300 : state === 'passed' ? -200 : 0,
      keyboard: false,
    });
    marker.bindPopup(popupHtml(s, total));
    marker.bindTooltip(s.mine ? `Your stop · ${escapeHtml(s.name)}` : escapeHtml(s.name), {
      permanent: state === 'next' || !!s.mine,
      direction: 'top',
    });
    marker.addTo(group);
  }
}

/** Bounds covering the given stops, or null when there are none. */
export function stopBounds(stops: ReadonlyArray<MapStop>): L.LatLngBounds | null {
  if (stops.length === 0) return null;
  return L.latLngBounds(stops.map((s) => [s.lat, s.lng] as [number, number]));
}
