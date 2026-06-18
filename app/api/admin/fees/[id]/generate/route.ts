import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { logActivity } from '@/lib/activity/log';
import { resolveApplicablePeople, type ApplicablePerson } from '@/lib/fees/applicability';
import { TRANSPORT_CATEGORY_NAME, type FeeAudience } from '@/lib/fees/types';
import { currentYearOf, deriveStudyYear, bandForYear } from '@/lib/fees/year-of-study';

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
    const supabase = createServiceRoleClient();

    const { data: fs } = await supabase.from('tms_fee_structure').select('*').eq('id', id).maybeSingle();
    if (!fs) return NextResponse.json({ error: 'Fee structure not found' }, { status: 404 });
    if (fs.status !== 'active') {
      return NextResponse.json({ error: 'Activate the fee structure before generating bills.' }, { status: 400 });
    }

    const isTiered = fs.fee_mode === 'tiered';

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
    } else {
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

    const people = await resolveApplicablePeople(supabase, fs);

    // Resolve each person to the terms that apply to them. For tiered structures a
    // learner with no derivable year, or whose year matches no band, is UNRESOLVED
    // (skipped + reported, never guessed).
    const resolved: Resolved[] = [];
    let unresolved = 0;
    for (const person of people) {
      if (!isTiered) {
        resolved.push({ person, terms: flatTerms, band: null });
        continue;
      }
      const year = deriveStudyYear(currentYear, person.admission_year);
      const band = bandForYear(bands, year);
      if (!band) { unresolved++; continue; }
      resolved.push({ person, terms: band.terms, band });
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
    let conflictCount = 0;
    if (resolvedIds.length) {
      const { data: other } = await supabase
        .from('tms_fee_bill')
        .select('person_id')
        .eq('transport_year_id', fs.transport_year_id)
        .neq('fee_structure_id', id)
        .in('person_id', resolvedIds);
      conflictCount = new Set((other ?? []).map((r) => r.person_id)).size;
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

    // academic_year_id is institution-scoped — cache per institution.
    const acadCache = new Map<string, string | null>();
    const resolveAcademicYear = async (institutionId: string | null): Promise<string | null> => {
      if (!institutionId || !tyStart) return null;
      if (acadCache.has(institutionId)) return acadCache.get(institutionId)!;
      const { data: ay } = await supabase
        .from('academic_years')
        .select('id')
        .eq('institution_id', institutionId)
        .lte('start_date', tyStart)
        .gte('end_date', tyStart)
        .limit(1)
        .maybeSingle();
      const v = ay?.id ?? null;
      acadCache.set(institutionId, v);
      return v;
    };

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

    let learnerBilled = 0;
    let staffDeferred = 0;
    let skipped = 0;
    let errors = 0;

    for (const r of resolved) {
      const p = r.person;
      const bandPrefix = r.band?.label ? `${r.band.label} - ` : '';
      const acadYear = p.person_type === 'learner' ? await resolveAcademicYear(p.institution_id) : null;
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
              bill_description: `${fs.name} - ${bandPrefix}${t.term_label || `Term ${t.term_no}`}`,
              due_date: t.due_date,
              quantity: 1,
              unit_amount: amount,
              total_amount: amount,
              tax_amount: 0,
              final_amount: amount,
              balance_amount: amount,
              status: 'unpaid',
              academic_year_id: acadYear,
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
          // staff: coverage-only ledger row (no billing target in v1)
          const { error: ledErr } = await supabase.from('tms_fee_bill').insert([{
            generation_run_id: runId,
            fee_structure_id: id,
            transport_year_id: fs.transport_year_id,
            person_id: p.person_id,
            person_type: 'staff',
            term_no: t.term_no,
            amount,
            due_date: t.due_date,
            billing_category_id: categoryId,
            billing_student_bill_id: null,
            status: 'staff_deferred',
          }]);
          if (ledErr) { errors++; continue; }
          staffDeferred++;
        }
      }
    }

    if (runId) {
      const noteParts: string[] = [];
      if (errors > 0) noteParts.push(`${errors} row(s) errored`);
      if (unresolved > 0) noteParts.push(`${unresolved} learner(s) unresolved (no admission year / no matching band)`);
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
      metadata: { runId, learnerBilled, staffDeferred, skipped, unresolved, errors, feeMode: fs.fee_mode },
    });

    return NextResponse.json({
      success: true,
      data: { mode: 'generate', runId, applicable: resolved.length, learnerBilled, staffDeferred, skipped, unresolved, errors },
      message: `Generated ${learnerBilled} learner bill(s); ${staffDeferred} staff deferred; ${skipped} already billed (skipped)${unresolved ? `; ${unresolved} unresolved` : ''}.`,
    });
  } catch (e) {
    console.error('Fee generation error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => generate(request, auth));
