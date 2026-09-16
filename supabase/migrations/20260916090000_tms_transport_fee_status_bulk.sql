-- Fee status for MANY learners in one call: the set-based twin of
-- tms_transport_access_for_learner (same bills/lines rules), for the boarding
-- Attendance roster, which needs ~1,800 learners at once.
-- Spec: docs/superpowers/specs/2026-09-16-attendance-scan-tracking-design.md
create or replace function public.tms_transport_fee_status_bulk(p_learner_ids uuid[])
returns table (
  learner_id    uuid,
  allowed       boolean,
  reason        text,
  overdue_count integer,
  total_owed    numeric,
  unpaid_amount numeric,
  term1_paid    boolean,
  has_bills     boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with ids as (
    select lp.id, coalesce(lp.bus_required, false) as bus_required
      from learners_profiles lp
     where lp.id = any(p_learner_ids)
  ),
  yr as (select id from tms_transport_year where is_current = true limit 1),
  bills as (
    select fb.person_id as lid, b.id, b.final_amount, b.balance_amount, b.due_date, b.status
      from tms_fee_bill fb
      join billing_student_bills b on b.id = fb.billing_student_bill_id
      join ids i on i.id = fb.person_id and i.bus_required
     where fb.person_type = 'learner'
       and fb.transport_year_id = (select id from yr)
       and fb.status = 'generated'
       and b.status is distinct from 'cancelled'
  ),
  lines as (
    -- Instalments when the bill has them …
    select bl.lid, st.sequence_no::int as line_no, st.outstanding as balance,
           st.due_date, st.is_settled as paid,
           (st.due_date < current_date and not st.is_settled) as overdue
      from bills bl
      cross join lateral billing_bill_instalment_state(bl.id) st
     where exists (select 1 from billing_bill_instalments i where i.bill_id = bl.id)
    union all
    -- … else the bill itself.
    select bl.lid, 1, bl.balance_amount, bl.due_date,
           (bl.status = 'paid'),
           (bl.due_date < current_date and bl.status in ('unpaid','partially_paid','overdue'))
      from bills bl
     where not exists (select 1 from billing_bill_instalments i where i.bill_id = bl.id)
  ),
  -- Term 1 = the first line by (due_date, line_no). Every line tied at that key
  -- must be settled: the key is NOT unique and a plain limit 1 can pick the paid
  -- row of a tie, clearing the gate for someone who still owes the other.
  min_key as (
    select distinct on (lid) lid, due_date as d, line_no as n
      from lines order by lid, due_date, line_no
  ),
  term1 as (
    select l.lid, bool_and(coalesce(l.paid, false)) as paid
      from lines l
      join min_key k on k.lid = l.lid
       and l.due_date is not distinct from k.d
       and l.line_no  is not distinct from k.n
     group by l.lid
  ),
  agg as (
    select l.lid,
           count(*) filter (where l.overdue)::int as overdue_count,
           coalesce(sum(l.balance) filter (where l.overdue), 0) as total_owed,
           coalesce(sum(l.balance) filter (where not coalesce(l.paid, false)), 0) as unpaid_amount
      from lines l group by l.lid
  )
  select i.id,
         case
           when not i.bus_required then true
           when (select count(*) from yr) = 0 then true
           when a.lid is null then false                    -- billed nothing: term1_not_billed
           when not coalesce(t.paid, false) then false
           when coalesce(a.overdue_count, 0) > 0 then false
           else true
         end,
         case
           when not i.bus_required then 'no_transport_obligation'
           when (select count(*) from yr) = 0 then 'no_current_transport_year'
           when a.lid is null then 'term1_not_billed'
           when not coalesce(t.paid, false) then 'term1_unpaid'
           when coalesce(a.overdue_count, 0) > 0 then 'overdue'
           else 'current'
         end,
         coalesce(a.overdue_count, 0),
         coalesce(a.total_owed, 0),
         coalesce(a.unpaid_amount, 0),
         coalesce(t.paid, false),
         (a.lid is not null)
    from ids i
    left join agg a on a.lid = i.id
    left join term1 t on t.lid = i.id;
$$;

revoke execute on function public.tms_transport_fee_status_bulk(uuid[]) from public, anon, authenticated;
grant execute on function public.tms_transport_fee_status_bulk(uuid[]) to service_role;
