/**
 * Gathers everything the removal-bill message needs, for one staffer or for all
 * of them.
 *
 * Shared deliberately between the banner endpoint and the one-shot sender: the
 * text a staffer reads on screen and the text stored in their notification must
 * be the same sentence, and the only way to guarantee that is to build both from
 * one loader and one copy function.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { emailIlikePattern } from '@/lib/identity/email-match';
import { resolveStaffId } from '@/lib/identity/staff-lookup';
import { buildRemovalBillCopy, type RemovalBillNotice } from './incharge-removal-copy';

export interface RemovalNoticeRecord {
  assignmentId: string;
  staffId: string;
  profileId: string | null;
  staffEmail: string;
  notice: RemovalBillNotice;
  title: string;
  body: string;
}

/**
 * How many in-charges the route had when it went unmarked.
 *
 * Counted as "removed on this route" plus "still active on this route" rather
 * than read from the assignment table alone, because removal sets is_active
 * false — after the fact the table cannot distinguish a colleague who was
 * removed alongside them from one who left months ago. Getting this wrong turns
 * a shared failure into a personal accusation, so it is computed, not guessed.
 */
function countInchargesAtRemoval(
  routeId: string,
  removedByRoute: Map<string, number>,
  activeByRoute: Map<string, number>,
): number {
  return (removedByRoute.get(routeId) ?? 0) + (activeByRoute.get(routeId) ?? 0);
}

/**
 * Loads notices for every in-charge removed AND billed. Pass a profileId to
 * narrow to one staffer (the banner case).
 *
 * Only 'billed' strikes qualify: a removal blocked for want of a bill has
 * nothing to explain and no amount to quote.
 */
export async function loadRemovalNotices(
  svc: SupabaseClient,
  opts: { profileId?: string } = {},
): Promise<RemovalNoticeRecord[]> {
  const { data: strikes, error } = await svc
    .from('tms_incharge_attendance_strike')
    .select('assignment_id, staff_email, route_id, missed_dates, removed_at, billing_status')
    .not('removed_at', 'is', null)
    .eq('billing_status', 'billed');
  if (error || !strikes?.length) return [];

  const rows = strikes as Array<{
    assignment_id: string;
    staff_email: string;
    route_id: string | null;
    missed_dates: string[] | null;
  }>;

  const routeIds = [...new Set(rows.map((r) => r.route_id).filter((id): id is string => !!id))];

  const [routesRes, activeRes] = await Promise.all([
    svc.from('tms_route').select('id, route_number, route_name').in('id', routeIds),
    svc
      .from('tms_staff_route_assignment')
      .select('route_id')
      .eq('is_active', true)
      .in('route_id', routeIds),
  ]);

  const routeById = new Map(
    ((routesRes.data ?? []) as Array<{ id: string; route_number: string; route_name: string }>).map(
      (r) => [r.id, r],
    ),
  );

  const activeByRoute = new Map<string, number>();
  for (const a of (activeRes.data ?? []) as Array<{ route_id: string }>) {
    activeByRoute.set(a.route_id, (activeByRoute.get(a.route_id) ?? 0) + 1);
  }
  const removedByRoute = new Map<string, number>();
  for (const r of rows) {
    if (r.route_id) removedByRoute.set(r.route_id, (removedByRoute.get(r.route_id) ?? 0) + 1);
  }

  const out: RemovalNoticeRecord[] = [];

  for (const row of rows) {
    // Resolve the profile first so a narrowed load can skip the rest of the work.
    const { data: profile } = await svc
      .from('profiles')
      .select('id')
      .ilike('email', emailIlikePattern(row.staff_email))
      .maybeSingle();
    const profileId = (profile?.id as string | undefined) ?? null;
    if (opts.profileId && profileId !== opts.profileId) continue;

    const staffId = await resolveStaffId(svc, { email: row.staff_email, profileId });
    if (!staffId) continue;

    const { data: staffRow } = await svc
      .from('staff')
      .select('transport_stop_id')
      .eq('id', staffId)
      .maybeSingle();

    const stopId = (staffRow?.transport_stop_id as string | null) ?? null;
    let stopName: string | null = null;
    if (stopId) {
      const { data: stop } = await svc
        .from('tms_route_stop')
        .select('stop_name')
        .eq('id', stopId)
        .maybeSingle();
      stopName = (stop?.stop_name as string | null) ?? null;
    }

    // The bill raised by the removal. Ordered newest-first so a re-billed
    // staffer is quoted the amount they actually owe now.
    const { data: bill } = await svc
      .from('tms_fee_bill')
      .select('amount, due_date')
      .eq('person_id', staffId)
      .eq('person_type', 'staff')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!bill) continue;

    const route = row.route_id ? routeById.get(row.route_id) : undefined;

    const notice: RemovalBillNotice = {
      routeNumber: route?.route_number ?? '—',
      routeName: route?.route_name ?? 'your route',
      inchargeCount: row.route_id
        ? countInchargesAtRemoval(row.route_id, removedByRoute, activeByRoute)
        : 1,
      missedDates: (row.missed_dates ?? []).map(String),
      amount: Number(bill.amount),
      dueDate: String(bill.due_date),
      stopName,
    };

    const copy = buildRemovalBillCopy(notice);
    out.push({
      assignmentId: row.assignment_id,
      staffId,
      profileId,
      staffEmail: row.staff_email,
      notice,
      title: copy.title,
      body: copy.body,
    });
  }

  return out;
}
