// lib/fees/select-by-ids.ts
// Chunked, fail-loud `.in()` lookup. Lives in its own module because both the
// bill composer (bills.ts) and the receipt layer (receipts.ts) need it, and
// having receipts.ts import it from bills.ts would make the two files circular.

import type { SupabaseClient } from '@supabase/supabase-js';

// PostgREST serializes `.in('col', ids)` into the request URL. A few hundred
// UUIDs overflow the Supabase API gateway's request-size limit (measured on this
// project: 500 ids → 200 OK, 768 ids → HTTP 400 "Bad Request"), which supabase-js
// surfaces as { data: null, error }. Left UNCHECKED that yields an empty map and
// silently mislabels every bill 'unknown'. So: batch ids into small chunks AND
// throw on error (fail loud) instead of returning a quietly-wrong result.
const IN_CHUNK = 150;

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
