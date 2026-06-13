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

    const { data: terms } = await supabase
      .from('tms_fee_structure_term')
      .select('*')
      .eq('fee_structure_id', id)
      .order('term_no', { ascending: true });

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
      data: { ...data, terms: terms ?? [], transport_year_name: transportYearName },
    });
  } catch (e) {
    console.error('Fee structure fetch error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
