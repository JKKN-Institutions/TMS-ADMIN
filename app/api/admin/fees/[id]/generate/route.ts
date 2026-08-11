import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { logActivity } from '@/lib/activity/log';
import { resolveApplicablePeople, type ApplicablePerson } from '@/lib/fees/applicability';
import { TRANSPORT_CATEGORY_NAME, type FeeAudience } from '@/lib/fees/types';
import { currentYearOf } from '@/lib/fees/year-of-study';
import {
  resolvePersonTerms,
  UNRESOLVED_LABEL,
  type StopScheduleTerm,
  type UnresolvedReason,
} from '@/lib/fees/resolve-terms';
import { buildStaffFeeBillRow } from '@/lib/fees/staff-bill';
import { filterOutInCharges } from '@/lib/fees/incharge-exemption';
import { intersectPersonIds } from '@/lib/fees/person-scope';
import type { TermOverride } from '@/lib/fees/overrides';
import { buildStaffBillNotification } from '@/lib/fees/staff-bill-notification';
import { notifyProfile } from '@/lib/notifications/notify';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

// withAuth drops Next's route context, so pull the [id] from the path:
// /api/admin/fees/<id>/generate
function feeIdFromPath(request: NextRequest): string | null {
  const parts = request.nextUrl.pathname.split('/').filter(Boolean);
  const i = parts.indexOf('fees');
  return i >= 0 && parts[i + 1] ? parts[i + 1] : null;
}

interface Term { term_no: number; term_label: string | null; amount: number; due_date: string }
interface Band {
  id: string;
  band_order: number;
  label: string | null;
  study_years: number[];
  total_amount: number;
  split_count: number;
  terms: Term[];
}
// A person resolved to the terms that apply to them (flat: structure terms;
// tiered: their year band's terms). `band` is null for flat structures.
interface Resolved { person: ApplicablePerson; terms: Term[]; band: Band | null }

async function generate(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_GENERATE))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const id = feeIdFromPath(request);
    if (!id) return NextResponse.json({ error: 'Fee structure id is required' }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const mode: 'dry_run' | 'generate' = body?.mode === 'generate' ? 'generate' : 'dry_run';

    // Optional explicit subset. Applied as an INTERSECTION after applicability
    // and the in-charge exemption, so it can only narrow the cohort. An
    // EXPLICIT empty array is rejected outright: intersectPersonIds reads "no
    // usable ids" as "no scoping applied" (by design, for the absent-field
    // case), so a selection UI that serialises "nothing selected" as []
    // would otherwise silently bill the ENTIRE cohort instead of nobody. An
    // absent personIds field keeps meaning "bill everyone".
    if (Array.isArray(body?.personIds) && body.personIds.length === 0) {
      return NextResponse.json(
        { error: 'personIds was provided but empty. Omit personIds to bill everyone, or include at least one id.' },
        { status: 400 }
      );
    }
    const requestedPersonIds: string[] | null = Array.isArray(body?.personIds)
      ? (body.personIds as unknown[]).map((v) => String(v))
      : null;
    const supabase = createServiceRoleClient();

    const { data: fs } = await supabase.from('tms_fee_structure').select('*').eq('id', id).maybeSingle();
    if (!fs) return NextResponse.json({ error: 'Fee structure not found' }, { status: 404 });
    if (fs.status !== 'active') {
      return NextResponse.json({ error: 'Activate the fee structure before generating bills.' }, { status: 400 });
    }

    const isTiered = fs.fee_mode === 'tiered';
    const isStopWise = fs.fee_mode === 'stop_wise';

    // Transport year start → the calendar year used to derive year of study, and
    // the date used to resolve each learner's academic_year. Needed for dry-run too.
    const { data: ty } = await supabase
      .from('tms_transport_year')
      .select('start_date')
      .eq('id', fs.transport_year_id)
      .maybeSingle();
    const tyStart: string | null = ty?.start_date ?? null;
    const currentYear = currentYearOf(tyStart);

    // Load the terms that drive billing: flat = structure terms; tiered = bands+terms.
    let flatTerms: Term[] = [];
    let bands: Band[] = [];
    if (isTiered) {
      const { data: bandRows } = await supabase
        .from('tms_fee_structure_year_band')
        .select('*')
        .eq('fee_structure_id', id)
        .order('band_order', { ascending: true });
      const bandList = (bandRows ?? []) as Array<Omit<Band, 'terms'>>;
      if (bandList.length === 0) {
        return NextResponse.json({ error: 'This tiered fee structure has no year bands defined.' }, { status: 400 });
      }
      const bandIds = bandList.map((b) => b.id);
      const { data: bandTermRows } = await supabase
        .from('tms_fee_structure_term')
        .select('*')
        .in('year_band_id', bandIds)
        .order('term_no', { ascending: true });
      const byBand = new Map<string, Term[]>();
      for (const t of (bandTermRows ?? []) as Array<Term & { year_band_id: string }>) {
        const arr = byBand.get(t.year_band_id) ?? [];
        arr.push({ term_no: t.term_no, term_label: t.term_label, amount: Number(t.amount), due_date: t.due_date });
        byBand.set(t.year_band_id, arr);
      }
      bands = bandList.map((b) => ({ ...b, terms: byBand.get(b.id) ?? [] }));
      const emptyBand = bands.find((b) => b.terms.length === 0);
      if (emptyBand) {
        return NextResponse.json(
          { error: `Year band "${emptyBand.label || emptyBand.study_years.join(', ')}" has no terms defined.` },
          { status: 400 }
        );
      }
    } else if (!isStopWise) {
      const { data: termsData } = await supabase
        .from('tms_fee_structure_term')
        .select('*')
        .eq('fee_structure_id', id)
        .is('year_band_id', null)
        .order('term_no', { ascending: true });
      flatTerms = (termsData ?? []) as Term[];
      if (flatTerms.length === 0) {
        return NextResponse.json({ error: 'This fee structure has no terms defined.' }, { status: 400 });
      }
    }
    // stop_wise deliberately has NO tms_fee_structure_term rows (POST never
    // inserts them, PUT deletes them) — its schedule lives entirely in
    // tms_fee_structure_stop_term, loaded by the isStopWise block below. Do
    // NOT fall into the flat-terms branch above for stop_wise: it would always
    // find zero rows and 400 before ever reaching its own schedule.

    // stop_wise: the shared share-based schedule + every configured stop rate.
    const stopTerms: StopScheduleTerm[] = [];
    const stopRateByStopId = new Map<string, number>();
    if (isStopWise) {
      const { data: stRows, error: stErr } = await supabase
        .from('tms_fee_structure_stop_term')
        .select('term_no, term_label, due_date, share_percent')
        .eq('fee_structure_id', id)
        .order('term_no', { ascending: true });
      if (stErr) {
        return NextResponse.json({ error: 'Failed to load the instalment schedule.' }, { status: 500 });
      }
      for (const t of (stRows ?? []) as Array<{
        term_no: number; term_label: string | null; due_date: string; share_percent: number;
      }>) {
        stopTerms.push({
          term_no: t.term_no,
          term_label: t.term_label,
          due_date: t.due_date,
          share_percent: Number(t.share_percent),
        });
      }
      if (stopTerms.length === 0) {
        return NextResponse.json(
          { error: 'This stop-wise fee structure has no instalment terms defined.' },
          { status: 400 }
        );
      }

      const { data: rateRows, error: rateErr } = await supabase
        .from('tms_fee_structure_stop_rate')
        .select('stop_id, annual_amount')
        .eq('fee_structure_id', id);
      if (rateErr) {
        return NextResponse.json({ error: 'Failed to load stop rates.' }, { status: 500 });
      }
      for (const r of (rateRows ?? []) as Array<{ stop_id: string; annual_amount: number }>) {
        stopRateByStopId.set(r.stop_id, Number(r.annual_amount));
      }
      if (stopRateByStopId.size === 0) {
        return NextResponse.json(
          { error: 'This stop-wise fee structure has no stop rates. Upload the rate sheet first.' },
          { status: 400 }
        );
      }
    }

    let people = await resolveApplicablePeople(supabase, fs);

    // Boarding stops for the cohort, and — for staff — every address they are
    // known by, which the in-charge exemption matches on. Fetched together in
    // one pass rather than two. Fetched here rather than inside
    // resolveApplicablePeople because the nightly in-charge cron shares that
    // function and must not change.
    // Chunked to 150 ids: a larger .in() overflows the Supabase gateway with
    // HTTP 400, and an unchecked { data: null } would read as EMPTY — making
    // every person look stop-less AND exempting nobody.
    const stopByPerson = new Map<string, string | null>();
    const emailByPerson = new Map<string, string | null>();
    const profileEmailByPerson = new Map<string, string | null>();
    if (isStopWise) {
      const isStaff = fs.audience === 'staff';
      const stopTable = isStaff ? 'staff' : 'learners_profiles';
      const cols = isStaff ? 'id, transport_stop_id, email, profile_id' : 'id, transport_stop_id';
      const ids = people.map((p) => p.person_id);
      const CHUNK_STOPS = 150;
      const profileIdByPerson = new Map<string, string | null>();
      for (let i = 0; i < ids.length; i += CHUNK_STOPS) {
        const { data: rows, error: stopErr } = await supabase
          .from(stopTable)
          .select(cols)
          .in('id', ids.slice(i, i + CHUNK_STOPS));
        if (stopErr) {
          return NextResponse.json({ error: 'Failed to resolve boarding stops.' }, { status: 500 });
        }
        for (const r of (rows ?? []) as unknown as Array<{
          id: string; transport_stop_id: string | null; email?: string | null; profile_id?: string | null;
        }>) {
          stopByPerson.set(r.id, r.transport_stop_id);
          if (isStaff) {
            emailByPerson.set(r.id, r.email ?? null);
            profileIdByPerson.set(r.id, r.profile_id ?? null);
          }
        }
      }

      // The in-charge exemption must match on BOTH staff.email AND
      // profiles.email: the self-assign path that turns a staff member into
      // an in-charge (app/api/boarding/self-assign/route.ts) writes
      // tms_staff_route_assignment.staff_email from profiles.email, not
      // staff.email — and the two frequently diverge (personal vs
      // institutional address). Resolving only staff.email silently bills
      // every volunteer whose addresses differ. Chunked to <=150 ids and
      // error-checked for the same gateway-400-reads-as-empty reason as every
      // other .in() on this path — an unchecked failure here would lose every
      // profile email and reintroduce that exact bug.
      if (isStaff) {
        const profileIds = [...new Set(
          [...profileIdByPerson.values()].filter((v): v is string => !!v)
        )];
        const emailByProfileId = new Map<string, string | null>();
        for (let i = 0; i < profileIds.length; i += CHUNK_STOPS) {
          const { data: profRows, error: profErr } = await supabase
            .from('profiles')
            .select('id, email')
            .in('id', profileIds.slice(i, i + CHUNK_STOPS));
          if (profErr) {
            return NextResponse.json({ error: 'Failed to resolve staff profile emails.' }, { status: 500 });
          }
          for (const r of (profRows ?? []) as Array<{ id: string; email: string | null }>) {
            emailByProfileId.set(r.id, r.email ?? null);
          }
        }
        for (const [personId, profileId] of profileIdByPerson) {
          profileEmailByPerson.set(personId, profileId ? emailByProfileId.get(profileId) ?? null : null);
        }
      }
    }

    // A bus in-charge holds a transport fee exemption in exchange for marking
    // their route's riders. Applied here as a cohort FILTER (a standing state),
    // not as an event — someone who takes the role simply leaves the cohort.
    let exemptInCharge = 0;
    let unmatchedInCharge = 0;
    if (isStopWise && fs.audience === 'staff') {
      const { data: assignRows, error: assignErr } = await supabase
        .from('tms_staff_route_assignment')
        .select('staff_email')
        .eq('is_active', true);
      if (assignErr) {
        // Fail loud: an unchecked failure here would exempt NOBODY and bill
        // every in-charge, which is the exact opposite of the policy.
        return NextResponse.json(
          { error: 'Failed to load bus in-charge assignments.' },
          { status: 500 }
        );
      }
      const emails = ((assignRows ?? []) as Array<{ staff_email: string | null }>)
        .map((r) => r.staff_email ?? '');
      const filtered = filterOutInCharges(
        people.map((p) => ({
          ...p,
          emails: [emailByPerson.get(p.person_id) ?? null, profileEmailByPerson.get(p.person_id) ?? null],
        })),
        emails
      );
      exemptInCharge = filtered.exemptCount;
      unmatchedInCharge = filtered.unmatchedInCharge;
      people = filtered.kept;
    }

    // Explicit subset, applied LAST so applicability, the in-charge exemption and
    // (below) stop-rate resolution all still gate who can be billed.
    const scope = intersectPersonIds(people, requestedPersonIds);
    people = scope.kept;

    // Per-person fee exceptions for this transport year (scholarships, concessions).
    // Filtered by YEAR ONLY, never by person id: overrides are exceptional and few,
    // so one small query replaces an .in() over ~1,000 UUIDs — which overflows the
    // Supabase gateway (HTTP 400) and, unchecked, reads as "no overrides exist".
    const { data: overrideRows, error: overrideErr } = await supabase
      .from('tms_fee_override')
      .select('person_id, term_no, billable, amount')
      .eq('transport_year_id', fs.transport_year_id);
    if (overrideErr) {
      // Fail loud. Treating this as "no overrides" would bill a scholarship
      // student the FULL amount — a silent overcharge is the worst outcome here,
      // and it would be invisible in both the dry run and the generated bills.
      console.error('Fee generation: failed to load fee overrides', overrideErr);
      return NextResponse.json(
        { error: 'Failed to load per-person fee overrides.' },
        { status: 500 }
      );
    }
    const overridesByPerson = new Map<string, TermOverride[]>();
    for (const row of (overrideRows ?? []) as Array<{
      person_id: string;
      term_no: number;
      billable: boolean;
      amount: number | string | null;
    }>) {
      const list = overridesByPerson.get(row.person_id) ?? [];
      // Postgres `numeric` arrives as a STRING over PostgREST. Left unconverted it
      // would flow into billing_student_bills.final_amount as text and into
      // arithmetic as a concatenation.
      list.push({
        term_no: row.term_no,
        billable: row.billable,
        amount: row.amount === null ? null : Number(row.amount),
      });
      overridesByPerson.set(row.person_id, list);
    }

    // Resolve each person to the terms that apply to them. Unresolvable people
    // are skipped + reported, never guessed. See lib/fees/resolve-terms.ts.
    const resolved: Resolved[] = [];
    let unresolved = 0;
    let overridden = 0;
    const unresolvedByReason: Record<UnresolvedReason, number> = {
      no_matching_band: 0,
      no_stop: 0,
      no_stop_rate: 0,
    };
    for (const person of people) {
      const personOverrides = overridesByPerson.get(person.person_id) ?? [];
      const outcome = resolvePersonTerms(
        {
          admission_year: person.admission_year,
          transport_stop_id: isStopWise ? stopByPerson.get(person.person_id) ?? null : null,
          overrides: personOverrides,
        },
        {
          feeMode: fs.fee_mode,
          currentYear,
          flatTerms,
          bands,
          stopTerms: isStopWise ? stopTerms : undefined,
          stopRateByStopId: isStopWise ? stopRateByStopId : undefined,
        }
      );
      if (!outcome.ok) {
        unresolved++;
        unresolvedByReason[outcome.reason]++;
        continue;
      }
      // Counted only for people who actually resolved — an override on an
      // unresolved person changes nothing and must not be reported as applied.
      if (personOverrides.length) overridden++;
      resolved.push({ person, terms: outcome.terms, band: outcome.band as Band | null });
    }

    const resolvedIds = resolved.map((r) => r.person.person_id);

    // Existing ledger for this structure+year (idempotency + coverage).
    const { data: existing } = await supabase
      .from('tms_fee_bill')
      .select('person_id, term_no')
      .eq('fee_structure_id', id)
      .eq('transport_year_id', fs.transport_year_id);
    const billedKey = new Set((existing ?? []).map((r) => `${r.person_id}:${r.term_no}`));

    // Anyone already billed by ANOTHER structure for the same transport year?
    // resolvedIds can be the whole applicable population (~1k). A single .in() over
    // that many UUIDs overflows the Supabase gateway → HTTP 400 → an unchecked
    // { data:null } would silently report ZERO conflicts, so cross-structure
    // double-billing would go unflagged in BOTH dry-run and generate. Chunk the id
    // list to <=150 and FAIL LOUD on error.
    let conflictCount = 0;
    if (resolvedIds.length) {
      const conflicted = new Set<string>();
      const CHUNK = 150;
      for (let i = 0; i < resolvedIds.length; i += CHUNK) {
        const { data: other, error: conflictErr } = await supabase
          .from('tms_fee_bill')
          .select('person_id')
          .eq('transport_year_id', fs.transport_year_id)
          .neq('fee_structure_id', id)
          .in('person_id', resolvedIds.slice(i, i + CHUNK));
        if (conflictErr) {
          return NextResponse.json(
            { error: 'Failed to check for cross-structure billing conflicts.' },
            { status: 500 }
          );
        }
        for (const r of (other ?? []) as Array<{ person_id: string }>) conflicted.add(r.person_id);
      }
      conflictCount = conflicted.size;
    }

    let toGenerate = 0;
    let alreadyBilled = 0;
    for (const r of resolved) {
      for (const t of r.terms) {
        if (billedKey.has(`${r.person.person_id}:${t.term_no}`)) alreadyBilled++;
        else toGenerate++;
      }
    }
    const learnerCount = resolved.filter((r) => r.person.person_type === 'learner').length;
    const staffCount = resolved.filter((r) => r.person.person_type === 'staff').length;

    // Per-band summary (tiered only): how many resolved people + per-person total.
    const bandSummary = isTiered
      ? bands.map((b) => ({
          label: b.label,
          study_years: b.study_years,
          totalPerPerson: b.terms.reduce((s, t) => s + Number(t.amount), 0),
          termsPerPerson: b.terms.length,
          applicable: resolved.filter((r) => r.band?.id === b.id).length,
        }))
      : null;

    const preview = {
      mode,
      audience: fs.audience,
      feeMode: fs.fee_mode,
      applicable: resolved.length,
      unresolved, // tiered: no admission year / year matches no band
      overridden, // people billed a per-person override instead of structure config
      unresolvedByReason,
      exemptInCharge,
      unmatchedInCharge,
      scopeRequested: scope.requested,
      scopeMatched: scope.matched,
      scopeUnknown: scope.unknownIds,
      stopRateCount: isStopWise ? stopRateByStopId.size : null,
      learnerCount,
      staffCount,
      termsPerPerson: isTiered ? null : flatTerms.length,
      alreadyBilledPairs: alreadyBilled,
      toGeneratePairs: toGenerate,
      conflictCount,
      totalPerPerson: isTiered ? null : flatTerms.reduce((s, t) => s + Number(t.amount), 0),
      staffDeferred: fs.audience === 'staff',
      bands: bandSummary,
      terms: isTiered
        ? undefined
        : flatTerms.map((t) => ({
            term_no: t.term_no, term_label: t.term_label, amount: Number(t.amount), due_date: t.due_date,
          })),
    };

    if (mode === 'dry_run') {
      return NextResponse.json({ success: true, data: preview });
    }

    // ── GENERATE ────────────────────────────────────────────────────────────
    const catName = TRANSPORT_CATEGORY_NAME[fs.audience as FeeAudience];
    const { data: cat } = await supabase
      .from('billing_categories')
      .select('id')
      .eq('category_name', catName)
      .maybeSingle();
    const categoryId = cat?.id ?? null;

    // Each learner's academic year comes from their PROFILE (resolveApplicablePeople
    // already loaded learners_profiles.academic_year_id). Resolve the distinct ids ->
    // display name in one query; the number of distinct academic years is tiny (one or
    // two per institution), so a single .in() stays well under the gateway limit.
    const learnerAyIds = [
      ...new Set(
        resolved
          .filter((r) => r.person.person_type === 'learner' && r.person.academic_year_id)
          .map((r) => r.person.academic_year_id as string)
      ),
    ];
    const acadYearNameById = new Map<string, string>();
    if (learnerAyIds.length) {
      const { data: ays, error: ayErr } = await supabase
        .from('academic_years')
        .select('id, academic_year_name')
        .in('id', learnerAyIds);
      if (ayErr) {
        return NextResponse.json({ error: 'Failed to resolve academic years for bill naming.' }, { status: 500 });
      }
      for (const a of (ays ?? []) as Array<{ id: string; academic_year_name: string | null }>) {
        if (a.academic_year_name) acadYearNameById.set(a.id, a.academic_year_name);
      }
    }

    const { data: run } = await supabase
      .from('tms_fee_generation_run')
      .insert([{
        fee_structure_id: id,
        transport_year_id: fs.transport_year_id,
        mode: 'generate',
        status: 'completed',
        triggered_by: auth.userId,
      }])
      .select()
      .single();
    const runId = run?.id ?? null;

    // Staff whose bill was actually inserted by this run — the notification list.
    const billedStaff: Array<{ staffId: string; amount: number; dueDate: string }> = [];

    let learnerBilled = 0;
    let staffDeferred = 0;
    let skipped = 0;
    let errors = 0;

    for (const r of resolved) {
      const p = r.person;
      const bandPrefix = r.band?.label ? `${r.band.label} - ` : '';
      const acadYearId = p.person_type === 'learner' ? p.academic_year_id : null;
      const acadYearName = acadYearId ? acadYearNameById.get(acadYearId) ?? null : null;
      const ayPart = acadYearName ? `${acadYearName} - ` : '';
      for (const t of r.terms) {
        if (billedKey.has(`${p.person_id}:${t.term_no}`)) { skipped++; continue; }
        const amount = Number(t.amount);

        if (p.person_type === 'learner') {
          const { data: bill, error: billErr } = await supabase
            .from('billing_student_bills')
            .insert([{
              student_id: p.person_id,
              institution_id: p.institution_id,
              item_category_id: categoryId,
              fee_source: 'ad_hoc',
              bill_description: `${catName} - ${ayPart}${bandPrefix}${t.term_label || `Term ${t.term_no}`}`,
              due_date: t.due_date,
              quantity: 1,
              unit_amount: amount,
              total_amount: amount,
              tax_amount: 0,
              final_amount: amount,
              balance_amount: amount,
              status: 'unpaid',
              academic_year_id: acadYearId,
              transport_year_id: fs.transport_year_id,
              created_by: auth.userId,
            }])
            .select('id')
            .single();
          if (billErr || !bill) { errors++; continue; }

          const { error: ledErr } = await supabase.from('tms_fee_bill').insert([{
            generation_run_id: runId,
            fee_structure_id: id,
            transport_year_id: fs.transport_year_id,
            person_id: p.person_id,
            person_type: 'learner',
            term_no: t.term_no,
            amount,
            due_date: t.due_date,
            billing_category_id: categoryId,
            billing_student_bill_id: bill.id,
            status: 'generated',
          }]);
          if (ledErr) { errors++; continue; }
          learnerBilled++;
        } else {
          // staff: a real payable bill. tms_fee_bill is the authoritative staff
          // ledger — staff can never be written to billing_student_bills, whose
          // student_id is NOT NULL with an FK to learners_profiles. The
          // in-charge enforcement cron still writes 'staff_deferred' via the
          // parameter default.
          const { error: ledErr } = await supabase.from('tms_fee_bill').insert([
            buildStaffFeeBillRow({
              runId,
              feeStructureId: id,
              transportYearId: fs.transport_year_id,
              staffId: p.person_id,
              categoryId,
              term: { term_no: t.term_no, amount, due_date: t.due_date },
              status: 'generated',
            }),
          ]);
          if (ledErr) { errors++; continue; }
          staffDeferred++;
          // Notify only for rows THIS run inserted, so a re-run — which inserts
          // nothing thanks to tms_fee_bill_idem_unique — notifies nobody.
          billedStaff.push({ staffId: p.person_id, amount, dueDate: t.due_date });
        }
      }
    }

    // ── Notify each staff member whose bill this run created ────────────────
    // Best-effort in TWO senses: (1) a delivery failure must never undo a
    // generated bill, so notifyProfile's own boolean result is the only thing
    // consulted; (2) the whole block is wrapped so ANY throw here — a rejected
    // network call, a malformed due_date — still lets the run-counter update
    // and activity log below execute. Every .in() is chunked to <=150 and
    // error-checked — an unchecked gateway 400 reads as an empty set, which
    // would silently notify nobody while reporting success.
    let notified = 0;
    try {
      // Group per-term rows into ONE notice per staffer: without this, a
      // multi-term structure sends one notice per term, each quoting a
      // fraction of the real total while the wording says "your fee is ₹X".
      // Sum the amounts; use the EARLIEST due date across their terms.
      const billedByStaff = new Map<string, { amount: number; dueDate: string }>();
      for (const b of billedStaff) {
        const agg = billedByStaff.get(b.staffId);
        if (!agg) {
          billedByStaff.set(b.staffId, { amount: b.amount, dueDate: b.dueDate });
        } else {
          agg.amount += b.amount;
          if (b.dueDate < agg.dueDate) agg.dueDate = b.dueDate;
        }
      }

      if (billedByStaff.size) {
        const { data: tyRow } = await supabase
          .from('tms_transport_year')
          .select('name')
          .eq('id', fs.transport_year_id)
          .maybeSingle();
        const yearName = (tyRow as { name?: string } | null)?.name ?? 'this year';

        const staffIds = [...billedByStaff.keys()];
        const profileIdByStaff = new Map<string, string | null>();
        const stopIdByStaff = new Map<string, string | null>();
        const CHUNK_NOTIFY = 150;
        let lookupFailed = false;
        for (let i = 0; i < staffIds.length; i += CHUNK_NOTIFY) {
          const { data: rows, error: sErr } = await supabase
            .from('staff')
            .select('id, profile_id, transport_stop_id')
            .in('id', staffIds.slice(i, i + CHUNK_NOTIFY));
          if (sErr) {
            // Logged, not silent: already-billed rows are skipped on retry, so
            // a lookup failure here means these notices can never be re-sent —
            // this is the only trace of why nobody was notified.
            console.error('Fee generation: staff notification lookup failed', sErr);
            lookupFailed = true;
            break;
          }
          for (const r of (rows ?? []) as Array<{ id: string; profile_id: string | null; transport_stop_id: string | null }>) {
            profileIdByStaff.set(r.id, r.profile_id);
            stopIdByStaff.set(r.id, r.transport_stop_id);
          }
        }

        const stopNameById = new Map<string, string>();
        const stopIds = [...new Set([...stopIdByStaff.values()].filter((v): v is string => !!v))];
        for (let i = 0; i < stopIds.length && !lookupFailed; i += CHUNK_NOTIFY) {
          const { data: rows, error: stErr } = await supabase
            .from('tms_route_stop')
            .select('id, stop_name')
            .in('id', stopIds.slice(i, i + CHUNK_NOTIFY));
          if (stErr) break; // stop name is cosmetic — degrade to no stop clause
          for (const r of (rows ?? []) as Array<{ id: string; stop_name: string | null }>) {
            if (r.stop_name) stopNameById.set(r.id, r.stop_name);
          }
        }

        if (!lookupFailed) {
          for (const [staffId, agg] of billedByStaff) {
            const profileId = profileIdByStaff.get(staffId);
            if (!profileId) continue; // no login identity — nothing to notify
            const stopId = stopIdByStaff.get(staffId);
            const note = buildStaffBillNotification({
              amount: agg.amount,
              dueDate: agg.dueDate,
              stopName: stopId ? stopNameById.get(stopId) ?? null : null,
              yearName,
            });
            // notifyProfile never throws — it swallows and returns false, so
            // `notified` counts actual deliveries, not attempts.
            const delivered = await notifyProfile(supabase, {
              profileId,
              actorId: auth.userId,
              title: note.title,
              body: note.body,
              category: note.category,
              url: note.url,
            });
            if (delivered) notified++;
          }
        }
      }
    } catch (e) {
      console.error('Fee generation: staff notification block failed (bills already committed)', e);
    }

    if (runId) {
      const noteParts: string[] = [];
      if (errors > 0) noteParts.push(`${errors} row(s) errored`);
      if (exemptInCharge > 0) {
        noteParts.push(`${exemptInCharge} staff exempt (active bus in-charge)`);
      }
      // Visible even when 0: a staff run that billed people but notified
      // nobody is exactly the failure mode that needs to surface here, since
      // a retry can never re-send (already-billed rows are skipped).
      if (staffDeferred > 0) {
        noteParts.push(`${notified} staff notified`);
      }
      if (isStopWise) {
        // Stop-wise can be unresolved for three different reasons, and the operator
        // needs to know WHICH — "no boarding stop" and "no rate configured for that
        // stop" have completely different remedies. Says "person(s)" because a
        // stop-wise structure may target staff, not only learners.
        for (const [reason, count] of Object.entries(unresolvedByReason)) {
          if (count > 0) {
            noteParts.push(`${count} person(s) unresolved — ${UNRESOLVED_LABEL[reason as UnresolvedReason]}`);
          }
        }
      } else if (unresolved > 0) {
        // Original wording, preserved byte-for-byte: flat/tiered runs must produce
        // exactly the note they always have.
        noteParts.push(`${unresolved} learner(s) unresolved (no admission year / no matching band)`);
      }
      await supabase.from('tms_fee_generation_run').update({
        applicable_count: resolved.length,
        learner_billed_count: learnerBilled,
        staff_deferred_count: staffDeferred,
        skipped_count: skipped,
        status: errors > 0 ? 'partial' : 'completed',
        notes: noteParts.length ? noteParts.join('; ') : null,
      }).eq('id', runId);
    }

    await logActivity(auth, request, {
      module: 'fees',
      action: 'generate',
      entityType: 'tms_fee_structure',
      entityId: id,
      entityLabel: fs.name,
      description: `Generated transport bills for ${fs.name}: ${learnerBilled} learner bill(s), ${staffDeferred} staff deferred, ${skipped} skipped, ${unresolved} unresolved`,
      metadata: { runId, learnerBilled, staffDeferred, skipped, unresolved, overridden, errors, feeMode: fs.fee_mode, notified },
    });

    return NextResponse.json({
      success: true,
      data: { mode: 'generate', runId, applicable: resolved.length, learnerBilled, staffDeferred, skipped, unresolved, overridden, errors, notified },
      message: `Generated ${learnerBilled} learner bill(s); ${staffDeferred} staff bill(s); ${notified} staff notified; ${skipped} already billed (skipped)${unresolved ? `; ${unresolved} unresolved` : ''}.`,
    });
  } catch (e) {
    console.error('Fee generation error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => generate(request, auth));
