'use client';

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Injects driver-portal PWA head tags, registers the no-op SW, and offers an install affordance. */
export default function DriverPwa() {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    // Inject head tags once (the driver layout is a client component, so we can't use `metadata`).
    const add = (tag: string, attrs: Record<string, string>) => {
      const sel = Object.entries(attrs)
        .map(([k, v]) => `[${k}="${v}"]`)
        .join('');
      if (document.head.querySelector(`${tag}${sel}`)) return;
      const el = document.createElement(tag);
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
      document.head.appendChild(el);
    };
    add('link', { rel: 'manifest', href: '/driver.webmanifest' });
    add('meta', { name: 'theme-color', content: '#16a34a' });
    add('link', { rel: 'apple-touch-icon', href: '/icons/driver-icon.svg' });
    add('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
    add('meta', { name: 'apple-mobile-web-app-title', content: 'JKKN Driver' });

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw-driver.js').catch(() => {
        /* installability is best-effort */
      });
    }

    // iOS Safari never fires beforeinstallprompt — show an Add-to-Home-Screen hint instead,
    // but only when not already installed (standalone).
    const ua = navigator.userAgent || '';
    const isIos = /iphone|ipad|ipod/i.test(ua);
    const standalone =
      (navigator as Navigator & { standalone?: boolean }).standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches;
    if (isIos && !standalone) setIosHint(true);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as InstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (deferred) {
    return (
      <button
        type="button"
        onClick={async () => {
          await deferred.prompt();
          await deferred.userChoice.catch(() => undefined);
          setDeferred(null);
        }}
        className="fixed bottom-20 right-4 z-40 inline-flex items-center gap-2 rounded-full bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:bg-green-700 lg:bottom-4"
      >
        <Download className="h-4 w-4" />
        Install app
      </button>
    );
  }

  if (iosHint) {
    return (
      <div className="fixed bottom-20 right-4 z-40 max-w-[15rem] rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white shadow-lg lg:bottom-4">
        Install this app: tap <span className="font-semibold">Share</span>, then{' '}
        <span className="font-semibold">Add to Home Screen</span>.
      </div>
    );
  }

  return <></>;
}
