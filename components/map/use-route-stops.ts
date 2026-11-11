'use client';

import { useMemo } from 'react';
import {
  stopProgress,
  summariseProgress,
  type ProgressSummary,
  type StopPin,
  type TripDirection,
} from '@/lib/stops/progress';
import { toMapStops, type MapStop } from '@/lib/stops/map-stops';

const NONE: MapStop[] = [];

/**
 * A route's confirmed stops + the bus's position → the pins a map draws and one
 * plain-English line ("Next stop: …").
 *
 * Every dependency is a PRIMITIVE. The pages that call this poll, so the `stops`
 * array has a fresh identity every few seconds; keying on it would rebuild the pins
 * (and close any open popup) on each poll even though nothing moved.
 */
export function useRouteStops(
  stops: ReadonlyArray<StopPin> | null | undefined,
  direction: TripDirection | null | undefined,
  lat: number | null | undefined,
  lng: number | null | undefined,
): { mapStops: MapStop[]; summary: ProgressSummary | null } {
  const stopsKey = (stops ?? []).map((s) => `${s.id}:${s.order}:${s.lat}:${s.lng}:${s.time}:${s.eveningTime}:${s.name}`).join('|');
  const dir = direction ?? null;
  const busLat = lat ?? null;
  const busLng = lng ?? null;

  return useMemo(() => {
    const list = stops ?? [];
    if (list.length === 0) return { mapStops: NONE, summary: null };
    const bus = busLat != null && busLng != null ? { lat: busLat, lng: busLng } : null;
    const progress = stopProgress(list, bus, dir);
    return { mapStops: toMapStops(list, progress), summary: summariseProgress(list, progress, dir) };
    // `stops` is represented by stopsKey (see above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopsKey, dir, busLat, busLng]);
}
