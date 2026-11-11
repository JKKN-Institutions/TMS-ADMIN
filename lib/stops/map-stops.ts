/**
 * The shape a map draws a stop from, and the helpers that build it.
 *
 * Deliberately free of Leaflet: the tracking PAGES import from here, and they are
 * server-rendered before hydration. Leaflet touches `window` the moment it is
 * imported, so anything a page imports must not pull it in. The Leaflet drawing code
 * lives in components/map/stop-pins.ts and is only ever loaded with ssr: false.
 */
import type { StopPin, StopPinState, StopProgress } from './progress';

export interface MapStop {
  id: string;
  name: string;
  /** Stop number on the route (sequence_order), printed inside the pin. */
  order: number;
  lat: number;
  lng: number;
  /** e.g. "Morning 07:20 · Evening 18:30" — shown in the popup. */
  timeLabel?: string | null;
  state?: StopPinState;
}

/**
 * Violet is the one hue no bus status uses: Track All colours buses green, amber,
 * yellow, red and grey, the campus is red and the road line blue. A stop must never
 * be mistaken for a bus in trouble.
 */
export const STOP_COLORS = {
  upcoming: '#7c3aed',
  next: '#5b21b6',
  passed: '#9ca3af',
  plain: '#7c3aed',
  /** Editor only: placed but not saved yet. */
  draft: '#ea580c',
} as const;

/** "Morning 07:20 · Evening 18:30" from raw HH:MM:SS stop times. */
export function stopTimeLabel(time: string | null | undefined, eveningTime: string | null | undefined): string | null {
  const parts: string[] = [];
  if (time) parts.push(`Morning ${time.slice(0, 5)}`);
  if (eveningTime) parts.push(`Evening ${eveningTime.slice(0, 5)}`);
  return parts.length ? parts.join(' · ') : null;
}

/** Confirmed stop pins + where the bus is among them → what the map draws. */
export function toMapStops(stops: ReadonlyArray<StopPin>, progress: StopProgress | null): MapStop[] {
  return stops.map((s, i) => ({
    id: s.id,
    name: s.name,
    order: s.order,
    lat: s.lat,
    lng: s.lng,
    timeLabel: stopTimeLabel(s.time, s.eveningTime),
    state: progress?.states[i] ?? 'plain',
  }));
}

/**
 * A primitive fingerprint of everything a pin is drawn from. The tracking pages poll,
 * so their stop arrays get a fresh identity every few seconds; effects and memos
 * depend on this string instead, and redraw (closing any open popup) only when a pin
 * really changed.
 */
export function stopsSignature(stops: ReadonlyArray<MapStop> | null | undefined): string {
  if (!stops || stops.length === 0) return '';
  return stops
    .map((s) => `${s.id}:${s.order}:${s.lat}:${s.lng}:${s.state ?? ''}:${s.timeLabel ?? ''}:${s.name}`)
    .join('|');
}
