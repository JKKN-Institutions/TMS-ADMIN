import { NextResponse, type NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * GET one transport year (full tms_transport_year row) by id. Backs the
 * in-module view/edit pages so they survive deep-link / hard refresh (the list
 * endpoint can't). Auth is enforced by proxy.ts; writes still go through the
 * permission-gated POST/PUT/DELETE on /api/admin/transport-years.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> } // Next 15: params is a Promise
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'Transport year id is required' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    const { data: year, error } = await supabase
      .from('tms_transport_year')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      if (error.code === '42P01') {
        return NextResponse.json({ error: 'Transport year not found' }, { status: 404 });
      }
      console.error('Transport year detail query error:', error);
      return NextResponse.json({ error: 'Failed to fetch transport year' }, { status: 500 });
    }
    if (!year) {
      return NextResponse.json({ error: 'Transport year not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: year });
  } catch (e) {
    console.error('Transport year detail API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
