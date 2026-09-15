-- 7.5% scheme fix for SUBHAPRADHA P (DB24A085), learner a5ebdb49-e5a1-4b17-84a1-66e07359b0e4.
-- Applied to the live DB on 2026-09-15 08:30 UTC; recorded here so it is auditable.
--
-- She is a 7.5% SCHOLARSHIP learner (learners_profiles.scholarship_type) and pays a flat
-- Rs 500/year. She held ONE unpaid single-bill-with-instalments transport bill at the full
-- Rs 5,500 (money row f7f88d41, ledger 93d5fa40, one instalment) and NO tms_fee_override,
-- so the portal gate locked her out on a Rs 5,500 overdue Term 1.
--
-- Unlike the 2026-09-11 cases (paid 500 Term 1 + wrong Term 2 to delete), this bill is the
-- merged one-bill format and nothing was paid, so the fix is a REPRICE, not a delete:
--   * update final_amount: update_bill_balance_on_amount_change recomputes balance/status
--     from receipts (none -> 500 unpaid), and bbi_rescale_on_bill_amount_change rescales
--     the single instalment to exactly 500, keeping bbi_validate_sum_equals_bill true.
--   * reprice tms_fee_bill too, so the two ledgers do not drift.
--   * the override PAIR keeps any future generation at Rs 500 with no Term 2. The generator
--     already skips her (learner idempotency is person-level), so it cannot re-raise 5,500.
--
-- She still owes Rs 500 and stays gated until she pays it; that is intended.
--
-- REVERT. Original rows (both ledgers + instalments, jsonb) are in
-- tms_75_scheme_backup_20260915_subhapradha. Restore final/unit/total_amount = 5500 on the
-- money row, amount = 5500 on the ledger row, and delete her two overrides.

begin;

create table if not exists tms_75_scheme_backup_20260915_subhapradha as
select now() backed_up_at,
  (select to_jsonb(fb) from tms_fee_bill fb where fb.id = '93d5fa40-959f-4ce5-9a2d-07a92a9dc9ce') fee_bill,
  (select to_jsonb(sb) from billing_student_bills sb where sb.id = 'f7f88d41-8818-4a29-96cd-e441030079a3') student_bill,
  (select jsonb_agg(to_jsonb(i)) from billing_bill_instalments i where i.bill_id = 'f7f88d41-8818-4a29-96cd-e441030079a3') instalments;

insert into tms_fee_override (person_id, person_type, transport_year_id, term_no, billable, amount, reason)
values
  ('a5ebdb49-e5a1-4b17-84a1-66e07359b0e4', 'learner', '6b3768f9-c9fb-48d5-a955-41949983c3b0', 1, true,  500,
   '7.5% SCHOLARSHIP - annual transport fee fixed at Rs 500 (SUBHAPRADHA P, DB24A085) - 2026-09-15'),
  ('a5ebdb49-e5a1-4b17-84a1-66e07359b0e4', 'learner', '6b3768f9-c9fb-48d5-a955-41949983c3b0', 2, false, null,
   '7.5% SCHOLARSHIP - annual fee fully covered by Term 1 (SUBHAPRADHA P, DB24A085) - 2026-09-15')
on conflict (person_id, transport_year_id, term_no) do update
  set billable = excluded.billable,
      amount   = excluded.amount,
      reason   = excluded.reason,
      updated_at = now();

do $$
declare n int;
begin
  -- Guards: still unpaid, still 5,500, and no payment activity of any kind.
  update billing_student_bills b
     set unit_amount = 500, total_amount = 500, final_amount = 500
   where b.id = 'f7f88d41-8818-4a29-96cd-e441030079a3'
     and b.status = 'unpaid' and b.payment_date is null and b.final_amount = 5500
     and not exists (select 1 from billing_receipt_items     r where r.bill_id = b.id)
     and not exists (select 1 from payment_transaction_items t where t.bill_id = b.id);
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'money row guard failed (% rows) - aborting', n; end if;

  update tms_fee_bill set amount = 500
   where id = '93d5fa40-959f-4ce5-9a2d-07a92a9dc9ce' and amount = 5500;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ledger guard failed (% rows) - aborting', n; end if;
end $$;

commit;
