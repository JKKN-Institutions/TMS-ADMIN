import { createServiceRoleClient } from '@/lib/supabase/server';
import { dispatchNotification } from '@/lib/notifications/dispatch';
import { resolveLearnerProfileIds } from '@/lib/notifications/learner-recipients';

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
): Promise<boolean> {
  try {
    await dispatchNotification(svc, {
      title: opts.title,
      body: opts.body,
      category: opts.category ?? 'general',
      url: opts.url ?? null,
      // '' (a system actor) is not a uuid; tms_notification.created_by would
      // reject it and the notification would be silently dropped.
      createdBy: opts.actorId || null,
      targeting: { type: 'users', user_ids: [opts.profileId] },
    });
    return true;
  } catch (e) {
    console.error('notifyProfile (non-fatal):', e);
    return false;
  }
}

/**
 * Create an in-app notification targeted at a learner (by learner_id). Resolves the
 * learner's auth profile by profile_id, then college/student email, then delegates
 * to notifyProfile. No-op if the learner has no auth identity yet.
 */
export async function notifyLearner(
  svc: Svc,
  opts: { learnerId: string; actorId: string; title: string; body: string; category?: string; url?: string },
): Promise<void> {
  try {
    const profileId = (await resolveLearnerProfileIds(svc as never, [opts.learnerId])).get(opts.learnerId);
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
