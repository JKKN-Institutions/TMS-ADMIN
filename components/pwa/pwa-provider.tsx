'use client';

import { useEffect, useState } from 'react';
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
 */
export default function PwaProvider() {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const [dismissedInstall, setDismissedInstall] = useState(false);

  useEffect(() => {
    // 1. Register the unified service worker after load (never blocks first paint).
    const registerSw = () => {
      if (!('serviceWorker' in navigator)) return;
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

  return (
    <>
      {updateReady && (
        <div className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-3 bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-md">
          <span>A new version of JKKN TMS is available.</span>
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
        </div>
      )}

      {!dismissedInstall && deferred && (
        <div className="fixed bottom-20 right-4 z-40 flex items-center gap-1 lg:bottom-4">
          <button
            type="button"
            onClick={async () => {
              await deferred.prompt();
              await deferred.userChoice.catch(() => undefined);
              setDeferred(null);
            }}
            className="inline-flex items-center gap-2 rounded-full bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:bg-green-700"
          >
            <Download className="h-4 w-4" />
            Install app
          </button>
          <button
            type="button"
            aria-label="Dismiss install"
            onClick={() => setDismissedInstall(true)}
            className="rounded-full bg-gray-900/80 p-1.5 text-white shadow-lg hover:bg-gray-900"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {!dismissedInstall && !deferred && iosHint && (
        <div className="fixed bottom-20 right-4 z-40 max-w-[15rem] rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white shadow-lg lg:bottom-4">
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setDismissedInstall(true)}
            className="absolute right-1 top-1 rounded p-0.5 hover:bg-white/20"
          >
            <X className="h-3 w-3" />
          </button>
          Install this app: tap <span className="font-semibold">Share</span>, then{' '}
          <span className="font-semibold">Add to Home Screen</span>.
        </div>
      )}
    </>
  );
}
