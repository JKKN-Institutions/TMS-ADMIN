import { createServiceRoleClient } from '@/lib/supabase/server';
import { dispatchNotification } from '@/lib/notifications/dispatch';

type Svc = ReturnType<typeof createServiceRoleClient>;

/**
 * Thin best-effort wrappers over the TMS notification dispatch primitive, kept at
 * their original signatures so existing automated writers (enrollment-requests,
 * transport-grievances, bookings/send-reminders) need no change. They now target
 * the TMS-owned tms_notification plane instead of MyJKKN's shared `notifications`
 * table. Never throw into the caller.
 */

/**
 * Create an in-app notification targeted at a single auth profile. Works for any
 * user (learner, driver, boarding staff or admin) — targeting is by profiles.id,
 * the id the in-app inbox filters on.
 */
export async function notifyProfile(
  svc: Svc,
  opts: { profileId: string; actorId: string; title: string; body: string; category?: string; url?: string },
): Promise<void> {
  try {
    await dispatchNotification(svc, {
      title: opts.title,
      body: opts.body,
      category: opts.category ?? 'general',
      url: opts.url ?? null,
      createdBy: opts.actorId,
      targeting: { type: 'users', user_ids: [opts.profileId] },
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
  opts: { learnerId: string; actorId: string; title: string; body: string; category?: string; url?: string },
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
