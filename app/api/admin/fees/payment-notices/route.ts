import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';

export interface PaymentNoticeRow {
  id: string;
  person_id: string;
  person_name: string;
  roll_number: string | null;
  status: 'running' | 'paid' | 'fined' | 'cancelled';
  started_at: string;
  expires_at: string;
  reminder_sent_at: string | null;
  fine_id: string | null;
}

// Keep each .in() under the gateway's URL-length ceiling (~500 ids silently 400s).
const CHUNK = 150;

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

async function list(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const year = new URL(request.url).searchParams.get('year');
    if (!year || year === 'all') {
      return NextResponse.json({ error: 'Select a specific transport year' }, { status: 400 });
    }
    const svc = createServiceRoleClient();
    const { data, error } = await svc
      .from('tms_fee_payment_notice')
      .select('id, person_id, status, started_at, expires_at, reminder_sent_at, fine_id')
      .eq('transport_year_id', year)
      .order('expires_at', { ascending: true });
    if (error) {
      if ((error as { code?: string }).code === '42P01') return NextResponse.json({ success: true, data: { rows: [] } });
      console.error('payment-notices list failed:', error.message);
      return NextResponse.json({ error: 'Failed to load payment notices' }, { status: 500 });
    }
    const notices = (data ?? []) as Array<Omit<PaymentNoticeRow, 'person_name' | 'roll_number'>>;
    const ids = [...new Set(notices.map((n) => n.person_id))];
    const names = new Map<string, { name: string; roll: string | null }>();
    for (let i = 0; i < ids.length; i += CHUNK) {
      const { data: lp, error: lErr } = await svc
        .from('learners_profiles')
        .select('id, first_name, last_name, roll_number')
        .in('id', ids.slice(i, i + CHUNK));
      if (lErr) {
        console.error('payment-notices learner lookup failed:', lErr.message);
        return NextResponse.json({ error: 'Failed to load payment notices' }, { status: 500 });
      }
      for (const l of (lp ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null; roll_number: string | null }>) {
        names.set(l.id, { name: [l.first_name, l.last_name].filter(Boolean).join(' ').trim(), roll: l.roll_number });
      }
    }
    const rows: PaymentNoticeRow[] = notices.map((n) => ({
      ...n,
      person_name: names.get(n.person_id)?.name || '—',
      roll_number: names.get(n.person_id)?.roll ?? null,
    }));
    return NextResponse.json({ success: true, data: { rows } });
  } catch (e) {
    console.error('payment-notices error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => list(request as NextRequest, auth));
