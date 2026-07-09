import type { LatLng } from './interpolate';

/** The one coordinate we trust: JKKN campus, the shared destination for every route.
 *  Single source of truth (replaces the hardcoded DEFAULT_CENTER in the admin map). */
export const CAMPUS: LatLng & { label: string } = {
  lat: 11.4444567,
  lng: 77.730258,
  label: 'JKKN Campus',
};
