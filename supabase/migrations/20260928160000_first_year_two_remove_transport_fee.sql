-- Two first-year learners: VAISHYA P (vaishyap26ahs) and LOGARITHIKA K
-- (logarithikak26ahs). The 48h sweep raised a Transport Fee (Rs 20,000 and
-- Rs 21,000), and the 2026-09-28 waiver then deleted their Rs 5,500
-- maintenance bills. On the user's request (2026-09-28): remove the Transport
-- Fee and show only the Transport Maintenance Fee.
--
-- For each learner:
-- 1. Back up the fine, its money row and the notice into
--    tms_transport_fee_removed_backup.
-- 2. Unlink the notice (NO ACTION FK) and set it to cancelled. A notice
--    already exists for the person and year, so the sweep cannot open a new one.
-- 3. Delete the unpaid money row. tms_fee_fine cascades.
-- 4. Delete the "TRANSPORT FEE RAISED" override pair. With no override, the
--    auto-generate-bills cron re-raises the normal maintenance fee from the
--    fee structure.
-- Already applied to production; recorded here.

do $$
declare
  v_year constant uuid := '6b3768f9-c9fb-48d5-a955-41949983c3b0';
  r record;
  v_n int;
begin
  for r in
    select * from (values
      ('09d97dbd-79de-4f2d-91aa-13b5a152fe62'::uuid, '7870edb9-4554-4299-ac6b-6b59c61478fc'::uuid, '7580b640-4214-49d2-9696-3fdb62e04140'::uuid, 'VAISHYA P'),
      ('4c3866e4-a3d6-487c-9d24-9ec7574f2f86'::uuid, '6cd0afb9-cd12-4b2e-9f80-9234dc416d6a'::uuid, '650c7720-65ca-4310-a1aa-54728d166be2'::uuid, 'LOGARITHIKA K')
    ) as t(person_id, bill_id, fine_id, name)
  loop
    if not exists (select 1 from billing_student_bills
                   where id = r.bill_id and student_id = r.person_id and status = 'unpaid'
                     and balance_amount = final_amount) then
      raise exception 'Transport Fee bill % (%) is not an untouched unpaid bill', r.bill_id, r.name;
    end if;
    if exists (select 1 from billing_receipt_items where bill_id = r.bill_id)
       or exists (select 1 from payment_transaction_items where bill_id = r.bill_id) then
      raise exception 'Transport Fee bill % (%) has receipts or payment attempts', r.bill_id, r.name;
    end if;

    insert into tms_transport_fee_removed_backup (fine, bill, notice, removed_reason)
    select to_jsonb(f), to_jsonb(b), to_jsonb(n),
           'First-year learner ' || r.name || ' - Transport Fee removed, maintenance fee restored (user request 2026-09-28)'
    from tms_fee_fine f
    join billing_student_bills b on b.id = f.billing_student_bill_id
    left join tms_fee_payment_notice n on n.fine_id = f.id
    where f.id = r.fine_id;

    update tms_fee_payment_notice
       set fine_id = null, status = 'cancelled', updated_at = now()
     where fine_id = r.fine_id;

    delete from billing_student_bills where id = r.bill_id;
    get diagnostics v_n = row_count;
    if v_n <> 1 then raise exception 'expected to delete 1 bill for %, deleted %', r.name, v_n; end if;

    delete from tms_fee_override
     where person_id = r.person_id and transport_year_id = v_year
       and reason like 'TRANSPORT FEE RAISED%';
  end loop;
end $$;
