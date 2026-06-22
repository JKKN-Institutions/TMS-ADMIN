import { createServiceRoleClient } from '@/lib/supabase/server';

type Svc = ReturnType<typeof createServiceRoleClient>;

/**
 * Create an in-app notification targeted at a learner (by learner_id). Resolves
 * the learner's auth profile_id (targeting uses profiles.id, which the learner
 * Notifications inbox filters on). Best-effort — never throws into the caller; if
 * the learner has no auth identity yet, it's a no-op.
 */
export async function notifyLearner(
  svc: Svc,
  opts: { learnerId: string; actorId: string; title: string; body: string; category?: string; url?: string }
): Promise<void> {
  try {
    const { data: lp } = await svc
      .from('learners_profiles')
      .select('profile_id')
      .eq('id', opts.learnerId)
      .maybeSingle();
    const profileId = (lp as { profile_id: string | null } | null)?.profile_id;
    if (!profileId) return;

    await svc.from('notifications').insert({
      title: opts.title,
      body: opts.body,
      created_by: opts.actorId,
      category: opts.category ?? 'transport',
      url: opts.url ?? null,
      targeting: { type: 'user', user_id: profileId },
    });
  } catch (e) {
    console.error('notifyLearner (non-fatal):', e);
  }
}
