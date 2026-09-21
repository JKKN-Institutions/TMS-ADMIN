export interface LatLng { lat: number; lng: number }

/** Great-circle distance in metres (haversine). */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** "Was the inspector at the bus?" — recorded as evidence, never enforced. */
export function locationEvidence(inspector: LatLng | null, bus: LatLng | null) {
  if (!inspector) return { location_status: 'unavailable' as const, bus_distance_m: null };
  if (!bus) return { location_status: 'bus_no_gps' as const, bus_distance_m: null };
  return { location_status: 'ok' as const, bus_distance_m: Math.round(distanceMeters(inspector, bus)) };
}
