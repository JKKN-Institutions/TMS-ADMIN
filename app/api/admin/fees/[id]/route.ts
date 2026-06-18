import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

// Single fee structure with its terms + transport year name. Plain handler
// (proxy.ts gates it); used by the detail + edit pages so they survive a hard
// refresh. Next 15: params is a Promise.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = createServiceRoleClient();

    const { data, error } = await supabase
      .from('tms_fee_structure')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) {
      console.error('Fee structure fetch error:', error);
      return NextResponse.json({ error: 'Failed to fetch fee structure' }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: 'Fee structure not found' }, { status: 404 });

    // Flat structures carry terms directly; tiered structures carry year bands,
    // each with its own terms.
    const { data: terms } = await supabase
      .from('tms_fee_structure_term')
      .select('*')
      .eq('fee_structure_id', id)
      .is('year_band_id', null)
      .order('term_no', { ascending: true });

    let bands: Array<Record<string, unknown>> = [];
    if (data.fee_mode === 'tiered') {
      const { data: bandRows } = await supabase
        .from('tms_fee_structure_year_band')
        .select('*')
        .eq('fee_structure_id', id)
        .order('band_order', { ascending: true });
      const bandIds = (bandRows ?? []).map((b) => b.id);
      const byBand = new Map<string, Array<Record<string, unknown>>>();
      if (bandIds.length) {
        const { data: bandTerms } = await supabase
          .from('tms_fee_structure_term')
          .select('*')
          .in('year_band_id', bandIds)
          .order('term_no', { ascending: true });
        for (const t of bandTerms ?? []) {
          const arr = byBand.get(t.year_band_id) ?? [];
          arr.push(t);
          byBand.set(t.year_band_id, arr);
        }
      }
      bands = (bandRows ?? []).map((b) => ({ ...b, terms: byBand.get(b.id) ?? [] }));
    }

    let transportYearName: string | null = null;
    if (data.transport_year_id) {
      const { data: ty } = await supabase
        .from('tms_transport_year')
        .select('name')
        .eq('id', data.transport_year_id)
        .maybeSingle();
      transportYearName = ty?.name ?? null;
    }

    return NextResponse.json({
      success: true,
      data: { ...data, terms: terms ?? [], bands, transport_year_name: transportYearName },
    });
  } catch (e) {
    console.error('Fee structure fetch error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
