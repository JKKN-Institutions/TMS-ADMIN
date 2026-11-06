-- MOHANRAJ P (EE25035, mohanrajmeee2025). Maintenance was billed as two bills
-- (Term 1 Rs 3,000 + Term 2 Rs 2,500). He paid Term 2 (receipt Rs 2,500,
-- 2026-09-01); Term 1 stayed unpaid, so the 48h sweep raised a Rs 18,400
-- Transport Fee on 2026-10-14 and the waiver trigger deleted Term 1.
--
-- On the user's request (2026-10-29):
--   1. Remove the Transport Fee (same steps as
--      20261016100000_dishanthvarsan_r_remove_transport_fee.sql).
--   2. Turn the paid Term 2 bill into ONE year bill: Rs 5,500, Rs 2,500 paid,
--      Rs 3,000 pending, description without the term. Due date kept at
--      2026-08-31 (user's choice), so the balance is overdue at once.
--   3. Ledger row follows the merged-bill convention: term_no = 1, amount =
--      year total.
--   4. The 'TRANSPORT FEE RAISED' override pair is KEPT but re-labelled. It
--      must stay: billable=false stops the generator re-creating Term 1/Term 2
--      next to the merged bill, and any override row keeps the 48h sweep from
--      opening a new notice. Only the reason changes, so the access RPC
--      (which keys on reason LIKE 'TRANSPORT FEE RAISED%') goes back to judging
--      the maintenance bill itself.
--
-- The bill has a receipt, so fn_guard_bill_locked_after_receipt and
-- fn_guard_bill_no_direct_change block this edit for app roles; this runs as
-- the DB owner on the user's explicit approval. Old rows saved in
-- tms_bill_amount_correction_backup.

create table if not exists public.tms_bill_amount_correction_backup (
  id         bigserial primary key,
  bill       jsonb not null,
  ledger     jsonb,
  overrides  jsonb,
  reason     text not null,
  created_at timestamptz not null default now()
);
alter table public.tms_bill_amount_correction_backup enable row level security;

do $$
declare
  v_year     constant uuid := '6b3768f9-c9fb-48d5-a955-41949983c3b0';
  v_person   constant uuid := '940d6941-5e15-4691-859e-eda025c77897';
  v_tf_bill  constant uuid := '69be2010-645a-4a79-b38b-5601423e87f1';
  v_tf_fine  constant uuid := 'b136d019-604c-4614-a373-3301f70b09ef';
  v_mf_bill  constant uuid := 'f796c7d7-8e0c-4a47-b6c8-d61cb9a4a8f3';
  v_mf_led   constant uuid := '78aa4380-da1f-4505-8225-b2cc2cc78df2';
  v_paid     numeric;
  v_n        int;
begin
  -- ── 1. Transport Fee ────────────────────────────────────────────────────
  if not exists (select 1 from billing_student_bills
                 where id = v_tf_bill and student_id = v_person and status = 'unpaid'
                   and balance_amount = final_amount) then
    raise exception 'Transport Fee bill % is not an untouched unpaid bill', v_tf_bill;
  end if;
  if exists (select 1 from billing_receipt_items where bill_id = v_tf_bill)
     or exists (select 1 from payment_transaction_items where bill_id = v_tf_bill) then
    raise exception 'Transport Fee bill % has receipts or payment attempts', v_tf_bill;
  end if;

  insert into tms_transport_fee_removed_backup (fine, bill, notice, removed_reason)
  select to_jsonb(f), to_jsonb(b), to_jsonb(n),
         'MOHANRAJ P - Transport Fee removed, maintenance merged to one Rs 5,500 bill (user request 2026-10-29)'
  from tms_fee_fine f
  join billing_student_bills b on b.id = f.billing_student_bill_id
  left join tms_fee_payment_notice n on n.fine_id = f.id
  where f.id = v_tf_fine;

  update tms_fee_payment_notice
     set fine_id = null, status = 'cancelled', updated_at = now()
   where fine_id = v_tf_fine;

  delete from billing_student_bills where id = v_tf_bill;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'expected to delete 1 Transport Fee bill, deleted %', v_n; end if;

  -- ── 2. Maintenance bill → one Rs 5,500 year bill ────────────────────────
  if not exists (select 1 from billing_student_bills
                 where id = v_mf_bill and student_id = v_person and final_amount = 2500
                   and status = 'paid') then
    raise exception 'Maintenance bill % is not the paid Rs 2,500 bill', v_mf_bill;
  end if;
  select coalesce(sum(amount_paid), 0) into v_paid from billing_receipt_items where bill_id = v_mf_bill;
  if v_paid <> 2500 then raise exception 'expected Rs 2,500 receipted on %, found %', v_mf_bill, v_paid; end if;
  if exists (select 1 from billing_bill_instalments where bill_id = v_mf_bill) then
    raise exception 'bill % has instalments; this fix assumes none', v_mf_bill;
  end if;
  if exists (select 1 from tms_fee_bill
             where person_id = v_person and transport_year_id = v_year
               and term_no = 1 and id <> v_mf_led) then
    raise exception 'learner already has another term-1 ledger row';
  end if;

  insert into tms_bill_amount_correction_backup (bill, ledger, overrides, reason)
  select to_jsonb(b),
         (select to_jsonb(l) from tms_fee_bill l where l.id = v_mf_led),
         (select jsonb_agg(to_jsonb(o)) from tms_fee_override o
           where o.person_id = v_person and o.transport_year_id = v_year),
         'MOHANRAJ P - Term 2 Rs 2,500 bill changed to single Rs 5,500 maintenance bill (user request 2026-10-29)'
  from billing_student_bills b where b.id = v_mf_bill;

  -- update_bill_balance_on_amount_change recomputes balance (3000), status
  -- (partially_paid) and payment_date from billing_receipt_items.
  update billing_student_bills
     set final_amount     = 5500,
         total_amount     = 5500,
         unit_amount      = 5500,
         bill_description = 'Transport Maintenance Fee - 2026-2027'
   where id = v_mf_bill;

  if not exists (select 1 from billing_student_bills
                 where id = v_mf_bill and final_amount = 5500 and balance_amount = 3000
                   and status = 'partially_paid') then
    raise exception 'maintenance bill did not land at 5500 / 3000 pending / partially_paid';
  end if;

  -- ── 3. Ledger row ───────────────────────────────────────────────────────
  update tms_fee_bill
     set amount = 5500, term_no = 1, status = 'generated'
   where id = v_mf_led and billing_student_bill_id = v_mf_bill;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'expected to update 1 ledger row, updated %', v_n; end if;

  -- ── 4. Re-label the override pair ───────────────────────────────────────
  update tms_fee_override
     set reason = 'SINGLE MAINTENANCE BILL - Term 1 + Term 2 merged into one Rs 5,500 bill (2026-10-29)',
         updated_at = now()
   where person_id = v_person and transport_year_id = v_year
     and reason like 'TRANSPORT FEE RAISED%';
  get diagnostics v_n = row_count;
  if v_n <> 2 then raise exception 'expected to re-label 2 overrides, re-labelled %', v_n; end if;
end $$;
