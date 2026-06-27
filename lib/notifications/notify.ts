import { createServiceRoleClient } from '@/lib/supabase/server';

type Svc = ReturnType<typeof createServiceRoleClient>;

/**
 * Create an in-app notification targeted at a single auth profile. Best-effort —
 * never throws into the caller. Targeting uses profiles.id (the id the in-app
 * Notifications inbox filters on), so this works for any user: learner, driver,
 * boarding staff or admin.
 */
export async function notifyProfile(
  svc: Svc,
  opts: { profileId: string; actorId: string; title: string; body: string; category?: string; url?: string }
): Promise<void> {
  try {
    await svc.from('notifications').insert({
      title: opts.title,
      body: opts.body,
      created_by: opts.actorId,
      category: opts.category ?? 'transport',
      url: opts.url ?? null,
      targeting: { type: 'user', user_id: opts.profileId },
    });
  } catch (e) {
    console.error('notifyProfile (non-fatal):', e);
  }
}

/**
 * Create an in-app notification targeted at a learner (by learner_id). Resolves the
 * learner's auth profile_id, then delegates to notifyProfile. No-op if the learner
 * has no auth identity yet.
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
    await notifyProfile(svc, {
      profileId,
      actorId: opts.actorId,
      title: opts.title,
      body: opts.body,
      category: opts.category,
      url: opts.url,
    });
  } catch (e) {
    console.error('notifyLearner (non-fatal):', e);
  }
}
