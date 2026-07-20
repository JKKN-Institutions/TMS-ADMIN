import type { SupabaseClient } from '@supabase/supabase-js';

// Supabase's API gateway rejects oversized requests. PostgREST serializes
// `.in('col', ids)` into the request URL, and a few hundred UUIDs (measured on
// this project: ~500 ids → 200 OK, ~768 → HTTP 400 "Bad Request") overflow the
// gateway's request-size limit. supabase-js surfaces that as { data: null, error };
// left UNCHECKED it silently yields an empty result and therefore WRONG output
// (blank names, missed conflicts) rather than a crash.
//
// So: batch ids into small chunks AND throw on error (fail loud). This mirrors the
// private helper in lib/fees/bills.ts, lifted here so any route with a large id
// list can reuse it instead of re-introducing the silent-400 bug.
export const IN_CHUNK = 150;

export async function selectByIds<T = Record<string, unknown>>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  ids: string[],
  idColumn = 'id'
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .in(idColumn, ids.slice(i, i + IN_CHUNK));
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
  }
  return out;
}
