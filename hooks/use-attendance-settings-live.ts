'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { ATTENDANCE_SETTINGS_TOPIC } from '@/lib/boarding/attendance-window';

/**
 * Re-read the attendance windows the moment an admin saves them in Settings.
 *
 * The server sends a data-free "changed" signal on the private topic (see
 * lib/boarding/attendance-broadcast.ts); on receipt this invalidates the page's
 * windows query, which re-reads through the permission-checked
 * GET /api/boarding/attendance-window. Receiving is limited to scan-capable
 * staff by the tms_attendance_settings_realtime_receive policy.
 *
 * BARE TOPIC, no `#instance` suffix. hooks/use-live-bus.ts appends one because
 * several consumers on a page share a topic on the singleton client; this hook
 * has one subscriber per page, so it listens on the exact name the server sends to.
 *
 * Phones drop live connections in the background, so the page also re-reads on
 * tab focus and every two minutes. This hook is the fast path, not the only one.
 */
export function useAttendanceSettingsLive(): void {
  const qc = useQueryClient();
  const supabaseRef = useRef(createClientSupabaseClient());

  useEffect(() => {
    const supabase = supabaseRef.current;
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      // A private channel is authorized against realtime.messages RLS, which
      // needs the user's JWT on the socket.
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (token) supabase.realtime.setAuth(token);
      } catch {
        /* subscribe will fail; the focus and two-minute re-reads still apply */
      }
      if (!active) return;

      const ch = supabase
        .channel(ATTENDANCE_SETTINGS_TOPIC, { config: { private: true } })
        .on('broadcast', { event: 'changed' }, () => {
          void qc.invalidateQueries({ queryKey: ['boarding-attendance-window'] });
        })
        .subscribe();

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
    };
  }, [qc]);
}
