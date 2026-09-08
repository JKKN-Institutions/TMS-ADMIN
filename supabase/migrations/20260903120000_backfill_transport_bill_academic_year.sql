-- Backfill: transport bills must carry the TRANSPORT year, not the learner's
-- stale profile year.
--
-- Every transport bill in the system belongs to transport year 2026-2027, but
-- 945 of them were stamped with academic_year_id 2025-2026 / 2024-2025, and
-- 1,282 render a description like "Transport Fee - 2025-2026 - Term 1". Both
-- came from the same defect: lib/fees/generate.ts copied
-- learners_profiles.academic_year_id straight onto the bill, and that column
-- lags whenever a profile has not been rolled over to the new academic year
-- yet. The code side is fixed in lib/fees/bill-academic-year.ts; this migration
-- repairs the rows already written.
--
-- SAFETY: only academic_year_id and bill_description move. No amount, balance,
-- status, due date or instalment is touched, so paid bills stay paid and the
-- ledger is unchanged. The pre-update values are snapshotted into
-- tms_bill_academic_year_backfill so the change is reversible.
--
-- Descriptions WITHOUT a year token ("Transport Fee", 26 rows) and the transport
-- FINE smoke-test row are deliberately left alone: they are not mislabelled,
-- and inventing a year for them is a different decision.

create table if not exists public.tms_bill_academic_year_backfill (
  bill_id                 uuid primary key,
  old_academic_year_id    uuid,
  new_academic_year_id    uuid,
  old_bill_description    text,
  new_bill_description    text,
  backfilled_at           timestamptz not null default now()
);

comment on table public.tms_bill_academic_year_backfill is
  'Pre-update snapshot for the 2026-09-03 transport-bill academic-year backfill. Restore with an UPDATE ... FROM against billing_student_bills on bill_id.';

do $$
declare
  v_ty_id   uuid;
  v_ty_name text;
  v_ay      integer;
  v_desc    integer;
  v_started timestamptz := clock_timestamp();
begin
  select id, name into v_ty_id, v_ty_name
  from public.tms_transport_year
  where is_current
  order by start_date desc
  limit 1;

  if v_ty_id is null then
    raise exception 'No current transport year — refusing to backfill.';
  end if;

  -- Snapshot + repair in one pass so the two can never disagree.
  with target as (
    select b.id,
           b.academic_year_id                          as old_ay,
           b.bill_description                          as old_desc,
           ay.id                                       as new_ay,
           case
             when b.bill_description ~ ('^Transport Fee - 20[0-9]{2}-20[0-9]{2}')
               then regexp_replace(b.bill_description, '20[0-9]{2}-20[0-9]{2}', v_ty_name)
             else b.bill_description
           end                                         as new_desc
    from public.billing_student_bills b
    -- The academic year of the SAME NAME as the transport year, for this bill's
    -- institution. A bill whose institution has no such row is skipped, not guessed.
    join public.academic_years ay
      on ay.institution_id = b.institution_id
     and ay.academic_year_name = v_ty_name
    where b.transport_year_id = v_ty_id
  ),
  changed as (
    select * from target
    where old_ay is distinct from new_ay
       or old_desc is distinct from new_desc
  ),
  snapshot as (
    insert into public.tms_bill_academic_year_backfill
      (bill_id, old_academic_year_id, new_academic_year_id, old_bill_description, new_bill_description, backfilled_at)
    -- backfilled_at is stamped EXPLICITLY with v_started, not left to the
    -- default: now() is transaction-start time, which is EARLIER than the
    -- clock_timestamp() captured when this block began, so the
    -- `backfilled_at >= v_started` guard below would match nothing.
    select id, old_ay, new_ay, old_desc, new_desc, v_started from changed
    on conflict (bill_id) do nothing
    returning bill_id
  )
  select
    count(*) filter (where old_ay is distinct from new_ay),
    count(*) filter (where old_desc is distinct from new_desc)
  into v_ay, v_desc
  from changed;

  update public.billing_student_bills b
     set academic_year_id = s.new_academic_year_id,
         bill_description = s.new_bill_description
    from public.tms_bill_academic_year_backfill s
   -- Only the rows THIS run snapshotted, so a re-run can never replay an older
   -- snapshot over a bill that has legitimately changed since.
   where s.bill_id = b.id
     and s.backfilled_at >= v_started;

  raise notice 'Transport year %: repointed % academic_year_id, rewrote % descriptions.',
    v_ty_name, v_ay, v_desc;
end $$;
