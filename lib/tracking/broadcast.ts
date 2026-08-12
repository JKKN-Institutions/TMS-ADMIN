/**
 * Publishing live fixes to Supabase Realtime.
 *
 * Uses the Realtime HTTP broadcast endpoint rather than opening a websocket. The
 * ingest route runs on Vercel serverless, where establishing and tearing down a
 * socket per invocation would cost more than the message itself. Both topics ride in
 * ONE request.
 *
 * Every failure path returns false rather than throwing: by the time we broadcast,
 * the database writes have already committed and the poll fallback still delivers the
 * fix. A broken broadcast must degrade latency, never correctness.
 */

/**
 * Per-route topic. The RLS policy on realtime.messages matches this exact prefix and
 * parses the route id out of it, so the shape here and the policy must stay in step
 * (supabase/migrations/20260811151000_tms_bus_realtime_authorization.sql).
 */
export function busTopic(routeId: string): string {
  return `tms_bus:${routeId}`;
}

/** Fleet-wide topic, restricted by the same policy to holders of tms.tracking.view. */
export const FLEET_TOPIC = 'tms_fleet';

export interface LiveFix {
  tripId: string;
  routeId: string;
  vehicleId: string;
  latitude: number;
  longitude: number;
  /** METRES PER SECOND, as GeolocationCoordinates reports it. Convert at the UI edge. */
  speed: number | null;
  heading: number | null;
  accuracyM: number | null;
  /** Server-receipt time. */
  at: string;
}

export interface BroadcastMessage {
  topic: string;
  event: string;
  payload: unknown;
  private: boolean;
}

export function buildFixMessages(routeId: string, fix: LiveFix): BroadcastMessage[] {
  return [
    { topic: busTopic(routeId), event: 'fix', payload: fix, private: true },
    { topic: FLEET_TOPIC, event: 'fix', payload: fix, private: true },
  ];
}

export async function publishFix(routeId: string, fix: LiveFix): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;

  try {
    const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ messages: buildFixMessages(routeId, fix) }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
