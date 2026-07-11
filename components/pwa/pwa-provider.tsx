'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, RefreshCw, X } from 'lucide-react';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

/**
 * Unified PWA controller for ALL four portals (Admin/Student/Driver/Boarding).
 * Registers the root service worker (/sw.js), surfaces an install affordance
 * (Android/desktop prompt + iOS Add-to-Home hint), and a manual "update ready"
 * banner. Mounted once in the root layout; replaces the retired DriverPwa.
 *
 * All affordances render as full-width bars pinned to the TOP of the viewport so
 * they are equally prominent on every portal. The rendered stack is measured and
 * exposed as the CSS variable --pwa-banner-h on <html>; globals.css offsets the
 * fixed sidebar + header and the page content by that height so the banners push
 * content down instead of hiding it.
 */
export default function PwaProvider() {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const [dismissedInstall, setDismissedInstall] = useState(false);
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 1. Register the unified service worker after load (never blocks first paint).
    const registerSw = () => {
      if (!('serviceWorker' in navigator)) return;

      // The SW must NOT run in development. It caches /_next/static/ chunks and
      // serves them stale-while-revalidate, which breaks Turbopack HMR/rebuilds
      // with "module factory is not available" whenever the chunk graph changes
      // (e.g. a static→dynamic import). In prod those chunks are content-hashed
      // so caching is safe. In dev: actively unregister any SW + drop the shell
      // caches left over from a prior dev session, and never register.
      if (process.env.NODE_ENV !== 'production') {
        // Evict any SW left over from a prior dev session, THEN — if this page is
        // still being *controlled* by that worker — reload once so it loads
        // uncontrolled. Unregistering alone is not enough: the active worker keeps
        // serving the current client (a stale /api 404, a stale chunk) until the
        // page is reloaded. The sessionStorage latch makes the reload strictly
        // one-shot so a worker that lingers (e.g. another tab still holds it)
        // can't cause a reload loop.
        Promise.all([
          navigator.serviceWorker
            .getRegistrations()
            .then((regs) => Promise.all(regs.map((r) => r.unregister())))
            .catch(() => undefined),
          'caches' in window
            ? caches
                .keys()
                .then((keys) =>
                  Promise.all(
                    keys.filter((k) => k.startsWith('tms-shell-')).map((k) => caches.delete(k))
                  )
                )
                .catch(() => undefined)
            : undefined,
        ]).then(() => {
          try {
            if (
              navigator.serviceWorker.controller &&
              !sessionStorage.getItem('tms-sw-dev-reloaded')
            ) {
              sessionStorage.setItem('tms-sw-dev-reloaded', '1');
              window.location.reload();
            }
          } catch {
            // sessionStorage unavailable — skip the auto-reload (a manual reload
            // still escapes the worker once it has been unregistered above).
          }
        });
        return;
      }

      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          // A new SW installing while an old one still controls the page = update.
          reg.addEventListener('updatefound', () => {
            const nw = reg.installing;
            if (!nw) return;
            nw.addEventListener('statechange', () => {
              if (nw.state === 'installed' && navigator.serviceWorker.controller) {
                setUpdateReady(true);
              }
            });
          });
        })
        .catch(() => {
          /* installability is best-effort — never surface an error to the user */
        });
    };
    if (document.readyState === 'complete') registerSw();
    else window.addEventListener('load', registerSw);

    // 2. Capture the install prompt (Android / desktop Chromium).
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as InstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);

    // 3. iOS Safari never fires beforeinstallprompt — offer an A2HS hint instead,
    //    but only when not already installed (standalone).
    const ua = navigator.userAgent || '';
    const isIos = /iphone|ipad|ipod/i.test(ua);
    const standalone =
      (navigator as Navigator & { standalone?: boolean }).standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches;
    if (isIos && !standalone) setIosHint(true);

    // 4. Hide install UI once the app is installed.
    const onInstalled = () => {
      setDeferred(null);
      setIosHint(false);
    };
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('load', registerSw);
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  // Measure the visible top-banner stack and publish its height to the layout via
  // --pwa-banner-h. Re-runs whenever the visible banners change, and tracks text
  // re-wrapping / viewport resizes through a ResizeObserver. Resets to 0px when
  // nothing is shown (empty container ⇒ offsetHeight 0) or on unmount.
  useEffect(() => {
    const el = bannerRef.current;
    const root = document.documentElement;
    const apply = () => {
      const h = el?.offsetHeight ?? 0;
      root.style.setProperty('--pwa-banner-h', h ? `${h}px` : '0px');
    };
    apply();
    let ro: ResizeObserver | undefined;
    if (el && 'ResizeObserver' in window) {
      ro = new ResizeObserver(apply);
      ro.observe(el);
    }
    window.addEventListener('resize', apply);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', apply);
      root.style.setProperty('--pwa-banner-h', '0px');
    };
  }, [updateReady, deferred, iosHint, dismissedInstall]);

  return (
    <div ref={bannerRef} className="fixed inset-x-0 top-0 z-[60]">
      {updateReady && (
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-green-700 px-4 py-2 text-center text-sm font-medium text-white shadow-md">
          <span>A new version of JKKN TMS is available.</span>
          <span className="inline-flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 font-semibold hover:bg-white/30"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reload
            </button>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setUpdateReady(false)}
              className="rounded-full p-1 hover:bg-white/20"
            >
              <X className="h-4 w-4" />
            </button>
          </span>
        </div>
      )}

      {!dismissedInstall && deferred && (
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-green-600 px-4 py-2 text-center text-sm font-medium text-white shadow-md">
          <span className="inline-flex items-center gap-2">
            <Download className="h-4 w-4 shrink-0" />
            Install JKKN TMS for a faster, app-like experience.
          </span>
          <span className="inline-flex items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                await deferred.prompt();
                await deferred.userChoice.catch(() => undefined);
                setDeferred(null);
              }}
              className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 font-semibold hover:bg-white/30"
            >
              Install
            </button>
            <button
              type="button"
              aria-label="Dismiss install"
              onClick={() => setDismissedInstall(true)}
              className="rounded-full p-1 hover:bg-white/20"
            >
              <X className="h-4 w-4" />
            </button>
          </span>
        </div>
      )}

      {!dismissedInstall && !deferred && iosHint && (
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 bg-gray-900 px-4 py-2 text-center text-xs font-medium text-white shadow-md">
          <span>
            Install this app: tap <span className="font-semibold">Share</span>, then{' '}
            <span className="font-semibold">Add to Home Screen</span>.
          </span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setDismissedInstall(true)}
            className="rounded-full p-1 hover:bg-white/20"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
