// Learner id -> auth profile id. learners_profiles.profile_id alone misses
// learners whose portal account is linked only by college/student email
// (206 of ~450 owing learners on 2026-09-21), so resolution goes through the
// tms_learner_profile_ids RPC, which tries profile_id and then both emails.

import type { SupabaseClient } from '@supabase/supabase-js';

const CHUNK = 150;

export async function resolveLearnerProfileIds(
  svc: SupabaseClient,
  learnerIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = [...new Set(learnerIds.filter(Boolean))];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await svc.rpc('tms_learner_profile_ids', {
      p_learner_ids: ids.slice(i, i + CHUNK),
    });
    if (error) throw new Error(`Failed to resolve learner recipients: ${(error as { message: string }).message}`);
    for (const r of (data ?? []) as Array<{ learner_id: string; profile_id: string | null }>) {
      if (r.profile_id) out.set(r.learner_id, r.profile_id);
    }
  }
  return out;
}
