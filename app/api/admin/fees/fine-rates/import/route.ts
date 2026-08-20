import { NextResponse, type NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { logActivity } from '@/lib/activity/log';
import { parseFineImportRows } from '@/lib/fines/fine-template';
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

async function importSheet(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_EDIT))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const form = await request.formData();
    const year = String(form.get('year') ?? '');
    if (!year) return NextResponse.json({ error: 'A transport year is required' }, { status: 400 });

    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'A .xlsx file is required (field "file").' }, { status: 400 });
    }
    // This endpoint reads the whole file into memory, so an unbounded upload is a
    // memory-exhaustion risk even from an authenticated admin picking the wrong file.
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File is too large. The fine sheet should be well under 5 MB.' },
        { status: 400 }
      );
    }
    const name = file.name.toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls')) {
      return NextResponse.json(
        { error: 'Upload the .xlsx sheet downloaded from the template button.' },
        { status: 400 }
      );
    }

    const supabase = createServiceRoleClient();

    const { data: stops, error: stopErr } = await supabase
      .from('tms_route_stop')
      .select('id, stop_name, sequence_order, tms_route(route_number, route_name)');
    if (stopErr) return NextResponse.json({ error: 'Failed to load route stops' }, { status: 500 });

    const known = new Map<string, TemplateStop>(
      ((stops ?? []) as unknown as StopRow[]).map((s) => [
        s.id,
        {
          stop_id: s.id,
          stop_name: s.stop_name,
          sequence_order: s.sequence_order,
          route_number: s.tms_route?.route_number ?? null,
          route_name: s.tms_route?.route_name ?? null,
        },
      ])
    );

    const wb = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) return NextResponse.json({ error: 'The workbook has no sheets.' }, { status: 400 });
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

    const { rates, clears, errors } = parseFineImportRows(rows, known);
    if (errors.length) {
      // All-or-nothing: nothing is written when any row is bad, so the operator
      // fixes the sheet once instead of chasing a half-applied import.
      return NextResponse.json(
        { error: `${errors.length} row(s) rejected — nothing was saved.`, data: { errors } },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    if (rates.length) {
      const { error } = await supabase.from('tms_fine_stop_rate').upsert(
        rates.map((r) => ({
          transport_year_id: year,
          stop_id: r.stop_id,
          fine_amount: r.fine_amount,
          updated_at: now,
          updated_by: auth.userId,
        })),
        { onConflict: 'transport_year_id,stop_id' }
      );
      if (error) {
        console.error('Fine rate import upsert failed:', error.message);
        return NextResponse.json({ error: 'Failed to save fine rates' }, { status: 500 });
      }
    }
    for (let i = 0; i < clears.length; i += 150) {
      const { error } = await supabase
        .from('tms_fine_stop_rate')
        .delete()
        .eq('transport_year_id', year)
        .in('stop_id', clears.slice(i, i + 150));
      if (error) {
        console.error('Fine rate import clear failed:', error.message);
        return NextResponse.json({ error: 'Failed to clear fine rates' }, { status: 500 });
      }
    }

    await logActivity(auth, request, {
      module: 'fees',
      action: 'import',
      entityType: 'tms_fine_stop_rate',
      entityId: year,
      description: `Imported fine rates: ${rates.length} saved, ${clears.length} cleared`,
      metadata: { saved: rates.length, cleared: clears.length },
    });

    return NextResponse.json({
      success: true,
      data: { saved: rates.length, cleared: clears.length },
      message: `Imported ${rates.length} fine rate(s).`,
    });
  } catch (e) {
    console.error('Fine rate import error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => importSheet(request, auth));
