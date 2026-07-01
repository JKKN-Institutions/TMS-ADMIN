/**
 * Geolocation error classification for the driver live-sharing page.
 *
 * The browser's `GeolocationPositionError.code` is one of three standard values.
 * The critical distinction for a *continuous* `watchPosition` session is
 * terminal vs. transient:
 *
 *  - PERMISSION_DENIED (1) is TERMINAL — the user (or OS) refused access, so no
 *    future fix will ever arrive. The only sane response is to stop sharing and
 *    tell the driver how to re-enable it.
 *  - POSITION_UNAVAILABLE (2) and TIMEOUT (3) are TRANSIENT — extremely common on
 *    a moving bus (tunnels, tall buildings, cold-start GPS re-acquisition). The
 *    W3C Geolocation spec allows `watchPosition` to report one of these and then
 *    keep delivering positions. Tearing down the watch on the first hiccup is the
 *    bug that froze the admin map at the driver's *start* point while the DB still
 *    reported them "Active".
 *
 * Unknown/future codes fail OPEN (treated as transient) so a spec addition can
 * never silently kill a live duty session.
 */
export const GEO_PERMISSION_DENIED = 1;
export const GEO_POSITION_UNAVAILABLE = 2;
export const GEO_TIMEOUT = 3;

/** True only for errors from which the session can never recover (permission denied). */
export function isTerminalGeoError(code: number): boolean {
  return code === GEO_PERMISSION_DENIED;
}

/** Driver-facing message for a geolocation error code. */
export function geoErrorMessage(code: number): string {
  if (code === GEO_PERMISSION_DENIED) {
    return 'Location permission denied. Enable it for this site in your browser settings, then try again.';
  }
  if (code === GEO_TIMEOUT) {
    return 'Still acquiring a GPS fix — keep a clear view of the sky. Sharing will resume automatically.';
  }
  return 'GPS signal dropped momentarily. Sharing will resume automatically once your location is available again.';
}

export interface GeoErrorOutcome {
  /** Whether the live-sharing session should be torn down (watch + send interval cleared). */
  stopSharing: boolean;
  /** Driver-facing message to surface. */
  message: string;
}

/**
 * The single decision the driver page makes when `getCurrentPosition` /
 * `watchPosition` reports an error: tear the session down, or ride it out?
 *
 * Only a terminal (permission-denied) error stops sharing. Every transient error
 * keeps the session alive so the re-send interval keeps flowing the last good fix
 * and `watchPosition` can recover — the regression this guards against is a single
 * transient error freezing the admin map at the driver's start point.
 */
export function geoErrorOutcome(code: number): GeoErrorOutcome {
  return { stopSharing: isTerminalGeoError(code), message: geoErrorMessage(code) };
}
