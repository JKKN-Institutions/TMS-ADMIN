'use client';

import { useEffect, useRef, useState } from 'react';
import { subscribeLive, type ChannelStatus } from '@/lib/tracking/live-channel';
import { FLEET_TOPIC, type LiveFix } from '@/lib/tracking/broadcast';
import { keepLatest } from '@/lib/tracking/fleet-fixes';

export type { ChannelStatus };

/** Poll cadence while the socket is healthy — a reconcile, not the primary path. */
export const POLL_SUBSCRIBED_MS = 30_000;
/** Poll cadence while the socket is down — the original behaviour, unchanged. */
export const POLL_FALLBACK_MS = 5_000;

/**
 * Live positions of ONE bus.
 *
 * The topic MUST come from the server (the location endpoints return it). Channel
 * health drives the caller's poll interval: realtime is an accelerator layered over
 * the poll, never a replacement, so a blocked websocket degrades to the 5-second poll
 * rather than a dead page. The subscription itself is shared — see
 * lib/tracking/live-channel.
 */
export function useLiveBus(topic: string | null) {
  const [fix, setFix] = useState<LiveFix | null>(null);
  const [channelStatus, setChannelStatus] = useState<ChannelStatus>('idle');

  useEffect(() => {
    if (!topic) {
      setChannelStatus('idle');
      return;
    }
    const stop = subscribeLive(topic, setFix, setChannelStatus);
    return () => {
      stop();
      setChannelStatus('idle');
    };
    // `topic` is a STRING. Never add an object or array here — these pages poll, so
    // fetched objects have a new identity every tick.
  }, [topic]);

  return {
    fix,
    channelStatus,
    pollIntervalMs: channelStatus === 'subscribed' ? POLL_SUBSCRIBED_MS : POLL_FALLBACK_MS,
  };
}

/**
 * Live positions of the WHOLE fleet: the newest fix per route.
 *
 * `fixes` is one Map that is mutated in place; `version` increases whenever it
 * changes. Depend on `version` (a number), never on the Map, so memos and effects
 * re-run exactly when a position arrived.
 */
export function useLiveFleet() {
  const fixesRef = useRef<Map<string, LiveFix>>(new Map());
  const [version, setVersion] = useState(0);
  const [channelStatus, setChannelStatus] = useState<ChannelStatus>('idle');

  useEffect(() => {
    const stop = subscribeLive(
      FLEET_TOPIC,
      (fix) => {
        if (keepLatest(fixesRef.current, fix)) setVersion((v) => v + 1);
      },
      setChannelStatus,
    );
    return () => {
      stop();
      setChannelStatus('idle');
    };
  }, []);

  return { fixes: fixesRef.current, version, channelStatus };
}
