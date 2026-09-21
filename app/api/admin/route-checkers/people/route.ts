import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { requirePerm } from '@/lib/inspections/server';
import { emailIlikePattern } from '@/lib/identity/email-match';
import { authLoginFor, mapLimit, normEmail, staffName } from '@/lib/route-check/admin';

const LIMIT = 20;

type StaffRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  designation: string | null;
  email: string | null;
  institution_email: string | null;
  staff_id: string | null;
  profile_id: string | null;
};
type ProfileRow = { id: string; email: string | null; full_name: string | null; designation: string | null };

type PersonHit = {
  source: 'staff' | 'profile';
  name: string;
  designation: string | null;
  /** College (institution) email when known. */
  collegeEmail: string | null;
  /** Preferred display/contact email: college email when present. */
  email: string | null;
  staffId: string | null;
  profileId: string | null;
  /** A confirmed login account exists. */
  hasLogin: boolean;
  /** The email they log in with (what an assignment will store), when known. */
  loginEmail: string | null;
};

/**
 * The query goes inside a PostgREST `or=(...)` filter, so strip the
 * characters that filter syntax reserves (`,` `(` `)` `"` `\`) and `*` (a
 * like-wildcard alias), then escape `%` / `_` so they match literally.
 */
function toPattern(q: string): string {
  const cleaned = q.replace(/[,()"\\*]/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned ? `%${emailIlikePattern(cleaned)}%` : '';
}

async function search(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.ROUTE_CHECK_MANAGE))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const q = (new URL(request.url).searchParams.get('q') ?? '').trim();
    const pat = toPattern(q);
    if (q.length < 3 || pat.replace(/[%\\]/g, '').length < 3) {
      return NextResponse.json({ error: 'Type at least 3 characters' }, { status: 400 });
    }

    const svc = createServiceRoleClient();
    const [staffQ, profQ] = await Promise.all([
      svc
        .from('staff')
        .select('id, first_name, last_name, designation, email, institution_email, staff_id, profile_id')
        .eq('is_active', true)
        .or(
          ['first_name', 'last_name', 'email', 'institution_email', 'staff_id'].map((c) => `${c}.ilike.${pat}`).join(',')
        )
        .order('first_name')
        .limit(LIMIT),
      svc
        .from('profiles')
        .select('id, email, full_name, designation')
        .or(`email.ilike.${pat},full_name.ilike.${pat}`)
        .order('full_name')
        .limit(LIMIT),
    ]);
    if (staffQ.error) {
      console.error('route-checkers people staff error:', staffQ.error);
      return NextResponse.json({ error: 'Failed to search staff' }, { status: 500 });
    }
    if (profQ.error) {
      console.error('route-checkers people profiles error:', profQ.error);
      return NextResponse.json({ error: 'Failed to search profiles' }, { status: 500 });
    }
    const staff = (staffQ.data ?? []) as StaffRow[];
    const profiles = (profQ.data ?? []) as ProfileRow[];

    // Link unlinked staff to a profile found in this same search by email.
    const profileByEmail = new Map<string, ProfileRow>();
    for (const p of profiles) if (p.email) profileByEmail.set(normEmail(p.email), p);

    const hits: PersonHit[] = [];
    const seenEmails = new Set<string>();
    const seenProfiles = new Set<string>();
    for (const s of staff) {
      const college = normEmail(s.institution_email) || null;
      const personal = normEmail(s.email) || null;
      const key = college ?? personal ?? `staff:${s.id}`;
      if (seenEmails.has(key)) continue;
      const linked =
        s.profile_id ??
        (college && profileByEmail.get(college)?.id) ??
        (personal && profileByEmail.get(personal)?.id) ??
        null;
      seenEmails.add(key);
      if (college) seenEmails.add(college);
      if (personal) seenEmails.add(personal);
      if (linked) seenProfiles.add(linked);
      hits.push({
        source: 'staff',
        name: staffName(s) || college || personal || '—',
        designation: s.designation,
        collegeEmail: college,
        email: college ?? personal,
        staffId: s.id,
        profileId: linked,
        hasLogin: false,
        loginEmail: null,
      });
    }
    for (const p of profiles) {
      const e = normEmail(p.email) || null;
      if (seenProfiles.has(p.id) || (e && seenEmails.has(e))) continue;
      seenProfiles.add(p.id);
      if (e) seenEmails.add(e);
      hits.push({
        source: 'profile',
        name: p.full_name?.trim() || e || '—',
        designation: p.designation,
        collegeEmail: null,
        email: e,
        staffId: null,
        profileId: p.id,
        hasLogin: false,
        loginEmail: null,
      });
    }
    const out = hits.slice(0, LIMIT);

    // Which of them can actually log in, and with which address.
    await mapLimit(out, 5, async (h) => {
      if (!h.profileId) return;
      const login = await authLoginFor(svc, h.profileId);
      if (login?.confirmed) {
        h.hasLogin = true;
        h.loginEmail = login.email;
      }
    });

    return NextResponse.json({ success: true, data: out, count: out.length });
  } catch (e) {
    console.error('route-checkers people error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => search(request, auth));
