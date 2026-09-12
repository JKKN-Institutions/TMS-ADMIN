/**
 * Drain the outbox: send what is due, settle every answer.
 *
 * Roster taps go in batches of SYNC_BATCH_SIZE per (route, trip date, trip); scans
 * go one by one to the scan endpoint. The outbox holds at most one entry per
 * learner and day, so order inside a batch never matters.
 *
 * The one rule that must not break: an entry leaves the outbox ONLY with a
 * verdict (saved, or moved to "Not saved"). No network, a 5xx, or a batch
 * answer that omits it all DEFER it with backoff. 401 stops everything and
 * touches nothing -- the marks wait for the same user to sign back in.
 */
import type { Kv } from './kv';
import type { AttDirection } from '@/lib/boarding/attendance-window';
import {
  addProblem, deferIfSame, listOutbox, removeIfSame,
  type MarkEntry, type OutboxEntry, type ScanEntry,
} from './outbox';
import {
  REJECT_REASON_TEXT, SYNC_BATCH_SIZE, isSavedOutcome,
  type MarkRejectReason, type MarkResult,
} from './protocol';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untrusted JSON, narrowed field by field below
export interface PostResult { status: number; json: any }

export interface MarksBody {
  routeId: string;
  direction: AttDirection;
  marks: Array<{ learnerId: string; status: 'present' | 'absent'; tappedAt: string; clientId: string }>;
}

export interface ScanBody {
  token: string;
  source: 'camera';
  walkUp: boolean;
  direction: AttDirection;
  tappedAt: string;
  clientId: string;
}

export interface SyncDeps {
  kv: Kv;
  userId: string;
  now: () => Date;
  /** Must THROW when the request gets no response (no network). */
  postMarks: (body: MarksBody) => Promise<PostResult>;
  /** Must THROW when the request gets no response (no network). */
  postScan: (body: ScanBody) => Promise<PostResult>;
}

export interface SyncOutcome { entry: OutboxEntry; result: MarkResult }

export interface SyncReport {
  outcomes: SyncOutcome[];
  /** Requests actually made. 0 means nothing was due. */
  attempted: number;
  deferred: number;
  networkDown: boolean;
  authRequired: boolean;
}

async function deferAll(d: SyncDeps, entries: OutboxEntry[], report: SyncReport): Promise<void> {
  for (const e of entries) await deferIfSame(d.kv, e, d.now());
  report.deferred += entries.length;
}

async function settle(d: SyncDeps, e: OutboxEntry, r: MarkResult, report: SyncReport): Promise<void> {
  if (r.outcome === 'locked') {
    await addProblem(d.kv, {
      clientId: e.clientId,
      userId: e.userId,
      learnerId: e.learnerId,
      name: e.name,
      reason: 'locked',
      message: `Already marked by ${r.markedByName}`,
      tappedAt: e.tappedAt,
      recordedAt: d.now().toISOString(),
    });
  } else if (r.outcome === 'rejected') {
    await addProblem(d.kv, {
      clientId: e.clientId,
      userId: e.userId,
      learnerId: e.learnerId,
      name: e.name,
      reason: r.reason,
      message: r.message ?? REJECT_REASON_TEXT[r.reason],
      tappedAt: e.tappedAt,
      recordedAt: d.now().toISOString(),
    });
  } else if (!isSavedOutcome(r.outcome)) {
    // An outcome we don't recognise (a future server value, or a malformed
    // element with no outcome at all). Never delete silently -- surface it.
    await addProblem(d.kv, {
      clientId: e.clientId,
      userId: e.userId,
      learnerId: e.learnerId,
      name: e.name,
      reason: 'invalid',
      message: REJECT_REASON_TEXT.invalid,
      tappedAt: e.tappedAt,
      recordedAt: d.now().toISOString(),
    });
  }
  await removeIfSame(d.kv, e);
  report.outcomes.push({ entry: e, result: r });
}

const reject = (e: OutboxEntry, reason: MarkRejectReason, message?: string): MarkResult =>
  ({ clientId: e.clientId, outcome: 'rejected', reason, ...(message ? { message } : {}) });

async function settleMarkBatch(d: SyncDeps, batch: MarkEntry[], res: PostResult, report: SyncReport): Promise<void> {
  if (Array.isArray(res.json?.results)) {
    const results: MarkResult[] = res.json.results;
    const byId = new Map(results.map((r) => [r.clientId, r]));
    for (const e of batch) {
      const r = byId.get(e.clientId);
      if (r) await settle(d, e, r, report);
      else await deferAll(d, [e], report);
    }
    return;
  }
  if (res.status >= 500) return deferAll(d, batch, report);

  if (res.status === 403 && res.json?.reason === 'not_your_share') {
    const taken = new Set(
      ((res.json.learners ?? []) as Array<{ learner_id: string }>).map((l) => l.learner_id),
    );
    for (const e of batch) {
      if (taken.has(e.learnerId)) await settle(d, e, reject(e, 'not_your_share'), report);
    }
    // The rest were not written. They go again next cycle, without these --
    // deferred explicitly so `attempts` advances even when the server names
    // no one (an empty `learners` list must not retry every 15s forever).
    await deferAll(d, batch.filter((e) => !taken.has(e.learnerId)), report);
    return;
  }

  const message = typeof res.json?.error === 'string' ? res.json.error : undefined;
  const reason: MarkRejectReason =
    res.status === 403 ? 'not_assigned'
    : res.status === 409 && res.json?.reason === 'window_closed' ? 'outside_window'
    : res.status === 400 && message === 'No valid learners for this route' ? 'not_on_route'
    : 'invalid';
  for (const e of batch) await settle(d, e, reject(e, reason, message), report);
}

async function settleScan(d: SyncDeps, scan: ScanEntry, res: PostResult, report: SyncReport): Promise<void> {
  const j = res.json ?? {};
  if (j.ok) {
    return settle(d, scan, {
      clientId: scan.clientId,
      outcome: j.alreadyMarked ? 'noop_same_status' : 'inserted',
      walkUp: !!j.walkUp,
    }, report);
  }
  if (res.status >= 500) return deferAll(d, [scan], report);
  const reason: MarkRejectReason =
    j.reason === 'not_booked' ? 'not_booked'
    : j.reason === 'window_closed' ? 'outside_window'
    : j.reason === 'stale' || j.reason === 'future' || j.reason === 'invalid'
      || j.reason === 'wrong_trip' || j.reason === 'evening_off' ? j.reason
    : res.status === 403 ? 'not_assigned'
    : 'scan_refused';
  return settle(d, scan, reject(scan, reason, typeof j.error === 'string' ? j.error : undefined), report);
}

export async function syncOnce(d: SyncDeps): Promise<SyncReport> {
  const report: SyncReport = { outcomes: [], attempted: 0, deferred: 0, networkDown: false, authRequired: false };
  const nowMs = d.now().getTime();
  const due = (await listOutbox(d.kv, d.userId)).filter((e) => e.nextAttemptAt <= nowMs);

  const groups = new Map<string, MarkEntry[]>();
  for (const e of due) {
    if (e.kind !== 'mark') continue;
    const k = `${e.routeId}|${e.tripDate}|${e.direction}`;
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  const batches: MarkEntry[][] = [];
  for (const g of groups.values()) {
    for (let i = 0; i < g.length; i += SYNC_BATCH_SIZE) batches.push(g.slice(i, i + SYNC_BATCH_SIZE));
  }

  for (const batch of batches) {
    let res: PostResult;
    report.attempted++;
    try {
      res = await d.postMarks({
        routeId: batch[0].routeId,
        direction: batch[0].direction,
        marks: batch.map((m) => ({ learnerId: m.learnerId, status: m.status, tappedAt: m.tappedAt, clientId: m.clientId })),
      });
    } catch {
      await deferAll(d, batch, report);
      report.networkDown = true;
      return report;
    }
    if (res.status === 401) {
      report.authRequired = true;
      return report;
    }
    await settleMarkBatch(d, batch, res, report);
  }

  for (const scan of due.filter((e): e is ScanEntry => e.kind === 'scan')) {
    let res: PostResult;
    report.attempted++;
    try {
      res = await d.postScan({
        token: scan.token, source: 'camera', walkUp: scan.walkUp, direction: scan.direction,
        tappedAt: scan.tappedAt, clientId: scan.clientId,
      });
    } catch {
      await deferAll(d, [scan], report);
      report.networkDown = true;
      return report;
    }
    if (res.status === 401) {
      report.authRequired = true;
      return report;
    }
    await settleScan(d, scan, res, report);
  }

  return report;
}

let inFlight: Promise<SyncReport> | null = null;

/** syncOnce, but a second caller while one runs gets the same run. */
export function syncOutbox(d: SyncDeps): Promise<SyncReport> {
  if (!inFlight) inFlight = syncOnce(d).finally(() => { inFlight = null; });
  return inFlight;
}
