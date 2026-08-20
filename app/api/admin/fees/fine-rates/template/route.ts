import { NextResponse, type NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { buildFineTemplateRows, FINE_TEMPLATE_HEADERS } from '@/lib/fines/fine-template';
import type { TemplateStop } from '@/lib/fees/stop-template';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

interface StopRow {
  id: string;
  stop_name: string;
  sequence_order: number;
  tms_route: { route_number: string; route_name: string } | null;
}

async function template(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const year = new URL(request.url).searchParams.get('year');
    if (!year) return NextResponse.json({ error: 'A transport year is required' }, { status: 400 });

    const supabase = createServiceRoleClient();

    const { data: stops, error: stopErr } = await supabase
      .from('tms_route_stop')
      .select('id, stop_name, sequence_order, tms_route(route_number, route_name)')
      .order('sequence_order', { ascending: true });
    if (stopErr) return NextResponse.json({ error: 'Failed to load route stops' }, { status: 500 });

    const { data: rates, error: rateErr } = await supabase
      .from('tms_fine_stop_rate')
      .select('stop_id, fine_amount')
      .eq('transport_year_id', year);
    // Fail loudly: a silent failure here yields a template with every amount
    // blank, which reads as "nothing priced yet" and invites the operator to
    // overwrite a good fine sheet.
    if (rateErr) {
      return NextResponse.json({ error: 'Failed to load existing fine rates' }, { status: 500 });
    }
    const existing = new Map<string, number>(
      ((rates ?? []) as Array<{ stop_id: string; fine_amount: number }>).map((r) => [
        r.stop_id,
        Number(r.fine_amount),
      ])
    );

    const list: TemplateStop[] = ((stops ?? []) as unknown as StopRow[]).map((s) => ({
      stop_id: s.id,
      stop_name: s.stop_name,
      sequence_order: s.sequence_order,
      route_number: s.tms_route?.route_number ?? null,
      route_name: s.tms_route?.route_name ?? null,
    }));
    list.sort(
      (a, b) =>
        String(a.route_number ?? '').localeCompare(String(b.route_number ?? '')) ||
        a.sequence_order - b.sequence_order
    );

    const ws = XLSX.utils.json_to_sheet(buildFineTemplateRows(list, existing), {
      header: [...FINE_TEMPLATE_HEADERS],
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Fine Rates');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="fine-rates-template.xlsx"',
      },
    });
  } catch (e) {
    console.error('Fine rate template error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => template(request, auth));
