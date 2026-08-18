import { NextResponse } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { loadRemovalNotices } from '@/lib/boarding/incharge-removal-notice';

/**
 * The removal-bill notice for the SIGNED-IN staffer, or null.
 *
 * This exists because removal locks a staffer out of the boarding portal: with
 * zero assignments the layout routes every /boarding path to the willingness
 * toggle, a screen with no notification bell. That page is the only surface
 * that still reaches them, so it has to carry the explanation.
 *
 * Self-scoped by construction — the caller cannot name a person. The notice is
 * matched to auth.userId inside the loader, so no request can read anyone
 * else's bill amount or boarding stop.
 */
export const dynamic = 'force-dynamic';

async function getNotice(auth: AuthContext) {
  try {
    // Service role: the staffer has just lost the role that granted them read
    // access to their own assignment and strike rows.
    const svc = createServiceRoleClient();
    const notices = await loadRemovalNotices(svc, { profileId: auth.userId });
    const notice = notices[0] ?? null;

    return NextResponse.json({
      success: true,
      data: notice
        ? { title: notice.title, body: notice.body, notice: notice.notice }
        : null,
    });
  } catch {
    // A failure here must not break the willingness toggle underneath it.
    return NextResponse.json({ success: true, data: null });
  }
}

export const GET = withAuth((_request, auth) => getNotice(auth));
