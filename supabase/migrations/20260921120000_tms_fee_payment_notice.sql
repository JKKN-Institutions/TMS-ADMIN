-- 48-hour Transport Maintenance Fee payment notice.
-- One row per learner per transport year. The unique key is what makes
-- "at most one automatic Transport Fee per learner per year" hold even when two
-- sweeps overlap. Service role only (RLS on, no policies), like tms_fee_fine.

create table if not exists public.tms_fee_payment_notice (
  id                uuid primary key default gen_random_uuid(),
  person_id         uuid not null references public.learners_profiles(id) on delete cascade,
  transport_year_id uuid not null references public.tms_transport_year(id) on delete cascade,
  source_bill_id    uuid references public.tms_fee_bill(id) on delete set null,
  started_at        timestamptz not null,
  expires_at        timestamptz not null,
  reminder_sent_at  timestamptz,
  status            text not null default 'running'
                    check (status in ('running', 'paid', 'fined', 'cancelled')),
  fine_id           uuid references public.tms_fee_fine(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint tms_fee_payment_notice_person_year_unique unique (person_id, transport_year_id),
  constraint tms_fee_payment_notice_window check (expires_at > started_at),
  constraint tms_fee_payment_notice_fined_has_fine check (status <> 'fined' or fine_id is not null)
);

create index if not exists tms_fee_payment_notice_sweep_idx
  on public.tms_fee_payment_notice (transport_year_id, status, expires_at);

alter table public.tms_fee_payment_notice enable row level security;

-- Learner -> auth profile, the way tms_student_transport_access resolves the
-- reverse direction: the direct profile link first, then college/student email.
-- profiles.email is NOT reliably lower-cased, so both sides are lowered.
-- Measured 2026-09-21: 206 of ~450 owing learners are reachable ONLY by email.
create or replace function public.tms_learner_profile_ids(p_learner_ids uuid[])
returns table (learner_id uuid, profile_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select l.id, coalesce(l.profile_id, m.profile_id)
  from learners_profiles l
  left join lateral (
    select p.id as profile_id
    from profiles p
    where l.profile_id is null
      and p.email is not null
      and lower(p.email) in (lower(nullif(l.college_email, '')), lower(nullif(l.student_email, '')))
    order by p.id
    limit 1
  ) m on true
  where l.id = any(p_learner_ids);
$$;

revoke all on function public.tms_learner_profile_ids(uuid[]) from public, anon, authenticated;
grant execute on function public.tms_learner_profile_ids(uuid[]) to service_role;
