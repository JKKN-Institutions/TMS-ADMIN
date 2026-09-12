-- Move the 2026-2027 recurring transport bills onto 'Transport Maintenance Fee'
-- and leave the fines behind on 'Transport Fee'.
--
-- Part 2 of 2. Requires 20260912_seed_transport_maintenance_fee_categories.sql
-- AND the code that writes the new category name to be deployed first. Running
-- this while the old code is still serving would leave the auto-generate cron
-- writing fresh bills onto the fines category.
--
-- Fee and fine are separated by LEDGER MEMBERSHIP (a row in tms_fee_bill), never
-- by bill_description text: descriptions carry a human-entered fine reason and
-- can be edited, ledger membership cannot.
--
-- Undo: tms_bill_category_backfill_20260912 holds every prior value.

begin;

create table if not exists public.tms_bill_category_backfill_20260912 (
  bill_id                 uuid,
  old_item_category_id    uuid,
  old_bill_description    text,
  tms_fee_bill_id         uuid,
  old_billing_category_id uuid,
  snapshot_at             timestamptz not null default now()
);

do $$
declare
  v_year_id     uuid;
  v_old_cat     uuid;
  v_new_cat     uuid;
  v_staff_old   uuid;
  v_staff_new   uuid;
  v_bills       int;
  v_ledger      int;
  v_left        int;
  v_fines_moved int;
  v_desc        int;
  v_ledger_left int;
begin
  select id into v_year_id from public.tms_transport_year where is_current = true;
  if v_year_id is null then
    raise exception 'No current transport year (tms_transport_year.is_current); refusing to guess';
  end if;

  select id into v_old_cat   from public.billing_categories where category_name = 'Transport Fee';
  select id into v_new_cat   from public.billing_categories where category_name = 'Transport Maintenance Fee';
  select id into v_staff_old from public.billing_categories where category_name = 'Staff Transport Fee';
  select id into v_staff_new from public.billing_categories where category_name = 'Staff Transport Maintenance Fee';

  if v_new_cat is null or v_staff_new is null then
    raise exception 'Run 20260912_seed_transport_maintenance_fee_categories.sql first';
  end if;

  ---------------------------------------------------------------------------
  -- 1. Undo snapshot. Re-runnable: skips rows already captured.
  ---------------------------------------------------------------------------
  insert into public.tms_bill_category_backfill_20260912
    (bill_id, old_item_category_id, old_bill_description, tms_fee_bill_id, old_billing_category_id)
  select b.id, b.item_category_id, b.bill_description, fb.id, fb.billing_category_id
  from public.tms_fee_bill fb
  left join public.billing_student_bills b on b.id = fb.billing_student_bill_id
  where fb.transport_year_id = v_year_id
    and not exists (
      select 1 from public.tms_bill_category_backfill_20260912 u
      where u.tms_fee_bill_id = fb.id
    );

  ---------------------------------------------------------------------------
  -- 2. The money rows. Three nested replacements, in this order:
  --      a. 'Transport Fee' prefix        -> 'Transport Maintenance Fee'
  --      b. a stale '2025-2026' label     -> '2026-2027'   (5 rows)
  --      c. any ' <spaces>-<spaces> '     -> ' - '         (6 double-space rows)
  ---------------------------------------------------------------------------
  update public.billing_student_bills b
     set item_category_id = v_new_cat,
         bill_description = regexp_replace(
           regexp_replace(
             regexp_replace(b.bill_description, '^Transport Fee', 'Transport Maintenance Fee'),
             '2025-2026', '2026-2027'
           ),
           '\s+-\s+', ' - ', 'g'
         )
    from public.tms_fee_bill fb
   where fb.billing_student_bill_id = b.id
     and fb.transport_year_id = v_year_id
     and b.item_category_id = v_old_cat;
  get diagnostics v_bills = row_count;

  ---------------------------------------------------------------------------
  -- 3. The TMS ledger's own copy of the category. Leaving this stale would make
  --    the two ledgers disagree about the same bill.
  ---------------------------------------------------------------------------
  update public.tms_fee_bill fb
     set billing_category_id = case
           when fb.person_type = 'staff' then v_staff_new
           else v_new_cat
         end
   where fb.transport_year_id = v_year_id
     and fb.billing_category_id in (v_old_cat, v_staff_old);
  get diagnostics v_ledger = row_count;

  raise notice 'Backfilled % money rows and % ledger rows', v_bills, v_ledger;

  ---------------------------------------------------------------------------
  -- 4. Assert, or roll the whole thing back.
  ---------------------------------------------------------------------------
  select count(*) into v_left
  from public.tms_fee_bill fb
  join public.billing_student_bills b on b.id = fb.billing_student_bill_id
  where fb.transport_year_id = v_year_id and b.item_category_id = v_old_cat;
  if v_left > 0 then
    raise exception 'Incomplete: % fee bills still carry the old category', v_left;
  end if;

  select count(*) into v_fines_moved
  from public.tms_fee_fine f
  join public.billing_student_bills b on b.id = f.billing_student_bill_id
  where b.item_category_id is distinct from v_old_cat;
  if v_fines_moved > 0 then
    raise exception 'Wrong rows moved: % fine bills left the Transport Fee category', v_fines_moved;
  end if;

  select count(*) into v_desc
  from public.tms_fee_bill fb
  join public.billing_student_bills b on b.id = fb.billing_student_bill_id
  where fb.transport_year_id = v_year_id
    and b.bill_description like 'Transport Fee%';
  if v_desc > 0 then
    raise exception 'Incomplete: % fee bill descriptions still read "Transport Fee"', v_desc;
  end if;

  select count(*) into v_ledger_left
  from public.tms_fee_bill
  where transport_year_id = v_year_id
    and billing_category_id in (v_old_cat, v_staff_old);
  if v_ledger_left > 0 then
    raise exception 'Incomplete: % ledger rows still carry an old category', v_ledger_left;
  end if;
end $$;

commit;
