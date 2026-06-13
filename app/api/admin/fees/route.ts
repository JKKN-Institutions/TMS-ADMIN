import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { buildFeeStructurePayload } from '@/lib/fees/fields';
import { logActivity } from '@/lib/activity/log';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

interface TermInput {
  term_no?: number;
  term_label?: string | null;
  amount: number | string;
  due_date: string;
}

// Terms must equal split_count and sum to total_amount.
function validateTerms(total: number, splitCount: number, terms: unknown): string | null {
  if (!Array.isArray(terms) || terms.length === 0) return 'At least one term is required';
  if (terms.length !== splitCount) {
    return `Number of terms (${terms.length}) must equal the split count (${splitCount})`;
  }
  let sum = 0;
  for (const t of terms as TermInput[]) {
    const amt = Number(t.amount);
    if (t.amount == null || Number.isNaN(amt) || amt < 0) return 'Each term needs a valid amount';
    if (!t.due_date) return 'Each term needs a due date';
    sum += amt;
  }
  if (Math.abs(sum - total) > 0.01) {
    return `Term amounts must sum to the total fee (got ${sum}, expected ${total})`;
  }
  return null;
}

function buildTermRows(feeStructureId: string, terms: TermInput[]) {
  return terms.map((t, i) => ({
    fee_structure_id: feeStructureId,
    term_no: t.term_no ?? i + 1,
    term_label: t.term_label?.toString().trim() || `Term ${i + 1}`,
    amount: Number(t.amount),
    due_date: t.due_date,
  }));
}

async function getFees() {
  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('tms_fee_structure')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      if (error.code === '42P01') return NextResponse.json({ success: true, data: [], count: 0 });
      console.error('Fees query error:', error);
      return NextResponse.json({ error: 'Failed to fetch fee structures' }, { status: 500 });
    }
    // Map transport year names (batch — embedding is unreliable in this codebase).
    const yearIds = [...new Set((data ?? []).map((r) => r.transport_year_id).filter(Boolean))];
    const yearMap = new Map<string, string>();
    if (yearIds.length) {
      const { data: years } = await supabase
        .from('tms_transport_year')
        .select('id, name')
        .in('id', yearIds as string[]);
      for (const y of years ?? []) yearMap.set(y.id, y.name);
    }
    const rows = (data ?? []).map((r) => ({
      ...r,
      transport_year_name: yearMap.get(r.transport_year_id) ?? null,
    }));
    return NextResponse.json({ success: true, data: rows, count: rows.length });
  } catch (e) {
    console.error('Fees API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function postFee(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_CREATE))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await request.json();
    const payload = buildFeeStructurePayload(body);

    if (!payload.name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    if (!payload.transport_year_id) {
      return NextResponse.json({ error: 'Transport year is required' }, { status: 400 });
    }
    const audience = payload.audience ?? 'student';
    if (audience !== 'student' && audience !== 'staff') {
      return NextResponse.json({ error: 'Audience must be student or staff' }, { status: 400 });
    }
    const total = Number(payload.total_amount);
    if (Number.isNaN(total) || total < 0) {
      return NextResponse.json({ error: 'Total amount must be a non-negative number' }, { status: 400 });
    }
    const splitCount = Number(payload.split_count ?? 1);
    if (!Number.isInteger(splitCount) || splitCount < 1) {
      return NextResponse.json({ error: 'Split count must be a positive integer' }, { status: 400 });
    }
    const termError = validateTerms(total, splitCount, body.terms);
    if (termError) return NextResponse.json({ error: termError }, { status: 400 });

    const supabase = createServiceRoleClient();
    const { data: parent, error } = await supabase
      .from('tms_fee_structure')
      .insert([{ ...payload, audience, split_count: splitCount, created_by: auth.userId, updated_by: auth.userId }])
      .select()
      .single();
    if (error) {
      console.error('Fee structure create error:', error);
      return NextResponse.json({ error: 'Failed to create fee structure' }, { status: 500 });
    }

    const { error: termErr } = await supabase
      .from('tms_fee_structure_term')
      .insert(buildTermRows(parent.id, body.terms as TermInput[]));
    if (termErr) {
      // manual rollback — no multi-statement transaction over PostgREST
      await supabase.from('tms_fee_structure').delete().eq('id', parent.id);
      console.error('Fee structure term create error:', termErr);
      return NextResponse.json({ error: 'Failed to save terms' }, { status: 500 });
    }

    await logActivity(auth, request, {
      module: 'fees',
      action: 'create',
      entityType: 'tms_fee_structure',
      entityId: parent.id,
      entityLabel: parent.name,
      description: `Created fee structure ${parent.name}`,
      changes: { after: parent },
    });
    return NextResponse.json({ success: true, data: parent, message: 'Fee structure created successfully' });
  } catch (e) {
    console.error('Fee structure create error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function putFee(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_EDIT))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await request.json();
    const id: string | undefined = body?.id;
    if (!id) return NextResponse.json({ error: 'Fee structure id is required' }, { status: 400 });

    const payload = buildFeeStructurePayload(body);
    const supabase = createServiceRoleClient();
    const { data: before } = await supabase
      .from('tms_fee_structure')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (!before) return NextResponse.json({ error: 'Fee structure not found' }, { status: 404 });

    // If terms are being replaced, validate against the effective total/split.
    const hasTerms = 'terms' in body;
    if (hasTerms) {
      const total = payload.total_amount != null ? Number(payload.total_amount) : Number(before.total_amount);
      const splitCount = payload.split_count != null ? Number(payload.split_count) : Number(before.split_count);
      const termError = validateTerms(total, splitCount, body.terms);
      if (termError) return NextResponse.json({ error: termError }, { status: 400 });
    }

    const { data: updated, error } = await supabase
      .from('tms_fee_structure')
      .update({ ...payload, updated_by: auth.userId })
      .eq('id', id)
      .select()
      .single();
    if (error) {
      console.error('Fee structure update error:', error);
      return NextResponse.json({ error: 'Failed to update fee structure' }, { status: 500 });
    }

    if (hasTerms) {
      await supabase.from('tms_fee_structure_term').delete().eq('fee_structure_id', id);
      const { error: termErr } = await supabase
        .from('tms_fee_structure_term')
        .insert(buildTermRows(id, body.terms as TermInput[]));
      if (termErr) {
        console.error('Fee structure term replace error:', termErr);
        return NextResponse.json({ error: 'Fee structure updated but failed to save terms' }, { status: 500 });
      }
    }

    await logActivity(auth, request, {
      module: 'fees',
      action: 'update',
      entityType: 'tms_fee_structure',
      entityId: id,
      entityLabel: updated.name,
      description: `Updated fee structure ${updated.name}`,
      changes: { before, after: updated },
    });
    return NextResponse.json({ success: true, data: updated, message: 'Fee structure updated successfully' });
  } catch (e) {
    console.error('Fee structure update error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function deleteFee(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_DELETE))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Fee structure id is required' }, { status: 400 });

    const supabase = createServiceRoleClient();
    const { data: existing } = await supabase
      .from('tms_fee_structure')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (!existing) return NextResponse.json({ error: 'Fee structure not found' }, { status: 404 });

    // Block delete if real bills were already generated (preserve traceability).
    const { count } = await supabase
      .from('tms_fee_bill')
      .select('id', { count: 'exact', head: true })
      .eq('fee_structure_id', id)
      .eq('status', 'generated');
    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: `Cannot delete — ${count} bills were already generated from this structure. Archive it instead.` },
        { status: 409 }
      );
    }

    const { error } = await supabase.from('tms_fee_structure').delete().eq('id', id);
    if (error) {
      console.error('Fee structure delete error:', error);
      return NextResponse.json({ error: 'Failed to delete fee structure' }, { status: 500 });
    }

    await logActivity(auth, request, {
      module: 'fees',
      action: 'delete',
      entityType: 'tms_fee_structure',
      entityId: id,
      entityLabel: existing.name,
      description: `Deleted fee structure ${existing.name}`,
      changes: { before: existing },
    });
    return NextResponse.json({ success: true, message: 'Fee structure deleted successfully' });
  } catch (e) {
    console.error('Fee structure delete error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth(() => getFees());
export const POST = withAuth((request, auth) => postFee(request, auth));
export const PUT = withAuth((request, auth) => putFee(request, auth));
export const DELETE = withAuth((request, auth) => deleteFee(request, auth));
