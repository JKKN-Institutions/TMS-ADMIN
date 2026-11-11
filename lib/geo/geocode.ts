/**
 * Provider-agnostic geocoder for stop names → lat/long.
 *
 * Default provider is OpenStreetMap Nominatim (free; 1 request/second; requires a
 * descriptive User-Agent). Set GEOCODE_PROVIDER=google + GEOCODE_API_KEY to use
 * Google instead. GEOCODE_REGION (default "Tamil Nadu, India") is appended to each
 * query to disambiguate local stop names. Callers must throttle (≈1s) for Nominatim.
 */

export interface GeocodeResult {
  lat: number;
  long: number;
}

const PROVIDER = process.env.GEOCODE_PROVIDER || 'nominatim';
const REGION = process.env.GEOCODE_REGION ?? 'Tamil Nadu, India';
const GOOGLE_KEY = process.env.GEOCODE_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';
/** Recommended minimum gap between requests for the active provider (ms). */
export const GEOCODE_MIN_INTERVAL_MS = PROVIDER === 'google' ? 100 : 1100;

function withRegion(name: string): string {
  return REGION ? `${name}, ${REGION}` : name;
}

async function geocodeNominatim(query: string): Promise<GeocodeResult | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'JKKN-TMS/1.0 (transport route optimization)', 'Accept-Language': 'en' },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as Array<{ lat: string; lon: string }>;
  if (!Array.isArray(json) || json.length === 0) return null;
  const lat = Number(json[0].lat);
  const long = Number(json[0].lon);
  return Number.isFinite(lat) && Number.isFinite(long) ? { lat, long } : null;
}

async function geocodeGoogle(query: string): Promise<GeocodeResult | null> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${GOOGLE_KEY}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = (await res.json()) as { results?: Array<{ geometry?: { location?: { lat: number; lng: number } } }> };
  const loc = json.results?.[0]?.geometry?.location;
  if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) return null;
  return { lat: loc.lat, long: loc.lng };
}

/** Geocode one place name to coordinates, or null if not found. */
export async function geocodeAddress(name: string): Promise<GeocodeResult | null> {
  const q = withRegion(name.trim());
  if (!q) return null;
  try {
    if (PROVIDER === 'google' && GOOGLE_KEY) return await geocodeGoogle(q);
    return await geocodeNominatim(q);
  } catch {
    return null;
  }
}

type FetchLike = typeof fetch;

export interface PlaceMatch {
  lat: number;
  lng: number;
  label: string;
}

/**
 * Find places by name inside the area the fleet serves, to MOVE THE MAP there while
 * an admin places a stop by hand (Routes -> Stop locations).
 *
 * This only ever suggests where to look — it must not be used to position a stop
 * automatically. Name lookups are wrong far more often than right for these stops
 * (2 of 22 on route 31), which is why stop locations need a person to confirm them.
 * `viewbox` is left,top,right,bottom around campus; bounded=1 keeps results inside it.
 */
export async function searchPlaces(query: string, fetchImpl: FetchLike = fetch): Promise<PlaceMatch[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  try {
    const url =
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}` +
      '&format=json&limit=5&countrycodes=in&viewbox=76.9,12.3,78.7,10.7&bounded=1';
    const res = await fetchImpl(url, {
      headers: { 'User-Agent': 'JKKN-TMS/1.0 (transport route optimization)', 'Accept-Language': 'en' },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as Array<{ lat: string; lon: string; display_name?: string }>;
    if (!Array.isArray(json)) return [];
    return json
      .map((r) => ({ lat: Number(r.lat), lng: Number(r.lon), label: r.display_name ?? q }))
      .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
  } catch {
    return [];
  }
}

/** Build a short human label from Nominatim's structured address, else display_name. */
function summariseAddress(json: { display_name?: string; address?: Record<string, string> }): string | null {
  const a = json.address ?? {};
  const parts = [
    a.road || a.neighbourhood || a.suburb || a.hamlet,
    a.village || a.town || a.city || a.county,
    a.state_district || a.state,
  ].filter((p): p is string => !!p);
  const label = parts.join(', ');
  return label || json.display_name || null;
}

async function reverseNominatim(lat: number, lng: number, fetchImpl: FetchLike): Promise<string | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=jsonv2&zoom=16&addressdetails=1`;
  const res = await fetchImpl(url, {
    headers: { 'User-Agent': 'JKKN-TMS/1.0 (transport route optimization)', 'Accept-Language': 'en' },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { display_name?: string; address?: Record<string, string> };
  return summariseAddress(json);
}

async function reverseGoogle(lat: number, lng: number, fetchImpl: FetchLike): Promise<string | null> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_KEY}`;
  const res = await fetchImpl(url);
  if (!res.ok) return null;
  const json = (await res.json()) as { results?: Array<{ formatted_address?: string }> };
  return json.results?.[0]?.formatted_address ?? null;
}

/** Reverse-geocode a coordinate to a short address label, or null on failure. */
export async function reverseGeocode(
  lat: number,
  lng: number,
  fetchImpl: FetchLike = fetch,
): Promise<string | null> {
  try {
    if (PROVIDER === 'google' && GOOGLE_KEY) return await reverseGoogle(lat, lng, fetchImpl);
    return await reverseNominatim(lat, lng, fetchImpl);
  } catch {
    return null;
  }
}
