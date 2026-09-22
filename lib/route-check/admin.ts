/**
 * Server helpers for the Route Checkers admin APIs (assignment + history).
 *
 * Login-email resolution (controller ruling R5): checker access is granted by
 * tms_route_checker_route_ids, which matches assignments ONLY against the
 * checker's confirmed auth.users.email. So an assignment must store the email
 * the person will actually LOG IN WITH — resolved here, server-side, from the
 * picked staff/profile — never a client-supplied address taken on trust.
 */
import type { createServiceRoleClient } from '@/lib/supabase/server';
import { emailIlikePattern } from '@/lib/identity/email-match';

type Svc = ReturnType<typeof createServiceRoleClient>;

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Stay well under the PostgREST gateway limit for large .in() filters. */
export const IN_CHUNK = 150;

export const normEmail = (e: string | null | undefined) => (e ?? '').trim().toLowerCase();

export function chunk<T>(arr: T[], size = IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Run `fn` over items with bounded concurrency (keeps auth-admin / per-email lookups polite). */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

/** `.in()` over any number of ids, chunked; throws on any read error. */
export async function selectIn<T>(svc: Svc, table: string, cols: string, column: string, ids: string[]): Promise<T[]> {
  const uniq = [...new Set(ids.filter(Boolean))];
  const out: T[] = [];
  for (const part of chunk(uniq)) {
    const { data, error } = await svc.from(table).select(cols).in(column, part);
    if (error) throw new Error(`${table} read failed: ${error.message}`);
    out.push(...((data ?? []) as T[]));
  }
  return out;
}

export const staffName = (s: { first_name: string | null; last_name: string | null }) =>
  `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim();

// ── Auth login lookup ────────────────────────────────────────────────────────

export type AuthLogin = { email: string; confirmed: boolean };

/**
 * The auth account for a profile id (profiles.id == auth.users.id), or null
 * when there is none. Throws on unexpected admin-API errors (fail closed).
 */
export async function authLoginFor(svc: Svc, profileId: string): Promise<AuthLogin | null> {
  const { data, error } = await svc.auth.admin.getUserById(profileId);
  if (error) {
    const status = (error as { status?: number }).status;
    if (status === 404 || /not.?found/i.test(error.message)) return null;
    throw new Error(`auth lookup failed: ${error.message}`);
  }
  const email = normEmail(data.user?.email);
  if (!email) return null;
  return { email, confirmed: !!data.user?.email_confirmed_at };
}

// ── People by email (exact, case-insensitive, wildcard-safe) ─────────────────

type StaffRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  designation: string | null;
  staff_id: string | null;
  email: string | null;
  institution_email: string | null;
  profile_id: string | null;
  is_active: boolean | null;
};
type ProfileRow = { id: string; email: string | null; full_name: string | null; designation: string | null };

const STAFF_COLS = 'id, first_name, last_name, designation, staff_id, email, institution_email, profile_id, is_active';
const PROFILE_COLS = 'id, email, full_name, designation';

/** Staff whose email OR institution_email equals `email` (case-insensitive). */
export async function staffByEmail(svc: Svc, email: string): Promise<StaffRow[]> {
  const pat = emailIlikePattern(email);
  const [a, b] = await Promise.all([
    svc.from('staff').select(STAFF_COLS).ilike('email', pat).limit(10),
    svc.from('staff').select(STAFF_COLS).ilike('institution_email', pat).limit(10),
  ]);
  if (a.error) throw new Error(`staff read failed: ${a.error.message}`);
  if (b.error) throw new Error(`staff read failed: ${b.error.message}`);
  const byId = new Map<string, StaffRow>();
  for (const r of [...(a.data ?? []), ...(b.data ?? [])] as StaffRow[]) byId.set(r.id, r);
  return [...byId.values()];
}

export async function profilesByEmail(svc: Svc, email: string): Promise<ProfileRow[]> {
  const { data, error } = await svc.from('profiles').select(PROFILE_COLS).ilike('email', emailIlikePattern(email)).limit(10);
  if (error) throw new Error(`profiles read failed: ${error.message}`);
  return (data ?? []) as ProfileRow[];
}

// ── Assign: resolve the login email ─────────────────────────────────────────

export type PickedPerson = { email?: string | null; staffId?: string | null; profileId?: string | null };

export type LoginResolution =
  | {
      ok: true;
      loginEmail: string;
      /** True when a confirmed auth account with exactly this email exists. */
      verified: boolean;
      source: 'auth' | 'staff_college_email' | 'staff_email' | 'manual';
      staffId: string | null;
      profileId: string | null;
      name: string | null;
    }
  | { ok: false; status: number; error: string };

/**
 * Pick the confirmed login among candidate profile ids. `prefer` lists
 * addresses to favour when several distinct logins turn up; if it is still
 * ambiguous, return 'ambiguous' rather than guess.
 */
async function pickLogin(
  svc: Svc,
  profileIds: string[],
  prefer: string[]
): Promise<{ email: string; profileId: string } | 'ambiguous' | null> {
  const ids = [...new Set(profileIds.filter(Boolean))];
  const found = (await mapLimit(ids, 5, async (id) => ({ id, login: await authLoginFor(svc, id) })))
    .filter((x): x is { id: string; login: AuthLogin } => !!x.login && x.login.confirmed);
  if (!found.length) return null;
  for (const p of prefer.map(normEmail).filter(Boolean)) {
    const hit = found.find((f) => f.login.email === p);
    if (hit) return { email: hit.login.email, profileId: hit.id };
  }
  const distinct = new Set(found.map((f) => f.login.email));
  if (distinct.size === 1) return { email: found[0].login.email, profileId: found[0].id };
  return 'ambiguous';
}

const AMBIGUOUS = {
  ok: false as const,
  status: 409,
  error: 'More than one login account matches this person — pick the exact login account from the search',
};

/**
 * Resolve the email the picked person will LOG IN WITH.
 *  1. staffId → that staff row; its linked profile's auth email (or, if not
 *     linked, a profile matching its college / personal email).
 *  2. profileId → that profile's auth email.
 *  3. raw email only → staff / profiles matching it → their auth email.
 * Falls back to the college email, then staff email, then the typed email
 * (lower/trim), flagged unverified.
 */
export async function resolveLoginEmail(svc: Svc, picked: PickedPerson): Promise<LoginResolution> {
  const staffId = picked.staffId ? String(picked.staffId).trim() : '';
  const profileId = picked.profileId ? String(picked.profileId).trim() : '';
  const typed = normEmail(picked.email);

  if (staffId) {
    if (!UUID_RE.test(staffId)) return { ok: false, status: 400, error: 'Invalid staff id' };
    const { data, error } = await svc.from('staff').select(STAFF_COLS).eq('id', staffId).maybeSingle();
    if (error) throw new Error(`staff read failed: ${error.message}`);
    if (!data) return { ok: false, status: 404, error: 'Staff member not found' };
    const s = data as StaffRow;
    const college = normEmail(s.institution_email);
    const personal = normEmail(s.email);
    let candidates: string[] = s.profile_id ? [s.profile_id] : [];
    if (!candidates.length) {
      const matched = (await Promise.all([college, personal].filter(Boolean).map((e) => profilesByEmail(svc, e)))).flat();
      candidates = matched.map((p) => p.id);
    }
    const login = await pickLogin(svc, candidates, [college, personal]);
    if (login === 'ambiguous') return AMBIGUOUS;
    const name = staffName(s) || null;
    if (login) {
      return { ok: true, loginEmail: login.email, verified: true, source: 'auth', staffId: s.id, profileId: login.profileId, name };
    }
    const fallback = college || personal;
    if (!fallback || !EMAIL_RE.test(fallback)) {
      return { ok: false, status: 422, error: 'This staff member has no email on record' };
    }
    return {
      ok: true, loginEmail: fallback, verified: false,
      source: college ? 'staff_college_email' : 'staff_email', staffId: s.id, profileId: null, name,
    };
  }

  if (profileId) {
    if (!UUID_RE.test(profileId)) return { ok: false, status: 400, error: 'Invalid profile id' };
    const { data, error } = await svc.from('profiles').select(PROFILE_COLS).eq('id', profileId).maybeSingle();
    if (error) throw new Error(`profiles read failed: ${error.message}`);
    if (!data) return { ok: false, status: 404, error: 'Profile not found' };
    const p = data as ProfileRow;
    const login = await authLoginFor(svc, p.id);
    if (login?.confirmed) {
      return { ok: true, loginEmail: login.email, verified: true, source: 'auth', staffId: null, profileId: p.id, name: p.full_name };
    }
    const fallback = normEmail(p.email);
    if (!fallback || !EMAIL_RE.test(fallback)) return { ok: false, status: 422, error: 'This profile has no login email' };
    return { ok: true, loginEmail: fallback, verified: false, source: 'manual', staffId: null, profileId: p.id, name: p.full_name };
  }

  if (!typed) return { ok: false, status: 400, error: 'Pick a person or enter an email' };
  if (!EMAIL_RE.test(typed)) return { ok: false, status: 400, error: 'Invalid email format' };
  const [staff, profiles] = await Promise.all([staffByEmail(svc, typed), profilesByEmail(svc, typed)]);
  const candidates = [...profiles.map((p) => p.id), ...staff.map((s) => s.profile_id ?? '')];
  const login = await pickLogin(svc, candidates, [typed]);
  if (login === 'ambiguous') return AMBIGUOUS;
  const name = (staff[0] ? staffName(staff[0]) : '') || profiles[0]?.full_name || null;
  if (login) {
    return { ok: true, loginEmail: login.email, verified: true, source: 'auth', staffId: staff[0]?.id ?? null, profileId: login.profileId, name };
  }
  return { ok: true, loginEmail: typed, verified: false, source: 'manual', staffId: staff[0]?.id ?? null, profileId: null, name };
}

// ── List: names + login status per stored checker_email ─────────────────────

export type CheckerInfo = { name: string | null; designation: string | null; verifiedLogin: boolean };

/**
 * For each stored (already lower-cased) checker_email: a display name
 * (staff by email / college email, else profiles.full_name) and whether a
 * confirmed auth login with exactly that email exists. Throws on read errors.
 */
export async function describeCheckerEmails(svc: Svc, emails: string[]): Promise<Map<string, CheckerInfo>> {
  const uniq = [...new Set(emails.map(normEmail).filter(Boolean))];
  const loginCache = new Map<string, AuthLogin | null>();
  const loginOf = async (id: string) => {
    if (!loginCache.has(id)) loginCache.set(id, await authLoginFor(svc, id));
    return loginCache.get(id) ?? null;
  };
  const rows = await mapLimit(uniq, 6, async (email) => {
    const [staff, profiles] = await Promise.all([staffByEmail(svc, email), profilesByEmail(svc, email)]);
    const s = staff.find((x) => x.is_active) ?? staff[0];
    const p = profiles[0];
    const ids = [...new Set([...profiles.map((x) => x.id), ...staff.map((x) => x.profile_id ?? '')].filter(Boolean))];
    let verifiedLogin = false;
    for (const id of ids) {
      const l = await loginOf(id);
      if (l && l.confirmed && l.email === email) { verifiedLogin = true; break; }
    }
    return [
      email,
      {
        name: (s ? staffName(s) : '') || p?.full_name || null,
        designation: s?.designation ?? p?.designation ?? null,
        verifiedLogin,
      },
    ] as const;
  });
  return new Map(rows);
}
