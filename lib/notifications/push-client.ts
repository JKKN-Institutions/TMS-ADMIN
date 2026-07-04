'use client';

import { urlBase64ToUint8Array } from '@/lib/notifications/push-encoding';

export type PushState = 'unsupported' | 'denied' | 'default' | 'subscribed';

function supported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export async function getPushState(): Promise<PushState> {
  if (!supported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub ? 'subscribed' : 'default';
}

export async function subscribeToPush(): Promise<PushState> {
  if (!supported()) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'default';

  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) {
    console.error('subscribeToPush: NEXT_PUBLIC_VAPID_PUBLIC_KEY missing');
    return 'default';
  }

  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    }));

  const json = sub.toJSON();
  try {
    const res = await fetch('/api/notifications/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ endpoint: sub.endpoint, keys: json.keys, userAgent: navigator.userAgent }),
    });
    if (!res.ok) throw new Error(`subscribe persist failed: HTTP ${res.status}`);
  } catch (e) {
    // Server didn't persist — roll back the browser subscription we just created so
    // the UI state stays honest (neither browser nor server has it; retry re-creates both).
    console.error('subscribeToPush: persist failed, rolling back', e);
    if (!existing) await sub.unsubscribe().catch(() => undefined);
    return Notification.permission === 'denied' ? 'denied' : 'default';
  }
  return 'subscribed';
}

export async function unsubscribeFromPush(): Promise<PushState> {
  if (!supported()) return 'unsupported';
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    const endpoint = sub.endpoint;
    await sub.unsubscribe().catch(() => undefined);
    const res = await fetch('/api/notifications/push/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ endpoint }),
    });
    if (!res.ok) {
      // Stale server row will be pruned on the next 410 from a push send attempt; not fatal.
      console.error(`unsubscribeFromPush: persist failed, HTTP ${res.status}`);
    }
  }
  return Notification.permission === 'denied' ? 'denied' : 'default';
}
