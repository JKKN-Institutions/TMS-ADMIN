-- Seed the two recurring-transport billing categories.
--
-- Part 1 of 2. This file is ADDITIVE and safe to apply while the old code is
-- still deployed: nothing reads these rows until the code that names them ships.
-- Part 2 (20260912_backfill_transport_maintenance_fee_category.sql) moves the
-- existing bills and must run only AFTER that code is live.
--
-- once_per_learner is left at its column default of FALSE, and that is
-- load-bearing. billing_enforce_once_per_learner is a BEFORE INSERT OR UPDATE
-- trigger whose early-exit applies only while item_category_id is unchanged;
-- the backfill changes exactly that column, so the full duplicate check re-runs
-- on every row. With TRUE, every learner holding both a Term-1 and a Term-2
-- bill would abort the backfill with SQLSTATE BL001.
--
-- kind and frequency are cloned from the existing 'Transport Fee' row rather
-- than written literally, so the billing_category_kind enum label never has to
-- be spelled here.

begin;

insert into public.billing_categories (category_name, frequency, description, kind)
select
  v.category_name,
  coalesce(t.frequency, 'one-time'),
  v.description,
  coalesce(t.kind, 'other'::public.billing_category_kind)
from (values
  ('Transport Maintenance Fee',
   'Recurring transport maintenance charge for learners. Transport fines bill separately under "Transport Fee".'),
  ('Staff Transport Maintenance Fee',
   'Recurring transport maintenance charge for staff.')
) as v(category_name, description)
left join lateral (
  select bc.frequency, bc.kind
  from public.billing_categories bc
  where bc.category_name = 'Transport Fee'
  limit 1
) t on true
where not exists (
  select 1 from public.billing_categories bc2
  where bc2.category_name = v.category_name
);

do $$
declare
  v_missing text;
begin
  select string_agg(name, ', ')
    into v_missing
  from (values ('Transport Maintenance Fee'), ('Staff Transport Maintenance Fee')) as n(name)
  where not exists (
    select 1 from public.billing_categories bc where bc.category_name = n.name
  );

  if v_missing is not null then
    raise exception 'Seed failed, categories still missing: %', v_missing;
  end if;

  -- The backfill in part 2 depends on this being false. Fail here, where the
  -- fix is one UPDATE, rather than mid-backfill with BL001.
  if exists (
    select 1 from public.billing_categories
    where category_name in ('Transport Maintenance Fee', 'Staff Transport Maintenance Fee')
      and once_per_learner is true
  ) then
    raise exception 'A new transport category has once_per_learner = true; the backfill would abort with BL001';
  end if;
end $$;

commit;
