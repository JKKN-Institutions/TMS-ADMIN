'use client';

import { useSyncExternalStore } from 'react';

/**
 * The browser's "install this app" prompt, shared between the top install bar
 * (components/pwa/pwa-provider) and the sidebar Install button.
 *
 * Chromium fires `beforeinstallprompt` once per page and the event can only be
 * used by whoever kept it, so it lives here rather than in one component's
 * state. PwaProvider is the only writer.
 */
export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

let current: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

export function setInstallPrompt(event: InstallPromptEvent | null): void {
  if (current === event) return;
  current = event;
  listeners.forEach((notify) => notify());
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
}

/** The captured prompt, or null when the browser has not offered one. */
export function useInstallPrompt(): InstallPromptEvent | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

/**
 * Show the browser's install dialog. A prompt can be shown once, so it is
 * cleared whatever the person chooses.
 */
export async function runInstallPrompt(): Promise<InstallOutcome> {
  const event = current;
  if (!event) return 'unavailable';
  try {
    await event.prompt();
    const choice = await event.userChoice.catch(() => undefined);
    return choice?.outcome === 'accepted' ? 'accepted' : 'dismissed';
  } finally {
    setInstallPrompt(null);
  }
}
