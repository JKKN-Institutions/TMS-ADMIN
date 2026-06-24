export type GpsStatus = 'online' | 'recent' | 'offline';

export interface GpsFreshness {
  status: GpsStatus;
  /** Whole minutes since the fix, or null when there is no usable timestamp. */
  minutes: number | null;
}

/**
 * Shared online/recent/offline classification so every live-tracking reader
 * (admin Track-All, driver self, student where's-my-bus) agrees on thresholds:
 * online ≤ 2 min, recent ≤ 5 min, else offline.
 */
export function gpsFreshness(lastUpdate: string | null | undefined): GpsFreshness {
  if (!lastUpdate) return { status: 'offline', minutes: null };
  const t = new Date(lastUpdate).getTime();
  if (Number.isNaN(t)) return { status: 'offline', minutes: null };
  const minutes = Math.floor((Date.now() - t) / 60000);
  if (minutes <= 2) return { status: 'online', minutes };
  if (minutes <= 5) return { status: 'recent', minutes };
  return { status: 'offline', minutes };
}
