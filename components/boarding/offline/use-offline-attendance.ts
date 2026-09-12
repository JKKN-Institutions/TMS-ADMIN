'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import type { RosterRow } from '@/lib/booking/roster';
import type { AttDirection } from '@/lib/boarding/attendance-window';
import { offlineKv } from '@/lib/boarding/offline/kv';
import {
  dismissProblem, enqueueMark, enqueueScan, listOutbox, listProblems,
  type OutboxEntry, type Problem,
} from '@/lib/boarding/offline/outbox';
import { syncOutbox } from '@/lib/boarding/offline/sync';
import { syncMessages } from '@/lib/boarding/offline/messages';
import { postMarks, postScan } from '@/lib/boarding/offline/transport';
import { SYNC_INTERVAL_MS } from '@/lib/boarding/offline/protocol';

export interface QueueScanInput {
  learnerId: string | null;
  token: string;
  walkUp: boolean;
  name: string | null;
  verified: boolean;
  /** The trip open when the scan happened, from activeDirection(windows). */
  direction: AttDirection;
}

/**
 * The attendance screen's link to the outbox. Every roster tap goes through
 * markOffline -- online or not -- so the offline path is the path exercised
 * every ordinary morning, not only when signal drops.
 */
export function useOfflineAttendance(userId: string | null, onSynced: () => void) {
  const [entries, setEntries] = useState<OutboxEntry[]>([]);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [online, setOnline] = useState(true);
  const [reachable, setReachable] = useState(true);
  const [authRequired, setAuthRequired] = useState(false);
  const onSyncedRef = useRef(onSynced);
  onSyncedRef.current = onSynced;

  const refresh = useCallback(async () => {
    if (!userId) {
      setEntries([]);
      setProblems([]);
      setAuthRequired(false);
      setReachable(true);
      return;
    }
    const kv = offlineKv();
    const [e, p] = await Promise.all([listOutbox(kv, userId), listProblems(kv, userId)]);
    setEntries(e);
    setProblems(p);
  }, [userId]);

  const syncNow = useCallback(async () => {
    if (!userId || typeof navigator === 'undefined' || !navigator.onLine) return;
    try {
      const report = await syncOutbox({ kv: offlineKv(), userId, now: () => new Date(), postMarks, postScan });
      if (report.attempted > 0) setReachable(!report.networkDown);
      setAuthRequired(report.authRequired);
      for (const m of syncMessages(report.outcomes)) {
        if (m.kind === 'success') toast.success(m.text);
        else toast(m.text, { icon: '⚠️' });
      }
      if (report.outcomes.length > 0) onSyncedRef.current();
    } catch (e) {
      console.error('boarding outbox sync failed:', e);
    }
    await refresh();
  }, [userId, refresh]);

  useEffect(() => {
    setOnline(navigator.onLine);
    void refresh();
    void syncNow();
    const goOnline = () => { setOnline(true); void syncNow(); };
    const goOffline = () => setOnline(false);
    const onVisible = () => { if (document.visibilityState === 'visible') void syncNow(); };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(() => void syncNow(), SYNC_INTERVAL_MS);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, [refresh, syncNow]);

  const markOffline = useCallback(async (row: RosterRow, status: 'present' | 'absent', direction: AttDirection) => {
    if (!userId) return;
    try {
      await enqueueMark(offlineKv(), {
        userId, learnerId: row.learner_id, routeId: row.route_id, status, name: row.name, direction,
      }, new Date());
    } catch (e) {
      console.error('boarding outbox write failed:', e);
      toast.error('Could not save the mark on this phone. Try again.');
      return;
    }
    await refresh();
    void syncNow();
  }, [userId, refresh, syncNow]);

  const queueScan = useCallback(async (input: QueueScanInput) => {
    if (!userId) return;
    await enqueueScan(offlineKv(), { userId, ...input }, new Date());
    await refresh();
    void syncNow();
  }, [userId, refresh, syncNow]);

  const dismiss = useCallback(async (clientId: string) => {
    if (!userId) return;
    await dismissProblem(offlineKv(), userId, clientId);
    await refresh();
  }, [userId, refresh]);

  return { entries, problems, online: online && reachable, authRequired, markOffline, queueScan, dismiss, syncNow };
}

export type OfflineAttendance = ReturnType<typeof useOfflineAttendance>;
