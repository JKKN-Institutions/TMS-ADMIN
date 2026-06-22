import type { AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { LEARNER_SELECT, type LearnerRow } from '@/lib/passengers/types';

/**
 * Resolve the learners_profiles row for the authenticated user.
 *
 * Identity is ALWAYS derived from the session (auth.userId) — a caller can never
 * pass a learner id, which closes the IDOR class the source passenger app had.
 *
 * Resolution order (most authoritative first):
 *   1. profiles.learner_id → learners_profiles.id   (verified 1:1 FK — canonical)
 *   2. learners_profiles.profile_id = auth.userId    (reverse FK we backfilled)
 *   3. institutional email match                     (last resort; the transport
 *      cohort barely carries email, so this rarely fires)
 */
export async function getLearnerRowForUser(auth: AuthContext): Promise<LearnerRow | null> {
  const svc = createServiceRoleClient();

  const { data: prof } = await auth.supabase
    .from('profiles')
    .select('learner_id, email')
    .eq('id', auth.userId)
    .single();

  if (prof?.learner_id) {
    const byLearnerId = await svc
      .from('learners_profiles')
      .select(LEARNER_SELECT)
      .eq('id', prof.learner_id)
      .maybeSingle();
    if (byLearnerId.data) return byLearnerId.data as unknown as LearnerRow;
  }

  const byFk = await svc
    .from('learners_profiles')
    .select(LEARNER_SELECT)
    .eq('profile_id', auth.userId)
    .maybeSingle();
  if (byFk.data) return byFk.data as unknown as LearnerRow;

  if (!prof?.email) return null;
  const email = String(prof.email).toLowerCase();
  const byEmail = await svc
    .from('learners_profiles')
    .select(LEARNER_SELECT)
    .or(`college_email.eq.${email},student_email.eq.${email}`)
    .maybeSingle();
  return (byEmail.data as unknown as LearnerRow) ?? null;
}
