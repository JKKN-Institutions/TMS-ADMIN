/**
 * Marks waiting on the phone to be sent, and the marks the server refused.
 *
 * ONE slot per (user, trip date, trip, learner): tapping Present then Absent
 * on the same student for the same trip while offline leaves one entry, the
 * latest. The morning and evening marks of one student are separate slots,
 * because they are separate records on the server. That keeps the outbox
 * small, and it means a batch (always one trip) never carries two marks for one
 * learner, so send order inside a batch cannot matter. A scan that resolved to
 * nobody on the saved roster gets its own slot until the server identifies it.
 *
 * Settling uses removeIfSame / deferIfSame: the slot may have been refilled by
 * a NEWER tap while the old one was in flight, and that newer tap must survive.
 */
import type { Kv } from './kv';
import type { AttDirection } from '@/lib/boarding/attendance-window';
import { istToday } from '@/lib/booking/window';
import { SYNC_BACKOFF_MS, type MarkRejectReason } from './protocol';

interface EntryBase {
  clientId: string;
  userId: string;
  tappedAt: string;
  tripDate: string;
  /** The trip this tap was for, decided by the caller at tap time. */
  direction: AttDirection;
  attempts: number;
  nextAttemptAt: number;
  name: string | null;
}

export interface MarkEntry extends EntryBase {
  kind: 'mark';
  learnerId: string;
  routeId: string;
  status: 'present' | 'absent';
}

export interface ScanEntry extends EntryBase {
  kind: 'scan';
  /** Null when the phone could not match the scan to anyone on the saved roster. */
  learnerId: string | null;
  token: string;
  walkUp: boolean;
  /** True when resolved by the saved card map; false when the scan matched nobody on the saved roster and still needs the server to resolve it. */
  verified: boolean;
}

export type OutboxEntry = MarkEntry | ScanEntry;

export interface Problem {
  clientId: string;
  userId: string;
  learnerId: string | null;
  name: string | null;
  reason: MarkRejectReason | 'locked';
  message: string;
  tappedAt: string;
  recordedAt: string;
}

const defaultId = () => globalThis.crypto.randomUUID();

export function outboxKey(e: Pick<OutboxEntry, 'userId' | 'tripDate' | 'direction' | 'learnerId' | 'clientId'>): string {
  return `outbox:${e.userId}:${e.tripDate}:${e.direction}:${e.learnerId ?? `raw-${e.clientId}`}`;
}

const problemKey = (userId: string, clientId: string) => `problem:${userId}:${clientId}`;

export async function enqueueMark(
  kv: Kv,
  input: {
    userId: string; learnerId: string; routeId: string; status: 'present' | 'absent';
    name: string | null; direction: AttDirection;
  },
  now: Date,
  makeId: () => string = defaultId,
): Promise<MarkEntry> {
  const entry: MarkEntry = {
    kind: 'mark', clientId: makeId(), userId: input.userId, learnerId: input.learnerId,
    routeId: input.routeId, status: input.status, name: input.name, direction: input.direction,
    tappedAt: now.toISOString(), tripDate: istToday(now), attempts: 0, nextAttemptAt: 0,
  };
  await kv.set(outboxKey(entry), entry);
  return entry;
}

export async function enqueueScan(
  kv: Kv,
  input: {
    userId: string; learnerId: string | null; token: string; walkUp: boolean;
    name: string | null; verified: boolean; direction: AttDirection;
  },
  now: Date,
  makeId: () => string = defaultId,
): Promise<ScanEntry> {
  const entry: ScanEntry = {
    kind: 'scan', clientId: makeId(), userId: input.userId, learnerId: input.learnerId,
    token: input.token, walkUp: input.walkUp, name: input.name, verified: input.verified,
    direction: input.direction,
    tappedAt: now.toISOString(), tripDate: istToday(now), attempts: 0, nextAttemptAt: 0,
  };
  await kv.set(outboxKey(entry), entry);
  return entry;
}

export async function listOutbox(kv: Kv, userId: string): Promise<OutboxEntry[]> {
  const rows = await kv.list<OutboxEntry>(`outbox:${userId}:`);
  return rows
    .map((r) => r.value)
    .sort((a, b) => a.tappedAt.localeCompare(b.tappedAt) || a.clientId.localeCompare(b.clientId));
}

export async function countPending(kv: Kv, userId: string): Promise<number> {
  return (await kv.list(`outbox:${userId}:`)).length;
}

export async function removeIfSame(kv: Kv, entry: OutboxEntry): Promise<void> {
  const key = outboxKey(entry);
  const current = await kv.get<OutboxEntry>(key);
  if (current?.clientId === entry.clientId) await kv.del(key);
}

export async function deferIfSame(kv: Kv, entry: OutboxEntry, now: Date): Promise<void> {
  const key = outboxKey(entry);
  const current = await kv.get<OutboxEntry>(key);
  if (!current || current.clientId !== entry.clientId) return;
  const wait = SYNC_BACKOFF_MS[Math.min(current.attempts, SYNC_BACKOFF_MS.length - 1)];
  await kv.set<OutboxEntry>(key, { ...current, attempts: current.attempts + 1, nextAttemptAt: now.getTime() + wait });
}

export async function addProblem(kv: Kv, p: Problem): Promise<void> {
  await kv.set(problemKey(p.userId, p.clientId), p);
}

export async function listProblems(kv: Kv, userId: string): Promise<Problem[]> {
  const rows = await kv.list<Problem>(`problem:${userId}:`);
  return rows.map((r) => r.value).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
}

export async function dismissProblem(kv: Kv, userId: string, clientId: string): Promise<void> {
  await kv.del(problemKey(userId, clientId));
}
