-- Atomic apply for the in-charge bill review (fixes: cancel-then-record gap, racing runs).
create or replace function public.tms_incharge_bill_review_keep_applied()
returns trigger language plpgsql as $$
begin
  -- An applied row is the permanent record of a real cancellation: never rewrite it.
  -- Returning OLD turns any UPDATE (incl. an upsert's DO UPDATE) into a no-op.
  if old.applied then
    return old;
  end if;
  return new;
end $$;

drop trigger if exists trg_tms_incharge_bill_review_keep_applied on public.tms_incharge_bill_review;
create trigger trg_tms_incharge_bill_review_keep_applied
  before update on public.tms_incharge_bill_review
  for each row execute function public.tms_incharge_bill_review_keep_applied();

create or replace function public.tms_incharge_apply_bill_cancel(p_person_id uuid, p_month date, p_transport_year_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row_id uuid;
  v_ids uuid[];
  v_amount numeric(12,2);
begin
  select id into v_row_id
    from tms_incharge_bill_review
   where person_id = p_person_id and month = p_month
     and not applied and outcome = 'passed' and mode = 'auto'
   for update;
  if v_row_id is null then
    return jsonb_build_object('status', 'not_applicable', 'cancelled', 0, 'amount', 0, 'bill_ids', '[]'::jsonb);
  end if;

  with c as (
    update tms_fee_bill
       set status = 'cancelled'
     where person_id = p_person_id
       and person_type = 'staff'
       and transport_year_id = p_transport_year_id
       and status in ('staff_deferred', 'generated')
       and paid_at is null
    returning id, amount
  )
  select coalesce(array_agg(id), '{}'::uuid[]), coalesce(sum(amount), 0)
    into v_ids, v_amount
    from c;

  update tms_incharge_bill_review
     set applied = true,
         applied_at = now(),
         bill_action = case when cardinality(v_ids) > 0 then 'cancelled' else 'none' end,
         bill_ids = case when cardinality(v_ids) > 0 then v_ids else bill_ids end,
         cancelled_amount = v_amount,
         error = null
   where id = v_row_id;

  return jsonb_build_object('status', 'applied', 'cancelled', cardinality(v_ids), 'amount', v_amount, 'bill_ids', to_jsonb(v_ids));
end $$;
revoke all on function public.tms_incharge_apply_bill_cancel(uuid, date, uuid) from public, anon, authenticated;
grant execute on function public.tms_incharge_apply_bill_cancel(uuid, date, uuid) to service_role;
