-- ─────────────────────────────────────────────────────────────────────────────
-- tms_student_transport_access(profile_id) — payment gate for the learner portal.
--
-- Single source of truth for "is this learner allowed into /student/*?" Used by
-- proxy.ts (the hard gate) and /api/admin/.. the student fees page. Must be
-- SECURITY DEFINER: proxy.ts uses a user-scoped client and learners_profiles /
-- tms_fee_bill / billing_student_bills are all RLS-deny, so a normal call sees
-- nothing — same reason proxy uses the user_has_permission RPC.
--
-- Rule "not behind": blocked iff, for the CURRENT transport year, a term whose
-- due_date has passed is not fully paid. Not-yet-due terms never block. No bill,
-- no current year, or not bus_required → allowed.
--
-- Idempotent (create or replace).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.tms_student_transport_access(p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_learner_id   uuid;
  v_bus_required boolean;
  v_year_id      uuid;
  v_year_name    text;
  v_terms        jsonb;
  v_overdue      int := 0;
  v_total_owed   numeric := 0;
  v_bill_count   int := 0;
begin
  select id, coalesce(bus_required, false)
    into v_learner_id, v_bus_required
  from learners_profiles
  where profile_id = p_profile_id
  limit 1;

  -- Not a learner, or not a transport user → no obligation.
  if v_learner_id is null or v_bus_required = false then
    return jsonb_build_object('allowed', true, 'reason', 'no_transport_obligation',
                              'terms', '[]'::jsonb, 'overdue_count', 0, 'total_owed', 0);
  end if;

  select id, name into v_year_id, v_year_name
  from tms_transport_year
  where is_current = true
  limit 1;

  if v_year_id is null then
    return jsonb_build_object('allowed', true, 'reason', 'no_current_transport_year',
                              'terms', '[]'::jsonb, 'overdue_count', 0, 'total_owed', 0);
  end if;

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'term_no', fb.term_no,
      'amount', b.final_amount,
      'balance', b.balance_amount,
      'due_date', b.due_date,
      'status', b.status,
      'paid', (b.status = 'paid'),
      'overdue', (b.due_date < current_date and b.status in ('unpaid','partially_paid','overdue'))
    ) order by fb.term_no), '[]'::jsonb),
    count(*) filter (where b.due_date < current_date and b.status in ('unpaid','partially_paid','overdue')),
    coalesce(sum(b.balance_amount) filter (where b.due_date < current_date and b.status in ('unpaid','partially_paid','overdue')), 0),
    count(*)
  into v_terms, v_overdue, v_total_owed, v_bill_count
  from tms_fee_bill fb
  join billing_student_bills b on b.id = fb.billing_student_bill_id
  where fb.person_id = v_learner_id
    and fb.person_type = 'learner'
    and fb.transport_year_id = v_year_id
    and fb.status = 'generated';

  return jsonb_build_object(
    'allowed', (v_overdue = 0),
    'reason', case when v_overdue > 0 then 'overdue'
                   when v_bill_count > 0 then 'current'
                   else 'no_bills' end,
    'transport_year_id', v_year_id,
    'transport_year_name', v_year_name,
    'overdue_count', v_overdue,
    'total_owed', v_total_owed,
    'terms', v_terms
  );
end;
$$;

grant execute on function public.tms_student_transport_access(uuid) to authenticated, service_role;
