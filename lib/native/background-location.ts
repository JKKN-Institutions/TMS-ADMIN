import { registerPlugin } from '@capacitor/core';

/** Minimal shape of the plugin's location callback payload we consume. */
interface PluginLocation {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  speed?: number | null;
  bearing?: number | null;
  time?: number | null;
}
interface BackgroundGeolocationPlugin {
  addWatcher(
    options: {
      backgroundMessage: string;
      backgroundTitle: string;
      requestPermissions: boolean;
      stale: boolean;
      distanceFilter: number;
    },
    callback: (location?: PluginLocation, error?: { code: string; message: string }) => void
  ): Promise<string>;
  removeWatcher(options: { id: string }): Promise<void>;
}

const BackgroundGeolocation =
  registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

export interface NativeFix {
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  timestamp: number;
}

/** Pure mapping from the plugin payload to our fix shape (unit-tested). */
export function mapPluginLocationToFix(loc: PluginLocation): NativeFix {
  return {
    lat: loc.latitude,
    lng: loc.longitude,
    accuracy: loc.accuracy ?? null,
    speed: loc.speed ?? null,
    heading: loc.bearing ?? null,
    timestamp: loc.time ?? Date.now(),
  };
}

/**
 * Start a background-capable GPS watch. Runs under an Android foreground service
 * (persistent notification), so the callback keeps firing with the screen off /
 * app backgrounded. Returns a watcher id to pass to stopBackgroundWatch.
 */
export async function startBackgroundWatch(
  onFix: (fix: NativeFix) => void,
  onError: (err: { code: string; message: string }) => void
): Promise<string> {
  return BackgroundGeolocation.addWatcher(
    {
      backgroundTitle: 'JKKN TMS Driver — On Duty',
      backgroundMessage: 'Sharing your location with the transport office.',
      requestPermissions: true,
      stale: false,
      distanceFilter: 10,
    },
    (location, error) => {
      if (error) return onError(error);
      if (location) onFix(mapPluginLocationToFix(location));
    }
  );
}

export async function stopBackgroundWatch(id: string): Promise<void> {
  await BackgroundGeolocation.removeWatcher({ id });
}
