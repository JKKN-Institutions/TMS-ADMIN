-- Fee Concession apply function, v2 (review of 20260917120000):
--  * targets are given PER EXISTING LEDGER ROW (p_row_targets), because ~900
--    learners hold legacy per-term rows (3000 + 2500) under structures that are
--    now single-term — per-structure-term targets marked them all "review";
--  * "payment activity" matches the live bill-delete guard: receipts, pending
--    transaction items, status other than 'unpaid', or a payment_date;
--  * the money row is locked before it is checked;
--  * input sanity: null / duplicate terms, duplicate rows, totals that disagree.
-- Concurrency: a ledger row the caller did not see (e.g. inserted by cron 23
-- while the admin was looking at the list) has no target and raises review.
-- A row inserted after this function's loop is not covered; the overrides are
-- written first, so the next generator run bills the concession amount and the
-- tab shows the stray bill as Needs fix again.

drop function if exists public.tms_apply_fee_concession(uuid, uuid, jsonb, numeric, text, uuid);

create or replace function public.tms_apply_fee_concession(
  p_person_id uuid,
  p_rule_id uuid,
  p_terms jsonb,
  p_row_targets jsonb,
  p_reason text,
  p_actor uuid
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_rule public.tms_fee_concession_rule%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_actions jsonb := '[]'::jsonb;
  v_term jsonb;
  v_row record;
  v_sb record;
  v_terms_total numeric;
  v_rows_total numeric;
  v_target numeric;
  v_paid numeric;
  v_activity boolean;
  v_action text;
begin
  select * into v_rule from public.tms_fee_concession_rule where id = p_rule_id and is_active;
  if not found then
    raise exception 'Concession rule % is missing or inactive', p_rule_id;
  end if;
  if p_terms is null or jsonb_typeof(p_terms) <> 'array' or jsonb_array_length(p_terms) = 0 then
    raise exception 'Concession terms must be a non-empty array';
  end if;
  if p_row_targets is null or jsonb_typeof(p_row_targets) <> 'array' then
    raise exception 'Concession row targets must be an array';
  end if;
  if (select count(*) <> count(distinct (t->>'term_no')::int) from jsonb_array_elements(p_terms) t) then
    raise exception 'Concession terms repeat a term number';
  end if;
  if (select count(*) <> count(distinct (t->>'fee_bill_id')::uuid) from jsonb_array_elements(p_row_targets) t) then
    raise exception 'Concession row targets repeat a bill';
  end if;

  select coalesce(sum((t->>'amount')::numeric) filter (where (t->>'billable')::boolean), 0)
    into v_terms_total
  from jsonb_array_elements(p_terms) t;
  if v_terms_total <= 0 then
    raise exception 'Concession total must be positive (got %)', v_terms_total;
  end if;
  if jsonb_array_length(p_row_targets) > 0 then
    select coalesce(sum((t->>'target')::numeric), 0) into v_rows_total
    from jsonb_array_elements(p_row_targets) t;
    if v_rows_total <> v_terms_total then
      raise exception 'Row targets (%) do not add up to the concession total (%)', v_rows_total, v_terms_total;
    end if;
  end if;

  v_before := public.tms_fee_concession_snapshot(p_person_id, v_rule.transport_year_id);

  -- 1. Overrides first: without them cron 23 re-bills the full amount.
  for v_term in select * from jsonb_array_elements(p_terms) loop
    insert into public.tms_fee_override
      (person_id, person_type, transport_year_id, term_no, billable, amount, reason, created_by, concession_rule_id)
    values
      (p_person_id, 'learner', v_rule.transport_year_id, (v_term->>'term_no')::int,
       (v_term->>'billable')::boolean, (v_term->>'amount')::numeric, p_reason, p_actor, p_rule_id)
    on conflict (person_id, transport_year_id, term_no) do update
      set billable = excluded.billable,
          amount = excluded.amount,
          reason = excluded.reason,
          concession_rule_id = excluded.concession_rule_id,
          updated_at = now(),
          updated_by = p_actor;
  end loop;

  -- 2. Every target must name a live ledger row of this person and year.
  if exists (
    select 1 from jsonb_array_elements(p_row_targets) t
    where not exists (
      select 1 from public.tms_fee_bill fb
      where fb.id = (t->>'fee_bill_id')::uuid
        and fb.person_id = p_person_id
        and fb.transport_year_id = v_rule.transport_year_id)
  ) then
    raise exception 'CONCESSION_REVIEW: bills changed since the list was loaded - refresh and try again';
  end if;

  -- 3. Correct every existing ledger row.
  for v_row in
    select fb.id as fb_id, fb.term_no, fb.amount as fb_amount, fb.status as fb_status,
           fb.billing_student_bill_id as sb_id
    from public.tms_fee_bill fb
    where fb.person_id = p_person_id and fb.transport_year_id = v_rule.transport_year_id
    order by fb.term_no
    for update
  loop
    select (t->>'target')::numeric into v_target
    from jsonb_array_elements(p_row_targets) t
    where (t->>'fee_bill_id')::uuid = v_row.fb_id;
    if not found then
      raise exception 'CONCESSION_REVIEW: term % bill appeared after the list was loaded - refresh and try again', v_row.term_no;
    end if;

    if v_row.fb_status in ('cancelled', 'error') then
      raise exception 'CONCESSION_REVIEW: term % bill is %', v_row.term_no, v_row.fb_status;
    end if;
    if v_row.sb_id is null then
      raise exception 'CONCESSION_REVIEW: term % bill has no money row', v_row.term_no;
    end if;

    -- Lock the money row before judging it, so a payment cannot slip in between.
    select sb.id, sb.final_amount, sb.status, sb.payment_date into v_sb
    from public.billing_student_bills sb
    where sb.id = v_row.sb_id
    for update;
    if not found then
      raise exception 'CONCESSION_REVIEW: term % bill has no money row', v_row.term_no;
    end if;
    if v_sb.status = 'cancelled' then
      raise exception 'CONCESSION_REVIEW: term % money bill is cancelled', v_row.term_no;
    end if;

    select coalesce(sum(amount_paid), 0) into v_paid
    from public.billing_receipt_items where bill_id = v_sb.id;
    -- Same test as the live bill-delete guard (tms_fee_bill_cleanup_linked_billing).
    v_activity := v_paid > 0
      or v_sb.status is distinct from 'unpaid'
      or v_sb.payment_date is not null
      or exists (select 1 from public.payment_transaction_items where bill_id = v_sb.id);

    if v_target is null then
      if v_activity then
        raise exception 'CONCESSION_REVIEW: term % is not charged under the concession but has payment activity', v_row.term_no;
      end if;
      -- tms_fee_bill cannot be deleted directly; the FK cascade removes it.
      delete from public.billing_student_bills where id = v_sb.id;
      v_action := 'deleted';
    elsif v_sb.final_amount = v_target then
      if v_row.fb_amount <> v_target then
        update public.tms_fee_bill set amount = v_target where id = v_row.fb_id;
        v_action := 'ledger_aligned';
      else
        v_action := 'unchanged';
      end if;
    elsif v_activity then
      raise exception 'CONCESSION_REVIEW: term % has Rs % paid on a Rs % % bill; concession is Rs %',
        v_row.term_no, v_paid, v_sb.final_amount, v_sb.status, v_target;
    else
      update public.billing_student_bills
        set unit_amount = v_target, total_amount = v_target, final_amount = v_target
        where id = v_sb.id;
      update public.tms_fee_bill set amount = v_target where id = v_row.fb_id;
      v_action := 'repriced';
    end if;

    v_actions := v_actions || jsonb_build_array(jsonb_build_object(
      'fee_bill_id', v_row.fb_id, 'term_no', v_row.term_no, 'action', v_action));
  end loop;

  v_after := public.tms_fee_concession_snapshot(p_person_id, v_rule.transport_year_id);

  insert into public.tms_fee_concession_log
    (rule_id, person_id, transport_year_id, terms, target_total, before, after, actions, actor)
  values
    (p_rule_id, p_person_id, v_rule.transport_year_id,
     jsonb_build_object('terms', p_terms, 'row_targets', p_row_targets),
     v_terms_total, v_before, v_after, v_actions, p_actor);

  return jsonb_build_object('actions', v_actions);
end;
$$;

revoke execute on function public.tms_apply_fee_concession(uuid, uuid, jsonb, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function public.tms_apply_fee_concession(uuid, uuid, jsonb, jsonb, text, uuid) to service_role;
