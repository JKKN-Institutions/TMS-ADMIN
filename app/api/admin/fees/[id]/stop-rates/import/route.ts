import { NextResponse, type NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { logActivity } from '@/lib/activity/log';
import { parseImportRows, type TemplateStop } from '@/lib/fees/stop-template';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

function feeIdFromPath(request: NextRequest): string | null {
  const parts = request.nextUrl.pathname.split('/').filter(Boolean);
  const i = parts.indexOf('fees');
  return i >= 0 && parts[i + 1] ? parts[i + 1] : null;
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
    const id = feeIdFromPath(request);
    if (!id) return NextResponse.json({ error: 'Fee structure id is required' }, { status: 400 });

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'A .xlsx file is required (field "file").' }, { status: 400 });
    }

    // The real rate sheet is ~479 rows / well under 200 KB. Cap generously: this
    // endpoint reads the whole file into memory, so an unbounded upload is a
    // memory-exhaustion risk even from an authenticated admin picking the wrong file.
    const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: 'File is too large. The rate sheet should be well under 5 MB.' },
        { status: 400 }
      );
    }

    const name = file.name.toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls')) {
      return NextResponse.json(
        { error: 'Upload the .xlsx rate sheet downloaded from the template button.' },
        { status: 400 }
      );
    }

    const supabase = createServiceRoleClient();

    const { data: fs } = await supabase
      .from('tms_fee_structure')
      .select('id, name, fee_mode')
      .eq('id', id)
      .maybeSingle();
    if (!fs) return NextResponse.json({ error: 'Fee structure not found' }, { status: 404 });
    if (fs.fee_mode !== 'stop_wise') {
      return NextResponse.json(
        { error: 'Stop rates apply only to stop-wise fee structures.' },
        { status: 400 }
      );
    }

    const wb = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) return NextResponse.json({ error: 'The workbook has no sheets.' }, { status: 400 });
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

    const { data: stops, error: stopErr } = await supabase
      .from('tms_route_stop')
      .select('id, stop_name, sequence_order, tms_route(route_number, route_name)');
    if (stopErr) {
      return NextResponse.json({ error: 'Failed to load route stops' }, { status: 500 });
    }
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

    const { rates, errors } = parseImportRows(rows, known);

    // All-or-nothing: a sheet with any bad row writes NOTHING, so the operator
    // never ends up with a half-applied price list they cannot reason about.
    if (errors.length) {
      return NextResponse.json(
        { error: `${errors.length} row(s) rejected. Nothing was imported.`, data: { errors } },
        { status: 400 }
      );
    }
    if (!rates.length) {
      return NextResponse.json({ error: 'The sheet contained no amounts.' }, { status: 400 });
    }

    const { error: upErr } = await supabase.from('tms_fee_structure_stop_rate').upsert(
      rates.map((r) => ({
        fee_structure_id: id,
        stop_id: r.stop_id,
        annual_amount: r.annual_amount,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'fee_structure_id,stop_id' }
    );
    if (upErr) return NextResponse.json({ error: 'Failed to save stop rates' }, { status: 500 });

    await logActivity(auth, request, {
      module: 'fees',
      action: 'update',
      entityType: 'tms_fee_structure',
      entityId: id,
      entityLabel: fs.name,
      description: `Imported ${rates.length} stop rate(s) for ${fs.name}`,
      metadata: { imported: rates.length },
    });

    return NextResponse.json({
      success: true,
      data: { imported: rates.length, errors: [] },
      message: `Imported ${rates.length} stop rate(s).`,
    });
  } catch (e) {
    console.error('Stop rate import error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => importSheet(request, auth));
