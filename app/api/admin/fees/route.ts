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

interface BandInput {
  study_years?: unknown;
  total_amount?: number | string;
  label?: string | null;
  band_order?: number;
  terms?: unknown;
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

// Tiered structures: ≥1 band, each band's terms valid & summing to its total, and
// study_years DISJOINT across bands (a year can belong to only one band).
function validateBands(bands: unknown): string | null {
  if (!Array.isArray(bands) || bands.length === 0) return 'At least one year band is required';
  const seenYears = new Set<number>();
  for (const [i, b] of (bands as BandInput[]).entries()) {
    const years = Array.isArray(b.study_years) ? (b.study_years as unknown[]).map(Number) : [];
    if (!years.length || years.some((y) => !Number.isInteger(y) || y < 1)) {
      return `Band ${i + 1}: choose at least one valid year of study`;
    }
    for (const y of years) {
      if (seenYears.has(y)) return `Year ${y} is in more than one band — each year can belong to only one band`;
      seenYears.add(y);
    }
    const total = Number(b.total_amount);
    if (Number.isNaN(total) || total < 0) return `Band ${i + 1}: total must be a non-negative number`;
    const termErr = validateTerms(total, Array.isArray(b.terms) ? b.terms.length : 0, b.terms);
    if (termErr) return `Band ${i + 1}: ${termErr}`;
  }
  return null;
}

function buildTermRows(feeStructureId: string, terms: TermInput[], yearBandId: string | null = null) {
  return terms.map((t, i) => ({
    fee_structure_id: feeStructureId,
    year_band_id: yearBandId,
    term_no: t.term_no ?? i + 1,
    term_label: t.term_label?.toString().trim() || `Term ${i + 1}`,
    amount: Number(t.amount),
    due_date: t.due_date,
  }));
}

// Insert each band + its terms for a tiered structure. Bands are few; insert one
// at a time so we can attach each band's terms to its generated id.
async function writeBands(
  supabase: ReturnType<typeof createServiceRoleClient>,
  feeStructureId: string,
  bands: BandInput[]
): Promise<string | null> {
  for (const [i, b] of bands.entries()) {
    const years = (b.study_years as unknown[]).map(Number);
    const terms = b.terms as TermInput[];
    const { data: band, error: bErr } = await supabase
      .from('tms_fee_structure_year_band')
      .insert([{
        fee_structure_id: feeStructureId,
        band_order: b.band_order ?? i + 1,
        label: b.label?.toString().trim() || null,
        study_years: years,
        total_amount: Number(b.total_amount),
        split_count: terms.length,
      }])
      .select('id')
      .single();
    if (bErr || !band) return bErr?.message || 'Failed to save year band';
    const { error: tErr } = await supabase
      .from('tms_fee_structure_term')
      .insert(buildTermRows(feeStructureId, terms, band.id));
    if (tErr) return tErr.message || 'Failed to save year band terms';
  }
  return null;
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
    // Lightweight band summary for tiered rows (so the list can show a range).
    const tieredIds = (data ?? []).filter((r) => r.fee_mode === 'tiered').map((r) => r.id);
    const bandsByFs = new Map<string, Array<{ study_years: number[]; total_amount: number }>>();
    if (tieredIds.length) {
      const { data: bandRows } = await supabase
        .from('tms_fee_structure_year_band')
        .select('fee_structure_id, study_years, total_amount, band_order')
        .in('fee_structure_id', tieredIds)
        .order('band_order', { ascending: true });
      for (const b of bandRows ?? []) {
        const arr = bandsByFs.get(b.fee_structure_id) ?? [];
        arr.push({ study_years: b.study_years, total_amount: Number(b.total_amount) });
        bandsByFs.set(b.fee_structure_id, arr);
      }
    }
    const rows = (data ?? []).map((r) => ({
      ...r,
      transport_year_name: yearMap.get(r.transport_year_id) ?? null,
      bands: r.fee_mode === 'tiered' ? bandsByFs.get(r.id) ?? [] : undefined,
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
    const feeMode = payload.fee_mode === 'tiered' ? 'tiered' : 'flat';
    if (feeMode === 'tiered' && audience !== 'student') {
      return NextResponse.json({ error: 'Year-of-study tiers apply to learners only' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    if (feeMode === 'tiered') {
      const bandErr = validateBands(body.bands);
      if (bandErr) return NextResponse.json({ error: bandErr }, { status: 400 });

      // Structure-level total/split are unused in tiered mode (each band owns its own).
      const { data: parent, error } = await supabase
        .from('tms_fee_structure')
        .insert([{ ...payload, audience, fee_mode: 'tiered', total_amount: 0, split_count: 1, created_by: auth.userId, updated_by: auth.userId }])
        .select()
        .single();
      if (error) {
        console.error('Fee structure create error:', error);
        return NextResponse.json({ error: 'Failed to create fee structure' }, { status: 500 });
      }
      const writeErr = await writeBands(supabase, parent.id, body.bands as BandInput[]);
      if (writeErr) {
        await supabase.from('tms_fee_structure').delete().eq('id', parent.id); // cascades bands + terms
        console.error('Fee band create error:', writeErr);
        return NextResponse.json({ error: 'Failed to save year bands' }, { status: 500 });
      }
      await logActivity(auth, request, {
        module: 'fees', action: 'create', entityType: 'tms_fee_structure',
        entityId: parent.id, entityLabel: parent.name,
        description: `Created tiered fee structure ${parent.name}`, changes: { after: parent },
      });
      return NextResponse.json({ success: true, data: parent, message: 'Fee structure created successfully' });
    }

    // ── flat ──────────────────────────────────────────────────────────────────
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

    const { data: parent, error } = await supabase
      .from('tms_fee_structure')
      .insert([{ ...payload, audience, fee_mode: 'flat', split_count: splitCount, created_by: auth.userId, updated_by: auth.userId }])
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
      await supabase.from('tms_fee_structure').delete().eq('id', parent.id);
      console.error('Fee structure term create error:', termErr);
      return NextResponse.json({ error: 'Failed to save terms' }, { status: 500 });
    }

    await logActivity(auth, request, {
      module: 'fees', action: 'create', entityType: 'tms_fee_structure',
      entityId: parent.id, entityLabel: parent.name,
      description: `Created fee structure ${parent.name}`, changes: { after: parent },
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

    // Effective mode = the new fee_mode if provided, else the stored one.
    const feeMode = (payload.fee_mode ?? before.fee_mode) === 'tiered' ? 'tiered' : 'flat';
    const hasTerms = 'terms' in body;
    const hasBands = 'bands' in body;

    if (feeMode === 'tiered') {
      if (hasBands) {
        const bandErr = validateBands(body.bands);
        if (bandErr) return NextResponse.json({ error: bandErr }, { status: 400 });
      }
      // tiered structures don't use the structure-level total/split.
      const { data: updated, error } = await supabase
        .from('tms_fee_structure')
        .update({ ...payload, fee_mode: 'tiered', total_amount: 0, split_count: 1, updated_by: auth.userId })
        .eq('id', id)
        .select()
        .single();
      if (error) {
        console.error('Fee structure update error:', error);
        return NextResponse.json({ error: 'Failed to update fee structure' }, { status: 500 });
      }
      if (hasBands) {
        // Replace all children: clear any flat terms AND existing bands (cascade).
        await supabase.from('tms_fee_structure_term').delete().eq('fee_structure_id', id).is('year_band_id', null);
        await supabase.from('tms_fee_structure_year_band').delete().eq('fee_structure_id', id);
        const writeErr = await writeBands(supabase, id, body.bands as BandInput[]);
        if (writeErr) {
          console.error('Fee band replace error:', writeErr);
          return NextResponse.json({ error: 'Fee structure updated but failed to save year bands' }, { status: 500 });
        }
      }
      await logActivity(auth, request, {
        module: 'fees', action: 'update', entityType: 'tms_fee_structure',
        entityId: id, entityLabel: updated.name,
        description: `Updated tiered fee structure ${updated.name}`, changes: { before, after: updated },
      });
      return NextResponse.json({ success: true, data: updated, message: 'Fee structure updated successfully' });
    }

    // ── flat ──────────────────────────────────────────────────────────────────
    if (hasTerms) {
      const total = payload.total_amount != null ? Number(payload.total_amount) : Number(before.total_amount);
      const splitCount = payload.split_count != null ? Number(payload.split_count) : Number(before.split_count);
      const termError = validateTerms(total, splitCount, body.terms);
      if (termError) return NextResponse.json({ error: termError }, { status: 400 });
    }

    const { data: updated, error } = await supabase
      .from('tms_fee_structure')
      .update({ ...payload, fee_mode: 'flat', updated_by: auth.userId })
      .eq('id', id)
      .select()
      .single();
    if (error) {
      console.error('Fee structure update error:', error);
      return NextResponse.json({ error: 'Failed to update fee structure' }, { status: 500 });
    }

    if (hasTerms) {
      // Switching to flat also clears any leftover bands (cascade their terms).
      await supabase.from('tms_fee_structure_year_band').delete().eq('fee_structure_id', id);
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
      module: 'fees', action: 'update', entityType: 'tms_fee_structure',
      entityId: id, entityLabel: updated.name,
      description: `Updated fee structure ${updated.name}`, changes: { before, after: updated },
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
      module: 'fees', action: 'delete', entityType: 'tms_fee_structure',
      entityId: id, entityLabel: existing.name,
      description: `Deleted fee structure ${existing.name}`, changes: { before: existing },
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
