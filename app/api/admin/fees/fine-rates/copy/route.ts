import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { logActivity } from '@/lib/activity/log';
import { parseFineRateCopyBody } from '@/lib/fines/fields';
import { planFineRateCopy, type SourceStopRate } from '@/lib/fines/copy-rates';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

/** How many changed stops the preview names on screen before summarising. */
const SAMPLE_SIZE = 25;

/**
 * Copy a stop_wise fee structure's per-stop annual amounts into a transport
 * year's FINE sheet.
 *
 * `mode: 'preview'` writes nothing and reports exactly what an apply would do —
 * the operator sees every overwrite (old → new) before any money moves.
 */
async function copy(request: NextRequest, auth: AuthContext) {
  try {
    const parsed = parseFineRateCopyBody(await request.json().catch(() => ({})));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const { year, fee_structure_id, mode, overwrite } = parsed.value;

    // Previewing is a read; applying rewrites the fine sheet for the whole year.
    const needed = mode === 'apply' ? TMS_PERMISSIONS.FEES_EDIT : TMS_PERMISSIONS.FEES_VIEW;
    if (!(await requirePerm(auth, needed))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const supabase = createServiceRoleClient();

    const { data: structure, error: sErr } = await supabase
      .from('tms_fee_structure')
      .select('id, name, fee_mode, transport_year_id')
      .eq('id', fee_structure_id)
      .maybeSingle();
    if (sErr) return NextResponse.json({ error: 'Failed to load the fee structure' }, { status: 500 });
    if (!structure) return NextResponse.json({ error: 'Fee structure not found' }, { status: 404 });

    if (structure.fee_mode !== 'stop_wise') {
      return NextResponse.json(
        { error: `"${structure.name}" is not a stop-wise structure, so it has no per-stop amounts to copy.` },
        { status: 400 }
      );
    }
    // A structure priced for a DIFFERENT year would silently fine this year's
    // learners at last year's rates. Refuse rather than guess.
    if (structure.transport_year_id !== year) {
      return NextResponse.json(
        { error: `"${structure.name}" belongs to a different transport year. Pick a structure from the selected year.` },
        { status: 400 }
      );
    }

    const { data: sourceRows, error: srcErr } = await supabase
      .from('tms_fee_structure_stop_rate')
      .select('stop_id, annual_amount')
      .eq('fee_structure_id', fee_structure_id);
    if (srcErr) {
      return NextResponse.json({ error: 'Failed to load the structure’s stop rates' }, { status: 500 });
    }

    const { data: fineRows, error: fineErr } = await supabase
      .from('tms_fine_stop_rate')
      .select('stop_id, fine_amount')
      .eq('transport_year_id', year);
    // Fail loudly: a swallowed error reads every configured fine as "unpriced",
    // which turns this into an unannounced overwrite of the whole sheet.
    if (fineErr) return NextResponse.json({ error: 'Failed to load the current fine rates' }, { status: 500 });

    const existing = new Map<string, number>(
      ((fineRows ?? []) as Array<{ stop_id: string; fine_amount: number }>).map((r) => [
        r.stop_id,
        Number(r.fine_amount),
      ])
    );
    const plan = planFineRateCopy(
      ((sourceRows ?? []) as Array<{ stop_id: string; annual_amount: number }>).map(
        (r): SourceStopRate => ({ stop_id: r.stop_id, annual_amount: Number(r.annual_amount) })
      ),
      existing,
      { overwrite }
    );

    // Name the changed stops for the confirmation screen.
    const sampleIds = [...plan.overwrite, ...plan.insert].slice(0, SAMPLE_SIZE).map((r) => r.stop_id);
    const nameByStop = new Map<string, string>();
    if (sampleIds.length) {
      const { data: stops } = await supabase
        .from('tms_route_stop')
        .select('id, stop_name')
        .in('id', sampleIds);
      for (const s of stops ?? []) nameByStop.set(s.id, s.stop_name);
    }
    const named = (rows: typeof plan.overwrite) =>
      rows.slice(0, SAMPLE_SIZE).map((r) => ({
        stop_id: r.stop_id,
        stop_name: nameByStop.get(r.stop_id) ?? null,
        previous: r.previous,
        fine_amount: r.fine_amount,
      }));

    const summary = {
      structure_name: structure.name,
      source_rows: (sourceRows ?? []).length,
      to_insert: plan.insert.length,
      to_overwrite: plan.overwrite.length,
      unchanged: plan.unchanged,
      skipped_zero: plan.skippedZero,
      will_write: plan.rows.length,
      overwrite,
      sample_insert: named(plan.insert),
      sample_overwrite: named(plan.overwrite),
    };

    if (mode === 'preview') {
      return NextResponse.json({ success: true, data: { mode: 'preview', ...summary } });
    }

    const now = new Date().toISOString();
    let written = 0;
    // Chunked: a single upsert of ~500 rows has repeatedly hit the gateway's
    // request limit on this project.
    for (let i = 0; i < plan.rows.length; i += 150) {
      const chunk = plan.rows.slice(i, i + 150).map((r) => ({
        transport_year_id: year,
        stop_id: r.stop_id,
        fine_amount: r.fine_amount,
        updated_at: now,
        updated_by: auth.userId,
      }));
      const { error } = await supabase
        .from('tms_fine_stop_rate')
        .upsert(chunk, { onConflict: 'transport_year_id,stop_id' });
      if (error) {
        console.error('Fine rate copy failed:', error.message);
        // Report the partial write rather than claiming nothing happened: the
        // earlier chunks are already committed.
        return NextResponse.json(
          { error: `Copy failed after writing ${written} rate(s). Re-run to finish.` },
          { status: 500 }
        );
      }
      written += chunk.length;
    }

    await logActivity(auth, request, {
      module: 'fees',
      action: 'update',
      entityType: 'tms_fine_stop_rate',
      entityId: year,
      description: `Copied fine rates from "${structure.name}": ${plan.insert.length} set, ${overwrite ? plan.overwrite.length : 0} overwritten`,
      metadata: {
        fee_structure_id,
        inserted: plan.insert.length,
        overwritten: overwrite ? plan.overwrite.length : 0,
        skipped_existing: overwrite ? 0 : plan.overwrite.length,
        unchanged: plan.unchanged,
        skipped_zero: plan.skippedZero,
      },
    });

    return NextResponse.json({
      success: true,
      data: { mode: 'apply', ...summary, written },
      message: `Copied ${written} fine rate(s) from "${structure.name}".`,
    });
  } catch (e) {
    console.error('Fine rate copy error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => copy(request, auth));
