/**
 * resolveCard — turns a Route Check scan (JKKN ID QR, legacy UUID QR, or the
 * Code 39 id_code barcode) into learner / staff candidates. QR matches are
 * unique; a barcode can return several candidates (shared roll numbers,
 * staff_id == roll number), so the checker picks — this route's people first.
 *
 * Every query error throws: a swallowed error would read as "unknown card".
 */
import type { createServiceRoleClient } from '@/lib/supabase/server';
import { ACTIVE_LIFECYCLE_STATUSES } from '@/lib/passengers/types';
import { classifyCard, type CardShape } from './card';

type Svc = ReturnType<typeof createServiceRoleClient>;

export type MatchedBy = 'jkkn_id' | 'uuid' | 'roll_number' | 'register_number' | 'staff_id';

export interface Candidate {
  personKind: 'learner' | 'staff';
  id: string;
  name: string;
  code: string | null;
  routeId: string | null;
  matchedBy: MatchedBy;
  /** Learner lifecycle in ACTIVE_LIFECYCLE_STATUSES / staff is_active. The UI badges false as "inactive". */
  active: boolean;
}

export interface ResolveResult {
  shape: CardShape;
  code: string;
  candidates: Candidate[];
  retired?: boolean;
}

// ── Pure helpers (unit-tested) ────────────────────────────────────────────────

/**
 * An `.ilike()` pattern that matches `value` exactly (case-insensitive): the
 * LIKE wildcards % and _ (and the escape char \) are escaped so an id_code such
 * as `AB_12` cannot match `ABX12`. Same escaping as emailIlikePattern.
 *
 * PostgREST also rewrites every `*` in a like/ilike pattern to `%` before it
 * reaches Postgres, regardless of any backslash, so a `*` cannot be escaped.
 * A value containing `*` therefore has no exact pattern: returns null and the
 * caller skips the lookup. (classifyCard strips Code 39 `*` and its id_code
 * alphabet excludes it, so this is defence in depth.)
 */
export function exactIlikePattern(value: string): string | null {
  const v = value.trim();
  if (v === '' || v.includes('*')) return null;
  return v.replace(/\\/g, '\\\\').replace(/[%_]/g, '\\$&');
}

/** First occurrence of each (personKind, id) wins. */
export function dedupeCandidates(list: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const c of list) {
    const key = `${c.personKind}:${c.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/**
 * This route's candidates first, then active before inactive, then by name
 * (case-insensitive), then learners before staff.
 */
export function sortCandidates(list: Candidate[], routeId: string): Candidate[] {
  return [...list].sort((a, b) => {
    const ra = a.routeId === routeId ? 0 : 1;
    const rb = b.routeId === routeId ? 0 : 1;
    if (ra !== rb) return ra - rb;
    if (a.active !== b.active) return a.active ? -1 : 1;
    const byName = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    if (byName !== 0) return byName;
    return a.personKind === b.personKind ? 0 : a.personKind === 'learner' ? -1 : 1;
  });
}

/** True when a learner lifecycle_status counts as active. */
export function isActiveLifecycle(status: string | null | undefined): boolean {
  return (ACTIVE_LIFECYCLE_STATUSES as readonly string[]).includes(status ?? '');
}

/** Values to try as an id_code when a JKKN-ID-shaped scan has no identity row (7-digit register numbers). */
export function jkknFallbackCodes(code: string): string[] {
  return [...new Set([code.replace(/-/g, ''), code])];
}

function fullName(first: string | null, last: string | null): string {
  return `${first ?? ''} ${last ?? ''}`.trim() || '—';
}

// ── Row shapes ────────────────────────────────────────────────────────────────

const LEARNER_COLS = 'id, first_name, last_name, roll_number, register_number, transport_route_id, lifecycle_status';
const STAFF_COLS = 'id, first_name, last_name, staff_id, transport_route_id, is_active';

interface LearnerRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  roll_number: string | null;
  register_number: string | null;
  transport_route_id: string | null;
  lifecycle_status: string | null;
}
interface StaffRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  staff_id: string | null;
  transport_route_id: string | null;
  is_active: boolean | null;
}

function learnerCandidate(r: LearnerRow, matchedBy: MatchedBy): Candidate {
  return {
    personKind: 'learner',
    id: r.id,
    name: fullName(r.first_name, r.last_name),
    // Show the value the scan actually matched; otherwise roll, then register.
    code: matchedBy === 'register_number'
      ? (r.register_number ?? r.roll_number ?? null)
      : (r.roll_number ?? r.register_number ?? null),
    routeId: r.transport_route_id ?? null,
    matchedBy,
    active: isActiveLifecycle(r.lifecycle_status),
  };
}
function staffCandidate(r: StaffRow, matchedBy: MatchedBy): Candidate {
  return {
    personKind: 'staff',
    id: r.id,
    name: fullName(r.first_name, r.last_name),
    code: r.staff_id ?? null,
    routeId: r.transport_route_id ?? null,
    matchedBy,
    active: r.is_active === true,
  };
}

// ── Lookups ───────────────────────────────────────────────────────────────────

async function learnersBy(svc: Svc, col: 'id' | 'profile_id', value: string, matchedBy: MatchedBy): Promise<Candidate[]> {
  const { data, error } = await svc.from('learners_profiles').select(LEARNER_COLS).eq(col, value).limit(5);
  if (error) throw new Error(`resolveCard: learner ${col} lookup failed: ${error.message}`);
  return ((data ?? []) as LearnerRow[]).map((r) => learnerCandidate(r, matchedBy));
}

async function staffBy(svc: Svc, col: 'id' | 'profile_id', value: string, matchedBy: MatchedBy): Promise<Candidate[]> {
  const { data, error } = await svc.from('staff').select(STAFF_COLS).eq(col, value).limit(5);
  if (error) throw new Error(`resolveCard: staff ${col} lookup failed: ${error.message}`);
  return ((data ?? []) as StaffRow[]).map((r) => staffCandidate(r, matchedBy));
}

/**
 * Exact (case-insensitive) id_code match on roll_number, register_number and
 * staff_id, 5 per column, run in parallel. No lifecycle / is_active filter: a
 * still-allocated inactive learner's barcode must identify them just as their
 * QR does (candidates carry `active`; inactive ones sort after active).
 * Learners not on any bus are kept too (a legitimate "not on route" finding).
 */
async function byIdCode(svc: Svc, value: string): Promise<Candidate[]> {
  const pattern = exactIlikePattern(value);
  if (pattern === null) return [];
  const [roll, reg, staff] = await Promise.all([
    svc.from('learners_profiles').select(LEARNER_COLS).ilike('roll_number', pattern).limit(5),
    svc.from('learners_profiles').select(LEARNER_COLS).ilike('register_number', pattern).limit(5),
    svc.from('staff').select(STAFF_COLS).ilike('staff_id', pattern).limit(5),
  ]);
  if (roll.error) throw new Error(`resolveCard: learner roll_number lookup failed: ${roll.error.message}`);
  if (reg.error) throw new Error(`resolveCard: learner register_number lookup failed: ${reg.error.message}`);
  if (staff.error) throw new Error(`resolveCard: staff_id lookup failed: ${staff.error.message}`);
  return [
    ...((roll.data ?? []) as LearnerRow[]).map((r) => learnerCandidate(r, 'roll_number')),
    ...((reg.data ?? []) as LearnerRow[]).map((r) => learnerCandidate(r, 'register_number')),
    ...((staff.data ?? []) as StaffRow[]).map((r) => staffCandidate(r, 'staff_id')),
  ];
}

export async function resolveCard(svc: Svc, raw: string, routeId: string): Promise<ResolveResult> {
  const { shape, code } = classifyCard(raw);
  let found: Candidate[] = [];

  if (shape === 'jkkn_id') {
    const { data, error } = await svc
      .from('jkkn_identities')
      .select('learner_profile_id, team_member_id, person_kind, retired_at')
      .eq('jkkn_id', code)
      .maybeSingle();
    if (error) throw new Error(`resolveCard: jkkn_identities lookup failed: ${error.message}`);
    const row = data as {
      learner_profile_id: string | null;
      team_member_id: string | null;
      person_kind: string | null;
      retired_at: string | null;
    } | null;

    if (row) {
      // A retired card never resolves to anyone (and never falls back).
      if (row.retired_at) return { shape, code, candidates: [], retired: true };
      // 'both' carries both links, so both candidates come back.
      if (row.learner_profile_id) found.push(...(await learnersBy(svc, 'id', row.learner_profile_id, 'jkkn_id')));
      if (row.team_member_id) found.push(...(await staffBy(svc, 'id', row.team_member_id, 'jkkn_id')));
    } else {
      // No identity row: a 7-digit register number read off a Code 39 barcode
      // looks exactly like a dash-less JKKN ID. Try it as an id_code.
      // Collision risk: a register number equal to an ISSUED JKKN ID would resolve to the ID holder and never reach here (none exist as of 2026-09-21).
      for (const v of jkknFallbackCodes(code)) found.push(...(await byIdCode(svc, v)));
    }
  } else if (shape === 'uuid') {
    // Older cards carry learners_profiles.id or profiles.id.
    found.push(...(await learnersBy(svc, 'id', code, 'uuid')));
    found.push(...(await learnersBy(svc, 'profile_id', code, 'uuid')));
    found.push(...(await staffBy(svc, 'profile_id', code, 'uuid')));
  } else if (shape === 'id_code') {
    found = await byIdCode(svc, code);
  }

  return { shape, code, candidates: sortCandidates(dedupeCandidates(found), routeId) };
}
