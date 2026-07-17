-- ─────────────────────────────────────────────────────────────────────────────
-- tms_approve_transport_vacate(request_id, approver) — the atomic approve.
--
-- In ONE transaction: locks the pending request (idempotency guard), cancels the
-- learner's not-yet-paid CURRENT-transport-year term bills on BOTH planes
-- (billing_student_bills + tms_fee_bill → status='cancelled', never deleted),
-- clears the learner's route/stop, and flips the request to 'approved'.
--
-- bus_required is deliberately NOT touched — MyJKKN owns it.
-- SECURITY DEFINER so it can write the MyJKKN-owned money + learner rows; the
-- calling route is the security boundary (it checks tms.vacate.manage first).
-- Target: kvizhngldtiuufknvehv. Idempotent (create or replace).
-- ─────────────────────────────────────────────────────────────────────────────

-- The ledger's status CHECK originally admitted only generated/staff_deferred/
-- error. An approved vacate must mark the term bill 'cancelled', and the student
-- transport-access gate keys off fb.status='generated' — so flipping the ledger
-- to 'cancelled' both records the cancellation AND drops the row out of the
-- overdue gate. Widen the check additively (all existing rows are 'generated').
alter table public.tms_fee_bill drop constraint if exists tms_fee_bill_status_check;
alter table public.tms_fee_bill add constraint tms_fee_bill_status_check
  check (status = any (array['generated','staff_deferred','error','cancelled']));

create or replace function public.tms_approve_transport_vacate(
  p_request_id uuid,
  p_approver   uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status      text;
  v_learner_id  uuid;
  v_year_id     uuid;
  v_ledger_ids  uuid[];
  v_money_ids   uuid[];
  v_count       int := 0;
begin
  -- 1. Lock the request row; guard idempotency.
  select status, learner_id, transport_year_id
    into v_status, v_learner_id, v_year_id
  from public.tms_transport_vacate_request
  where id = p_request_id
  for update;

  if not found then
    raise exception 'vacate_request_not_found' using errcode = 'P0002';
  end if;
  if v_status <> 'pending' then
    raise exception 'vacate_request_not_pending' using errcode = 'P0001';
  end if;

  -- 1b. Refuse a request whose snapshotted year is no longer the current one.
  -- The design decision is "current transport year ONLY". The request snapshots
  -- transport_year_id at submit time; if the year has since rolled over, approving
  -- would cancel the OLD year's bills (and clear the route) while leaving the NEW
  -- year's bills standing — money cancelled for the wrong year. The learner's own
  -- card is year-scoped, so a stale request is already invisible to them; refuse it
  -- here and make them re-request. Also fail-closed when NO year is current.
  if v_year_id is distinct from (select id from public.tms_transport_year where is_current limit 1) then
    raise exception 'vacate_request_stale_year' using errcode = 'P0001';
  end if;

  -- 2. Collect the not-fully-paid current-year term bills (both ids).
  select array_agg(fb.id), array_agg(fb.billing_student_bill_id)
    into v_ledger_ids, v_money_ids
  from public.tms_fee_bill fb
  join public.billing_student_bills bsb on bsb.id = fb.billing_student_bill_id
  where fb.person_id           = v_learner_id
    and fb.person_type         = 'learner'
    and fb.transport_year_id   = v_year_id
    and fb.status <> 'cancelled'
    and coalesce(lower(bsb.status), '') <> 'paid'
    and coalesce(bsb.balance_amount, bsb.final_amount) > 0;

  v_count := coalesce(array_length(v_ledger_ids, 1), 0);

  -- 3 + 4. Cancel the money rows and the ledger rows (status flip, never delete).
  if v_count > 0 then
    update public.billing_student_bills set status = 'cancelled' where id = any(v_money_ids);
    update public.tms_fee_bill          set status = 'cancelled' where id = any(v_ledger_ids);
  end if;

  -- 5. Clear the learner's route/stop assignment (bus_required untouched).
  update public.learners_profiles
     set transport_route_id = null,
         transport_stop_id  = null
   where id = v_learner_id;

  -- 6. Flip the request to approved.
  update public.tms_transport_vacate_request
     set status = 'approved',
         decided_by = p_approver,
         decided_at = now(),
         cancelled_bill_count = v_count,
         updated_at = now()
   where id = p_request_id;

  return jsonb_build_object('ok', true, 'cancelled_bill_count', v_count);
end;
$$;

grant execute on function public.tms_approve_transport_vacate(uuid, uuid) to authenticated, service_role;
