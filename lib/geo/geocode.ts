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
