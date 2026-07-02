'use client';

import { useCallback, useReducer, useRef, useState, useEffect } from 'react';
import {
  reduceTracking,
  initialTrackingState,
  isSharing,
  type TrackingBanner,
  type TrackingStatus,
} from './tracking-controller';
import { isFixStale } from './tracking';
import { isNativeApp } from '@/lib/native/platform';
import { startBackgroundWatch, stopBackgroundWatch, type NativeFix } from '@/lib/native/background-location';

/** Post the latest fix this often (send-latest, not per-callback — saves battery + data). */
const SEND_INTERVAL_MS = 6000;
/** Heartbeat cadence feeding the controller's stall watchdog. */
const TICK_INTERVAL_MS = 5000;
/** Basic retry: attempts per send before giving up until the next tick. */
const SEND_ATTEMPTS = 3;

type WakeLock =
  | { release: () => Promise<void>; addEventListener?: (t: 'release', cb: () => void) => void }
  | null;

export interface DriverFix {
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
}

export function useLiveTracking(routeId: string | null) {
  const [state, dispatch] = useReducer(reduceTracking, initialTrackingState);
  const [fix, setFix] = useState<DriverFix | null>(null);
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);

  const routeIdRef = useRef(routeId);
  const latestFixRef = useRef<GeolocationPosition | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const nativeWatchIdRef = useRef<string | null>(null);
  const sendTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wakeLockRef = useRef<WakeLock>(null);
  // Cancels an in-flight POST (and its retry/backoff) the instant the session stops,
  // so a straggling ping can't resolve after DELETE and re-flip the server to "sharing".
  const abortRef = useRef<AbortController | null>(null);
  // Synchronous re-entrancy latch: claimed at the top of start() before any await, so a
  // double-tap during the async permission check can't spin up a second watch/interval set.
  const startingRef = useRef(false);
  // True only once the watch is actually running → gates the DELETE, so a pre-check
  // denial or a mere visit-and-leave of the page can't fire a false off-duty write + audit.
  const startedRef = useRef(false);
  // Prevents overlapping sendPing invocations when a slow retry outlasts the 6s tick.
  const sendingRef = useRef(false);

  useEffect(() => {
    routeIdRef.current = routeId;
  }, [routeId]);

  const acquireWakeLock = useCallback(async () => {
    if (wakeLockRef.current || typeof navigator === 'undefined') return;
    try {
      const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLock> } };
      const sentinel = (await nav.wakeLock?.request('screen')) ?? null;
      wakeLockRef.current = sentinel;
      sentinel?.addEventListener?.('release', () => {
        wakeLockRef.current = null;
      });
    } catch {
      /* unsupported/denied — capture still works while visible */
    }
  }, []);

  const sendPing = useCallback(async () => {
    if (sendingRef.current) return;
    const pos = latestFixRef.current;
    const rid = routeIdRef.current;
    if (!pos || !rid) return;
    if (isFixStale(pos.timestamp, Date.now())) return; // watchPosition frozen — don't re-send a stale fix
    const signal = abortRef.current?.signal;
    const body = JSON.stringify({
      routeId: rid,
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: pos.coords.accuracy ?? null,
      speed: pos.coords.speed ?? null,
      heading: pos.coords.heading ?? null,
      capturedAt: new Date(pos.timestamp).toISOString(),
    });
    sendingRef.current = true;
    try {
      for (let attempt = 0; attempt < SEND_ATTEMPTS; attempt++) {
        if (signal?.aborted) return;
        try {
          const res = await fetch('/api/driver/location', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body,
            signal,
          });
          if (signal?.aborted) return;
          if (res.ok) {
            setLastSentAt(Date.now());
            return;
          }
        } catch {
          if (signal?.aborted) return;
          /* network hiccup — retry */
        }
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    } finally {
      sendingRef.current = false;
    }
  }, []);

  // Release all capture resources (watch, timers, wake lock, in-flight POST) and, when a
  // session actually ran, tell the server we stopped. Does NOT touch the controller
  // status/banner, so callers can tear down while KEEPING a terminal banner (e.g.
  // permission-denied) visible to the driver.
  const teardown = useCallback(async (notifyServer: boolean) => {
    // Claim the started/starting latches synchronously before any await, so two concurrent
    // teardown triggers (permission-denied effect + unmount) can't both fire the DELETE.
    const started = startedRef.current;
    startingRef.current = false;
    startedRef.current = false;
    if (watchIdRef.current !== null && typeof navigator !== 'undefined') {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (nativeWatchIdRef.current) {
      try {
        await stopBackgroundWatch(nativeWatchIdRef.current);
      } catch {
        /* ignore */
      }
      nativeWatchIdRef.current = null;
    }
    if (sendTimerRef.current) clearInterval(sendTimerRef.current);
    if (tickTimerRef.current) clearInterval(tickTimerRef.current);
    sendTimerRef.current = null;
    tickTimerRef.current = null;
    abortRef.current?.abort();
    abortRef.current = null;
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
      } catch {
        /* ignore */
      }
      wakeLockRef.current = null;
    }
    latestFixRef.current = null;
    if (notifyServer && started) {
      try {
        await fetch('/api/driver/location', { method: 'DELETE', credentials: 'same-origin', keepalive: true });
      } catch {
        /* ignore */
      }
    }
  }, []);

  const stop = useCallback(
    async (notifyServer = true) => {
      await teardown(notifyServer);
      setFix(null);
      setLastSentAt(null);
      dispatch({ type: 'stop' });
    },
    [teardown]
  );

  const start = useCallback(async () => {
    if (startingRef.current || watchIdRef.current !== null) return; // ignore re-entrant taps
    if (!isNativeApp() && (typeof navigator === 'undefined' || !('geolocation' in navigator))) {
      dispatch({ type: 'start' });
      dispatch({ type: 'geoError', code: 2 });
      return;
    }
    if (!routeIdRef.current) return;
    startingRef.current = true;
    dispatch({ type: 'start' });

    // Web only: pre-check permission so a hard "denied" is surfaced immediately. On native the
    // WebView Permissions API is separate from the OS location grant the plugin requests, so a
    // false "denied" here must NOT block the native watcher — the plugin's requestPermissions
    // (and NOT_AUTHORIZED → code 1) handles native permissions instead.
    if (!isNativeApp()) {
      try {
        const perm = await (navigator as Navigator & {
          permissions?: { query: (d: { name: 'geolocation' }) => Promise<{ state: string }> };
        }).permissions?.query({ name: 'geolocation' });
        if (perm?.state === 'denied') {
          dispatch({ type: 'geoError', code: 1 }); // → permission_denied effect tears down (resets latches)
          return;
        }
      } catch {
        /* Permissions API unsupported — fall through to the live prompt */
      }
    }

    abortRef.current = new AbortController();
    await acquireWakeLock();

    if (isNativeApp()) {
      // Native background watcher: keeps firing with the screen off / app backgrounded.
      // Feeds the SAME latestFixRef + sendPing pipeline the web path uses; the 6s send
      // timer is kept so an idling bus stays fresh exactly like the web path.
      const applyNativeFix = (nf: NativeFix) => {
        latestFixRef.current = {
          coords: {
            latitude: nf.lat,
            longitude: nf.lng,
            accuracy: nf.accuracy ?? 0,
            speed: nf.speed,
            heading: nf.heading,
            altitude: null,
            altitudeAccuracy: null,
          },
          timestamp: nf.timestamp,
        } as unknown as GeolocationPosition;
        dispatch({ type: 'fix', atMs: Date.now() });
        setFix({ lat: nf.lat, lng: nf.lng, accuracy: nf.accuracy, speed: nf.speed });
        void sendPing();
      };
      nativeWatchIdRef.current = await startBackgroundWatch(applyNativeFix, (err) =>
        dispatch({ type: 'geoError', code: err.code === 'NOT_AUTHORIZED' ? 1 : 2 })
      );
      sendTimerRef.current = setInterval(() => void sendPing(), SEND_INTERVAL_MS);
      tickTimerRef.current = setInterval(() => dispatch({ type: 'tick', nowMs: Date.now() }), TICK_INTERVAL_MS);
      startedRef.current = true;
    } else {
      const onPos = (pos: GeolocationPosition) => {
        latestFixRef.current = pos;
        dispatch({ type: 'fix', atMs: Date.now() });
        setFix({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? null,
          speed: pos.coords.speed ?? null,
        });
      };
      const onErr = (err: GeolocationPositionError) => dispatch({ type: 'geoError', code: err.code });

      const opts: PositionOptions = { enableHighAccuracy: true, timeout: 15000, maximumAge: 2000 };
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          onPos(pos);
          void sendPing();
        },
        onErr,
        opts
      );
      watchIdRef.current = navigator.geolocation.watchPosition(onPos, onErr, opts);
      sendTimerRef.current = setInterval(() => void sendPing(), SEND_INTERVAL_MS);
      tickTimerRef.current = setInterval(() => dispatch({ type: 'tick', nowMs: Date.now() }), TICK_INTERVAL_MS);
      startedRef.current = true;
    }
  }, [acquireWakeLock, sendPing]);

  // Re-acquire the wake lock and tell the controller when the tab returns/hides. On native,
  // also restart the background watcher if the OS reclaimed it while we were away but the
  // React state survived (sharing + visible + no live native watcher id). NOTE: this does
  // NOT cover a full process kill+relaunch (state resets to not-sharing, so this effect is
  // inactive) — that would need persisted on-duty state, deferred until device testing shows
  // it's needed.
  useEffect(() => {
    if (!isSharing(state.status) || typeof document === 'undefined') return;
    const onVisible = () => {
      const visible = document.visibilityState === 'visible';
      // atMs stamps WHEN the screen went off / came back, so the controller can
      // measure the 2h background auto-stop window against real wall-clock time.
      dispatch({ type: 'visibility', visible, atMs: Date.now() });
      if (visible) {
        void acquireWakeLock();
        if (isNativeApp() && !nativeWatchIdRef.current && !startingRef.current) {
          void start(); // watcher was reclaimed in the background — bring it back
        }
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [state.status, acquireWakeLock, start]);

  // Permission denied is terminal: release resources and clear server state, but leave the
  // status/banner as permission_denied so the driver still sees how to re-enable location.
  useEffect(() => {
    if (state.status === 'permission_denied') void teardown(true);
  }, [state.status, teardown]);

  // The controller can reach 'stopped' on its OWN — the 2h paused-in-background
  // auto-stop — not just via the stop() callback. When it does, release capture
  // resources + notify the server, mirroring stop(). teardown() leaves the banner
  // untouched, so the "Sharing stopped" explanation stays on screen. (An explicit
  // stop() already ran teardown before dispatching 'stop', clearing startedRef, so
  // this guard makes the effect a no-op in that case — no double DELETE.)
  useEffect(() => {
    if (state.status === 'stopped' && startedRef.current) {
      void teardown(true);
      setFix(null);
      setLastSentAt(null);
    }
  }, [state.status, teardown]);

  // Stop + notify the server if the page unmounts while a session is actually running.
  useEffect(() => {
    return () => {
      if (startedRef.current) void stop(true);
    };
  }, [stop]);

  return {
    status: state.status as TrackingStatus,
    banner: state.banner as TrackingBanner | null,
    onDuty: isSharing(state.status),
    fix,
    lastSentAt,
    start,
    stop,
  };
}
