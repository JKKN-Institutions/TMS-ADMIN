import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { resolveApplicablePeople } from '@/lib/fees/applicability';
import { currentYearOf, deriveStudyYear, bandForYear } from '@/lib/fees/year-of-study';

// Coverage for a fee structure: the applicable population vs the tms_fee_bill
// ledger → billed / partial / unbilled / staff-deferred. Plain handler (proxy
// gates it). Read-only.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = createServiceRoleClient();

    const { data: fs } = await supabase.from('tms_fee_structure').select('*').eq('id', id).maybeSingle();
    if (!fs) return NextResponse.json({ error: 'Fee structure not found' }, { status: 404 });

    const allPeople = await resolveApplicablePeople(supabase, fs);

    // Total-terms-per-person depends on mode: flat = the structure's own terms;
    // tiered = the terms of the band matching each learner's derived year. For a
    // tiered structure, only people who match a band are "applicable".
    const isTiered = fs.fee_mode === 'tiered';
    let people = allPeople;
    const totalTermsFor = new Map<string, number>();
    if (isTiered) {
      const { data: tyRow } = await supabase
        .from('tms_transport_year').select('start_date').eq('id', fs.transport_year_id).maybeSingle();
      const currentYear = currentYearOf(tyRow?.start_date ?? null);
      const { data: bandRows } = await supabase
        .from('tms_fee_structure_year_band').select('id, study_years').eq('fee_structure_id', id);
      const bands = (bandRows ?? []) as Array<{ id: string; study_years: number[] }>;
      const bandIds = bands.map((b) => b.id);
      const termCountByBand = new Map<string, number>();
      if (bandIds.length) {
        const { data: bandTerms } = await supabase
          .from('tms_fee_structure_term').select('year_band_id').in('year_band_id', bandIds);
        for (const t of bandTerms ?? []) {
          termCountByBand.set(t.year_band_id, (termCountByBand.get(t.year_band_id) ?? 0) + 1);
        }
      }
      people = [];
      for (const p of allPeople) {
        const band = bandForYear(bands, deriveStudyYear(currentYear, p.admission_year));
        if (!band) continue; // year matches no band → not applicable for this structure
        totalTermsFor.set(p.person_id, termCountByBand.get(band.id) ?? 0);
        people.push(p);
      }
    } else {
      const { count: termCount } = await supabase
        .from('tms_fee_structure_term')
        .select('id', { count: 'exact', head: true })
        .eq('fee_structure_id', id)
        .is('year_band_id', null);
      const flatTotal = termCount ?? 0;
      for (const p of allPeople) totalTermsFor.set(p.person_id, flatTotal);
    }

    const { data: bills } = await supabase
      .from('tms_fee_bill')
      .select('person_id, term_no, status')
      .eq('fee_structure_id', id)
      .eq('transport_year_id', fs.transport_year_id);
    const byPerson = new Map<string, { terms: Set<number>; statuses: Set<string> }>();
    for (const b of bills ?? []) {
      const e = byPerson.get(b.person_id) ?? { terms: new Set<number>(), statuses: new Set<string>() };
      e.terms.add(b.term_no);
      e.statuses.add(b.status);
      byPerson.set(b.person_id, e);
    }

    // Resolve display names.
    const learnerIds = people.filter((p) => p.person_type === 'learner').map((p) => p.person_id);
    const staffIds = people.filter((p) => p.person_type === 'staff').map((p) => p.person_id);
    const nameMap = new Map<string, { name: string; code: string | null }>();
    if (learnerIds.length) {
      const { data } = await supabase
        .from('learners_profiles')
        .select('id, first_name, last_name, roll_number')
        .in('id', learnerIds);
      for (const r of data ?? []) {
        nameMap.set(r.id, {
          name: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || '—',
          code: r.roll_number ?? null,
        });
      }
    }
    if (staffIds.length) {
      const { data } = await supabase
        .from('staff')
        .select('id, first_name, last_name, staff_id')
        .in('id', staffIds);
      for (const r of data ?? []) {
        nameMap.set(r.id, {
          name: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || '—',
          code: r.staff_id ?? null,
        });
      }
    }

    // Resolve institution names (for the institution column + filter on the table).
    const instIds = [...new Set(people.map((p) => p.institution_id).filter(Boolean))] as string[];
    const instMap = new Map<string, string>();
    if (instIds.length) {
      const { data } = await supabase.from('institutions').select('id, name').in('id', instIds);
      for (const r of data ?? []) instMap.set(r.id, r.name);
    }

    const rows = people.map((p) => {
      const e = byPerson.get(p.person_id);
      const termsBilled = e ? e.terms.size : 0;
      const deferred = e ? e.statuses.has('staff_deferred') : false;
      const nm = nameMap.get(p.person_id);
      const totalTerms = totalTermsFor.get(p.person_id) ?? 0;
      const status = deferred
        ? 'staff_deferred'
        : totalTerms > 0 && termsBilled >= totalTerms
          ? 'billed'
          : termsBilled > 0
            ? 'partial'
            : 'unbilled';
      return {
        person_id: p.person_id,
        person_type: p.person_type,
        name: nm?.name ?? '—',
        code: nm?.code ?? null,
        institution_id: p.institution_id,
        institution_name: p.institution_id ? instMap.get(p.institution_id) ?? null : null,
        terms_billed: termsBilled,
        total_terms: totalTerms,
        status,
      };
    });

    const summary = {
      applicable: people.length,
      billed: rows.filter((r) => r.status === 'billed').length,
      partial: rows.filter((r) => r.status === 'partial').length,
      unbilled: rows.filter((r) => r.status === 'unbilled').length,
      staffDeferred: rows.filter((r) => r.status === 'staff_deferred').length,
    };

    return NextResponse.json({ success: true, data: { summary, people: rows } });
  } catch (e) {
    console.error('Fee coverage error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
