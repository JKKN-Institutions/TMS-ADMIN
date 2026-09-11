/**
 * What the boarding portal keeps on the phone so it can open with no signal:
 * today's roster (per day), the attendance window settings, and today's
 * access verdict. All keyed by user, so a shared phone never shows one
 * staffer another's list.
 */
import type { Kv } from './kv';

export interface Saved<T> {
  savedAt: string;
  value: T;
}

const rosterKey = (userId: string, date: string) => `snap:${userId}:${date}`;
const windowsKey = (userId: string) => `windows:${userId}`;
const accessKey = (userId: string, date: string) => `access:${userId}:${date}`;

export async function saveRoster<T>(kv: Kv, userId: string, date: string, roster: T, now: Date): Promise<void> {
  await kv.set<Saved<T>>(rosterKey(userId, date), { savedAt: now.toISOString(), value: roster });
}

export async function loadRoster<T>(kv: Kv, userId: string, date: string): Promise<Saved<T> | null> {
  return (await kv.get<Saved<T>>(rosterKey(userId, date))) ?? null;
}

export async function saveWindows<T>(kv: Kv, userId: string, windows: T, now: Date): Promise<void> {
  await kv.set<Saved<T>>(windowsKey(userId), { savedAt: now.toISOString(), value: windows });
}

export async function loadWindows<T>(kv: Kv, userId: string): Promise<Saved<T> | null> {
  return (await kv.get<Saved<T>>(windowsKey(userId))) ?? null;
}

export async function saveAccess(kv: Kv, userId: string, date: string, gate: string, now: Date): Promise<void> {
  await kv.set<Saved<string>>(accessKey(userId, date), { savedAt: now.toISOString(), value: gate });
}

export async function loadAccess(kv: Kv, userId: string, date: string): Promise<string | null> {
  return (await kv.get<Saved<string>>(accessKey(userId, date)))?.value ?? null;
}

/** Drop this user's saved rosters and access verdicts from before `today`. */
export async function pruneSnapshots(kv: Kv, userId: string, today: string): Promise<void> {
  for (const prefix of [`snap:${userId}:`, `access:${userId}:`]) {
    for (const { key } of await kv.list(prefix)) {
      if (key.slice(prefix.length) < today) await kv.del(key);
    }
  }
}
