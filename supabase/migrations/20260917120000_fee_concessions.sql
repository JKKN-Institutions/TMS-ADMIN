-- Fee Concession tab: rules, audit log, override link, and the apply function.
-- Spec: docs/superpowers/specs/2026-09-17-fee-concession-tab-design.md

create table if not exists public.tms_fee_concession_rule (
  id uuid primary key default gen_random_uuid(),
  transport_year_id uuid not null references public.tms_transport_year(id),
  kind text not null check (kind in ('final_year', 'scheme_75')),
  institution_id uuid references public.institutions(id),
  admission_year int,
  program_id uuid references public.programs(id),
  percent numeric(5,2),
  annual_amount numeric(12,2),
  is_active boolean not null default true,
  label text not null check (length(trim(label)) > 0),
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz,
  updated_by uuid,
  constraint tms_fee_concession_rule_final_year_chk check (
    kind <> 'final_year' or (
      institution_id is not null and admission_year is not null
      and percent is not null and percent > 0 and percent < 100
      and annual_amount is null)),
  constraint tms_fee_concession_rule_scheme_75_chk check (
    kind <> 'scheme_75' or (
      annual_amount is not null and annual_amount > 0
      and institution_id is null and admission_year is null
      and program_id is null and percent is null))
);

create unique index if not exists uq_tms_fee_concession_rule_one_scheme_75
  on public.tms_fee_concession_rule (transport_year_id)
  where kind = 'scheme_75' and is_active;

alter table public.tms_fee_concession_rule enable row level security;
-- No policies: only the service role (API) reads or writes it.

create table if not exists public.tms_fee_concession_log (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.tms_fee_concession_rule(id),
  person_id uuid not null,
  transport_year_id uuid not null,
  terms jsonb not null,
  target_total numeric(12,2) not null,
  before jsonb not null,
  after jsonb not null,
  actions jsonb not null,
  actor uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_tms_fee_concession_log_person
  on public.tms_fee_concession_log (person_id, transport_year_id);
alter table public.tms_fee_concession_log enable row level security;

alter table public.tms_fee_override
  add column if not exists concession_rule_id uuid
  references public.tms_fee_concession_rule(id) on delete set null;

-- Snapshot of every ledger row (+ money row, instalments, receipts) for a person/year.
create or replace function public.tms_fee_concession_snapshot(p_person_id uuid, p_year_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'bills', coalesce((
      select jsonb_agg(jsonb_build_object(
        'fee_bill', to_jsonb(fb),
        'student_bill', to_jsonb(sb),
        'instalments', (select jsonb_agg(to_jsonb(bi)) from billing_bill_instalments bi where bi.bill_id = sb.id),
        'receipts', (select jsonb_agg(to_jsonb(ri)) from billing_receipt_items ri where ri.bill_id = sb.id)
      ) order by fb.term_no)
      from tms_fee_bill fb
      left join billing_student_bills sb on sb.id = fb.billing_student_bill_id
      where fb.person_id = p_person_id and fb.transport_year_id = p_year_id
    ), '[]'::jsonb),
    'overrides', coalesce((
      select jsonb_agg(to_jsonb(o) order by o.term_no)
      from tms_fee_override o
      where o.person_id = p_person_id and o.transport_year_id = p_year_id
    ), '[]'::jsonb)
  );
$$;

create or replace function public.tms_apply_fee_concession(
  p_person_id uuid,
  p_rule_id uuid,
  p_terms jsonb,
  p_target_total numeric,
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
  v_row_count int;
  v_target numeric;
  v_paid numeric;
  v_pending boolean;
  v_action text;
begin
  select * into v_rule from public.tms_fee_concession_rule where id = p_rule_id and is_active;
  if not found then
    raise exception 'Concession rule % is missing or inactive', p_rule_id;
  end if;
  if p_target_total is null or p_target_total <= 0 then
    raise exception 'Concession target total must be positive (got %)', p_target_total;
  end if;
  if jsonb_typeof(p_terms) <> 'array' or jsonb_array_length(p_terms) = 0 then
    raise exception 'Concession terms must be a non-empty array';
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

  -- 2. Correct every existing ledger row for the year.
  select count(*) into v_row_count
  from public.tms_fee_bill
  where person_id = p_person_id and transport_year_id = v_rule.transport_year_id;

  for v_row in
    select fb.id as fb_id, fb.term_no, fb.amount as fb_amount, fb.status as fb_status,
           sb.id as sb_id, sb.final_amount, sb.status as sb_status
    from public.tms_fee_bill fb
    left join public.billing_student_bills sb on sb.id = fb.billing_student_bill_id
    where fb.person_id = p_person_id and fb.transport_year_id = v_rule.transport_year_id
    order by fb.term_no
    for update of fb
  loop
    if v_row.fb_status in ('cancelled', 'error') then
      raise exception 'CONCESSION_REVIEW: term % bill is %', v_row.term_no, v_row.fb_status;
    end if;
    if v_row.sb_id is null then
      raise exception 'CONCESSION_REVIEW: term % bill has no money row', v_row.term_no;
    end if;
    if v_row.sb_status = 'cancelled' then
      raise exception 'CONCESSION_REVIEW: term % money bill is cancelled', v_row.term_no;
    end if;

    select coalesce(sum(amount_paid), 0) into v_paid
    from public.billing_receipt_items where bill_id = v_row.sb_id;
    select exists (select 1 from public.payment_transaction_items where bill_id = v_row.sb_id)
      into v_pending;

    -- One folded bill carries the whole target; legacy per-term rows carry their own term.
    if v_row_count = 1 then
      v_target := p_target_total;
    else
      select case when (t->>'billable')::boolean then (t->>'amount')::numeric else null end
        into v_target
      from jsonb_array_elements(p_terms) t
      where (t->>'term_no')::int = v_row.term_no;
      if not found then
        raise exception 'CONCESSION_REVIEW: no target given for billed term %', v_row.term_no;
      end if;
    end if;

    if v_target is null then
      if v_paid > 0 or v_pending then
        raise exception 'CONCESSION_REVIEW: term % is not charged under the concession but already has a payment', v_row.term_no;
      end if;
      -- tms_fee_bill cannot be deleted directly; the FK cascade removes it.
      delete from public.billing_student_bills where id = v_row.sb_id;
      v_action := 'deleted';
    elsif v_row.final_amount = v_target then
      if v_row.fb_amount <> v_target then
        update public.tms_fee_bill set amount = v_target where id = v_row.fb_id;
        v_action := 'ledger_aligned';
      else
        v_action := 'unchanged';
      end if;
    elsif v_paid > 0 or v_pending then
      raise exception 'CONCESSION_REVIEW: term % has Rs % paid against Rs %; concession is Rs %',
        v_row.term_no, v_paid, v_row.final_amount, v_target;
    else
      update public.billing_student_bills
        set unit_amount = v_target, total_amount = v_target, final_amount = v_target
        where id = v_row.sb_id;
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
    (p_rule_id, p_person_id, v_rule.transport_year_id, p_terms, p_target_total, v_before, v_after, v_actions, p_actor);

  return jsonb_build_object('actions', v_actions);
end;
$$;

revoke execute on function public.tms_apply_fee_concession(uuid, uuid, jsonb, numeric, text, uuid) from public, anon, authenticated;
revoke execute on function public.tms_fee_concession_snapshot(uuid, uuid) from public, anon, authenticated;
grant execute on function public.tms_apply_fee_concession(uuid, uuid, jsonb, numeric, text, uuid) to service_role;
grant execute on function public.tms_fee_concession_snapshot(uuid, uuid) to service_role;

-- Permissions: transport_head only (the only custom role with tms.fees.* today).
update public.custom_roles
set permissions = coalesce(permissions, '{}'::jsonb)
  || '{"tms.fees.concession.view": true, "tms.fees.concession.apply": true}'::jsonb,
    updated_at = now()
where role_key = 'transport_head';

-- Seed 2026-2027 rules (idempotent by label).
insert into public.tms_fee_concession_rule (transport_year_id, kind, institution_id, admission_year, program_id, percent, label)
select '6b3768f9-c9fb-48d5-a955-41949983c3b0', 'final_year', '5736d86f-5dab-4b7f-9aa1-b3bb1a2dd334', 2022,
       '0d980d34-f945-4de6-8c88-ee97b2620b99', 50, 'Pharmacy BPHARM 2022-2026'
where not exists (select 1 from public.tms_fee_concession_rule where label = 'Pharmacy BPHARM 2022-2026');

insert into public.tms_fee_concession_rule (transport_year_id, kind, institution_id, admission_year, percent, label)
select '6b3768f9-c9fb-48d5-a955-41949983c3b0', 'final_year', '9c1554e8-12a2-4b76-a9d6-8242bb05eba1', 2023,
       50, 'Allied Health Sciences 2023 intake'
where not exists (select 1 from public.tms_fee_concession_rule where label = 'Allied Health Sciences 2023 intake');

insert into public.tms_fee_concession_rule (transport_year_id, kind, annual_amount, label)
select '6b3768f9-c9fb-48d5-a955-41949983c3b0', 'scheme_75', 500, '7.5% scholarship - Rs 500 per year'
where not exists (
  select 1 from public.tms_fee_concession_rule
  where transport_year_id = '6b3768f9-c9fb-48d5-a955-41949983c3b0' and kind = 'scheme_75' and is_active);
