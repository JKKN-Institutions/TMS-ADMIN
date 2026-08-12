'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { LiveFix } from '@/lib/tracking/broadcast';

/** Poll cadence while the socket is healthy — a reconcile, not the primary path. */
export const POLL_SUBSCRIBED_MS = 30_000;
/** Poll cadence while the socket is down — the original behaviour, unchanged. */
export const POLL_FALLBACK_MS = 5_000;

export type ChannelStatus = 'idle' | 'subscribing' | 'subscribed' | 'error';

/**
 * Subscribe to a live-position topic.
 *
 * The topic MUST come from the server (the location endpoints return it). Never build
 * it from a value the user can edit — the RLS policy on realtime.messages would refuse
 * anyway, but constructing it client-side invites exactly the bug the policy exists to
 * catch.
 *
 * Channel health drives the caller's poll interval: realtime is an accelerator layered
 * over the existing poll, never a replacement, so a blocked websocket degrades to
 * today's 5-second behaviour rather than a dead page.
 */
export function useLiveBus(topic: string | null) {
  const [fix, setFix] = useState<LiveFix | null>(null);
  const [channelStatus, setChannelStatus] = useState<ChannelStatus>('idle');
  const supabaseRef = useRef(createClientSupabaseClient());
  // Distinct topic per hook instance, mirroring hooks/use-tms-notifications.ts: two
  // consumers sharing one topic on the singleton client makes the second .on() call
  // throw ("cannot add callbacks after subscribe()").
  const instanceId = useId();

  useEffect(() => {
    if (!topic) {
      setChannelStatus('idle');
      return;
    }

    const supabase = supabaseRef.current;
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    setChannelStatus('subscribing');

    (async () => {
      // A private channel is authorized against realtime.messages RLS, which needs the
      // user's JWT on the socket. Without this the subscribe fails as unauthorized.
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (token) supabase.realtime.setAuth(token);
      } catch {
        /* fall through — subscribe will report CHANNEL_ERROR and we degrade to polling */
      }
      if (!active) return;

      const ch = supabase
        .channel(`${topic}#${instanceId}`, { config: { private: true } })
        .on('broadcast', { event: 'fix' }, (message: { payload?: unknown }) => {
          const payload = message.payload;
          if (payload && typeof payload === 'object') setFix(payload as LiveFix);
        })
        .subscribe((status: string) => {
          if (!active) return;
          if (status === 'SUBSCRIBED') setChannelStatus('subscribed');
          else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            setChannelStatus('error');
          }
        });

      channel = ch;
      // Unmounted while awaiting getSession() (StrictMode/navigation) — tear down now.
      if (!active) {
        supabase.removeChannel(ch);
        channel = null;
      }
    })();

    return () => {
      active = false;
      if (channel) supabase.removeChannel(channel);
      setChannelStatus('idle');
    };
    // `topic` and `instanceId` are STRINGS. Never add an object or array here — these
    // pages poll, so fetched objects have a new identity every tick.
  }, [topic, instanceId]);

  return {
    fix,
    channelStatus,
    pollIntervalMs: channelStatus === 'subscribed' ? POLL_SUBSCRIBED_MS : POLL_FALLBACK_MS,
  };
}
