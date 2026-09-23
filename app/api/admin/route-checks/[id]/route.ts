import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { requirePerm } from '@/lib/auth/require-perm';
import { UUID_RE, selectIn, staffName } from '@/lib/route-check/admin';

function idFrom(request: NextRequest) {
  // /api/admin/route-checks/<id>
  return new URL(request.url).pathname.split('/').filter(Boolean)[3] ?? '';
}

type PersonRow = {
  id: string;
  person_kind: 'learner' | 'staff' | 'manual';
  learner_id: string | null;
  staff_id: string | null;
  manual_type: string | null;
  manual_name: string | null;
  matched_by: string | null;
  scanned_code: string | null;
  outcome: string;
  on_route: boolean | null;
  booked: boolean | null;
  fee_state: string | null;
  notes: string | null;
  created_at: string;
  booking_state: string | null;
  fee_fine_id: string | null;
  booking_fine_id: string | null;
  fine_note: string | null;
};

// GET: one route check — header, counts, route/bus labels and every person line.
async function getReport(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.ROUTE_CHECK_MANAGE))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const id = idFrom(request);
    if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Route check not found' }, { status: 404 });

    const svc = createServiceRoleClient();
    const { data: check, error } = await svc.from('tms_route_check').select('*').eq('id', id).maybeSingle();
    if (error) {
      console.error('route-check report read error:', error);
      return NextResponse.json({ error: 'Failed to load route check' }, { status: 500 });
    }
    if (!check) return NextResponse.json({ error: 'Route check not found' }, { status: 404 });

    const [routeQ, vehicleQ, checkerQ, personsQ] = await Promise.all([
      svc.from('tms_route').select('id, route_number, route_name').eq('id', check.route_id).maybeSingle(),
      check.vehicle_id
        ? svc.from('tms_vehicle').select('id, registration_number, model').eq('id', check.vehicle_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      svc.from('profiles').select('id, full_name, email').eq('id', check.checker_id).maybeSingle(),
      svc
        .from('tms_route_check_person')
        .select('id, person_kind, learner_id, staff_id, manual_type, manual_name, matched_by, scanned_code, outcome, on_route, booked, fee_state, notes, created_at, booking_state, fee_fine_id, booking_fine_id, fine_note')
        .eq('check_id', id)
        .order('created_at', { ascending: true }),
    ]);
    for (const [label, q] of [['route', routeQ], ['vehicle', vehicleQ], ['checker', checkerQ], ['persons', personsQ]] as const) {
      if (q.error) {
        console.error(`route-check report ${label} error:`, q.error);
        return NextResponse.json({ error: 'Failed to load route check' }, { status: 500 });
      }
    }
    const persons = (personsQ.data ?? []) as PersonRow[];

    const [learners, staff, fines] = await Promise.all([
      selectIn<{ id: string; first_name: string | null; last_name: string | null; roll_number: string | null; register_number: string | null }>(
        svc, 'learners_profiles', 'id, first_name, last_name, roll_number, register_number', 'id',
        persons.map((p) => p.learner_id ?? '')
      ),
      selectIn<{ id: string; first_name: string | null; last_name: string | null; staff_id: string | null; designation: string | null }>(
        svc, 'staff', 'id, first_name, last_name, staff_id, designation', 'id',
        persons.map((p) => p.staff_id ?? '')
      ),
      // The fine's live state, so the report shows whether it still stands.
      // Fines are never waived from here: cancelling one means cancelling its
      // bill in MyJKKN (fn_cancel_student_bill, which needs a supporting
      // document) — the bill-cancellation guard must never be bypassed.
      selectIn<{ id: string; status: string; fine_amount: number | string }>(
        svc, 'tms_fee_fine', 'id, status, fine_amount', 'id',
        persons.flatMap((p) => [p.fee_fine_id ?? '', p.booking_fine_id ?? ''])
      ),
    ]);
    const learnerById = new Map(learners.map((l) => [l.id, l]));
    const staffById = new Map(staff.map((s) => [s.id, s]));
    const fineById = new Map(fines.map((f) => [f.id, { id: f.id, status: f.status, amount: Number(f.fine_amount) }]));
    const fineOf = (fid: string | null) => (fid ? fineById.get(fid) ?? null : null);

    const people = persons.map((p) => {
      let name: string | null = null;
      let identifier: string | null = null;
      let designation: string | null = null;
      if (p.person_kind === 'learner' && p.learner_id) {
        const l = learnerById.get(p.learner_id);
        name = l ? staffName(l) || null : null;
        identifier = l?.roll_number ?? l?.register_number ?? null;
      } else if (p.person_kind === 'staff' && p.staff_id) {
        const s = staffById.get(p.staff_id);
        name = s ? staffName(s) || null : null;
        identifier = s?.staff_id ?? null;
        designation = s?.designation ?? null;
      } else {
        name = p.manual_name;
      }
      return {
        id: p.id,
        kind: p.person_kind,
        learnerId: p.learner_id,
        staffId: p.staff_id,
        name,
        identifier,
        code: identifier,
        designation,
        manualType: p.manual_type,
        matchedBy: p.matched_by,
        scannedCode: p.scanned_code,
        outcome: p.outcome,
        onRoute: p.on_route,
        booked: p.booked,
        feeState: p.fee_state,
        notes: p.notes,
        createdAt: p.created_at,
        bookingState: p.booking_state,
        feeFineId: p.fee_fine_id,
        bookingFineId: p.booking_fine_id,
        fineNote: p.fine_note,
        feeFine: fineOf(p.fee_fine_id),
        bookingFine: fineOf(p.booking_fine_id),
      };
    });

    const route = routeQ.data as { id: string; route_number: string | null; route_name: string | null } | null;
    const vehicle = vehicleQ.data as { id: string; registration_number: string | null; model: string | null } | null;
    const checker = checkerQ.data as { id: string; full_name: string | null; email: string | null } | null;
    return NextResponse.json({
      success: true,
      data: {
        id: check.id,
        status: check.status,
        checkDate: check.check_date,
        leg: check.leg,
        route: route ? { id: route.id, routeNumber: route.route_number, routeName: route.route_name } : null,
        bus: vehicle ? { id: vehicle.id, registration: vehicle.registration_number, model: vehicle.model } : null,
        checker: { id: check.checker_id, name: checker?.full_name ?? null, email: checker?.email ?? null },
        headcount: check.headcount,
        unknownCount: check.unknown_count,
        notes: check.notes,
        counts: {
          registered: check.registered,
          booked: check.booked,
          present: check.present,
          unpaid: check.unpaid,
          withoutBooking: check.without_booking,
          notOnRoute: check.not_on_route,
        },
        startedAt: check.started_at,
        submittedAt: check.submitted_at,
        people,
      },
    });
  } catch (e) {
    console.error('route-check report error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getReport(request, auth));
