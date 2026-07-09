'use client';

import { useCallback, useState } from 'react';
import type { LatLng } from '@/lib/gps/interpolate';
import { GEO_PERMISSION_DENIED, geoErrorMessage } from '@/lib/driver/geo';

export type ViewerLocationStatus =
  | 'idle' | 'loading' | 'granted' | 'denied' | 'unsupported' | 'error';

export interface ViewerLocationState {
  viewer: LatLng | null;
  status: ViewerLocationStatus;
  message: string | null;
  request: () => void;
}

/**
 * One-shot "where am I" for the rider live-track pages. NEVER auto-runs — the page
 * calls `request()` from a button tap so the browser permission prompt is expected,
 * not a surprise. Reuses the driver geolocation error copy (already unit-tested).
 */
export function useViewerLocation(): ViewerLocationState {
  const [viewer, setViewer] = useState<LatLng | null>(null);
  const [status, setStatus] = useState<ViewerLocationStatus>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const request = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unsupported');
      setMessage('Your browser does not support location.');
      return;
    }
    setStatus('loading');
    setMessage(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setViewer({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setStatus('granted');
        setMessage(null);
      },
      (err) => {
        const denied = err.code === GEO_PERMISSION_DENIED;
        setStatus(denied ? 'denied' : 'error');
        setMessage(
          denied
            ? geoErrorMessage(GEO_PERMISSION_DENIED)
            : "Couldn't get your location. Try again in a moment.",
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  }, []);

  return { viewer, status, message, request };
}
