/**
 * Pure list rules for Tracking Mobiles handover photos.
 *
 * No I/O: the API and the form both feed arrays through here so the cap,
 * de-duplication and removal diff behave identically on client and server.
 *
 * `removedPaths` is the function that decides which storage objects get
 * DELETED, so it is deliberately tiny and directly tested.
 */

/** A phone record may carry at most this many photos. */
export const MAX_DRIVER_MOBILE_IMAGES = 5;

/**
 * Coerce untrusted input into a clean, ordered, de-duplicated path list.
 * Deliberately does NOT truncate at the cap — the API must reject an
 * over-long list with a 400 rather than silently discarding a file the
 * user believes they uploaded.
 */
export function normalizeImagePaths(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;
    if (out.includes(trimmed)) continue;
    out.push(trimmed);
  }
  return out;
}

export function exceedsImageCap(paths: string[]): boolean {
  return paths.length > MAX_DRIVER_MOBILE_IMAGES;
}

/**
 * Paths present before a save but absent after it — the storage objects that
 * are now unreferenced and safe to delete. Order-insensitive: re-arranging
 * the same paths removes nothing.
 */
export function removedPaths(before: string[], after: string[]): string[] {
  const keep = new Set(after);
  return before.filter((p) => p && !keep.has(p));
}
