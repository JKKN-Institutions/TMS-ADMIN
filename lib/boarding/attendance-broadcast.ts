import { ATTENDANCE_SETTINGS_TOPIC } from './attendance-window';

/**
 * Tell open boarding screens that the attendance windows just changed, so they
 * re-read them now instead of on their next reload.
 *
 * Mirrors publishFix in lib/tracking/broadcast.ts: one POST to the Realtime HTTP
 * broadcast endpoint with the service-role key, because a websocket per
 * serverless invocation costs more than the message.
 *
 * The payload is EMPTY on purpose. The signal only says "re-read"; each screen
 * re-reads through GET /api/boarding/attendance-window, which checks the
 * caller's permission. What a staffer may see is decided there, never here.
 *
 * Never throws. It runs after the settings write has committed, so a failed
 * signal may only delay a screen, which also re-reads on focus and every two
 * minutes — it can never corrupt anything.
 */
export async function publishAttendanceSettingsChanged(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;
  try {
    const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        messages: [{ topic: ATTENDANCE_SETTINGS_TOPIC, event: 'changed', payload: {}, private: true }],
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
