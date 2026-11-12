'use client';

/**
 * One Supabase Realtime subscription per live-position topic, shared by everything on
 * the page that wants it.
 *
 * Two rules this file exists to enforce:
 *
 * 1. The channel name is the topic, EXACTLY. For a broadcast channel the name is the
 *    address the server posts to, and the permission rule on realtime.messages matches
 *    it literally ('tms_fleet', 'tms_bus:<route id>'). An earlier version appended a
 *    per-component suffix to avoid a "cannot add callbacks after subscribe()" error;
 *    that made every subscription both miss the messages and fail the permission rule,
 *    so the live feed never connected and every screen silently polled instead.
 *
 * 2. One channel per topic. The error that suffix was dodging is real: the Supabase
 *    client keeps one channel object per name, and a second consumer cannot attach to
 *    it once it is subscribed. So consumers register here and share the one channel;
 *    it is opened on the first listener and closed after the last one leaves.
 */
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { LiveFix } from './broadcast';

export type ChannelStatus = 'idle' | 'subscribing' | 'subscribed' | 'error';

type FixListener = (fix: LiveFix) => void;
type StatusListener = (status: ChannelStatus) => void;

interface Hub {
  status: ChannelStatus;
  fixListeners: Set<FixListener>;
  statusListeners: Set<StatusListener>;
  /** Null until the async open finishes. */
  channel: { unsubscribe?: () => unknown } | null;
  closeTimer: ReturnType<typeof setTimeout> | null;
  closed: boolean;
}

const hubs = new Map<string, Hub>();

/** Leaving and re-entering a page (or React's dev double-mount) reuses the channel. */
const CLOSE_DELAY_MS = 2000;

function setStatus(hub: Hub, status: ChannelStatus) {
  hub.status = status;
  for (const l of hub.statusListeners) l(status);
}

async function open(topic: string, hub: Hub) {
  const supabase = createClientSupabaseClient();
  // A private channel is authorised against realtime.messages RLS, which needs the
  // user's token on the socket.
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) supabase.realtime.setAuth(token);
  } catch {
    /* subscribe will report an error and callers fall back to polling */
  }
  if (hub.closed) return;

  const channel = supabase
    .channel(topic, { config: { private: true } })
    .on('broadcast', { event: 'fix' }, (message: { payload?: unknown }) => {
      const payload = message.payload;
      if (payload && typeof payload === 'object') {
        for (const l of hub.fixListeners) l(payload as LiveFix);
      }
    })
    .subscribe((state: string) => {
      if (hub.closed) return;
      if (state === 'SUBSCRIBED') setStatus(hub, 'subscribed');
      else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT' || state === 'CLOSED') setStatus(hub, 'error');
    });

  hub.channel = channel;
  if (hub.closed) void supabase.removeChannel(channel);
}

function close(topic: string, hub: Hub) {
  hub.closed = true;
  hubs.delete(topic);
  if (hub.channel) {
    const supabase = createClientSupabaseClient();
    void supabase.removeChannel(hub.channel as Parameters<typeof supabase.removeChannel>[0]);
  }
}

/**
 * Listen to a live-position topic. Returns the function that stops listening.
 *
 * `topic` must come from the server (the location endpoints return it) or be the
 * fleet constant — never build it from anything the user can edit.
 */
export function subscribeLive(topic: string, onFix: FixListener, onStatus: StatusListener): () => void {
  let hub = hubs.get(topic);
  // A channel that failed and has nobody left listening is not worth inheriting:
  // start a fresh one for the new listener.
  if (hub && hub.status === 'error' && hub.fixListeners.size === 0) {
    if (hub.closeTimer) clearTimeout(hub.closeTimer);
    close(topic, hub);
    hub = undefined;
  }
  if (!hub) {
    hub = {
      status: 'subscribing',
      fixListeners: new Set(),
      statusListeners: new Set(),
      channel: null,
      closeTimer: null,
      closed: false,
    };
    hubs.set(topic, hub);
    void open(topic, hub);
  }
  if (hub.closeTimer) {
    clearTimeout(hub.closeTimer);
    hub.closeTimer = null;
  }
  hub.fixListeners.add(onFix);
  hub.statusListeners.add(onStatus);
  onStatus(hub.status);

  const mine = hub;
  return () => {
    mine.fixListeners.delete(onFix);
    mine.statusListeners.delete(onStatus);
    if (mine.fixListeners.size === 0 && !mine.closed && !mine.closeTimer) {
      mine.closeTimer = setTimeout(() => {
        mine.closeTimer = null;
        if (mine.fixListeners.size === 0) close(topic, mine);
      }, CLOSE_DELAY_MS);
    }
  };
}
