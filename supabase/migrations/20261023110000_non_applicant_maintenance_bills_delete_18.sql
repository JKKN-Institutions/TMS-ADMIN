-- Delete 20 unpaid Transport Maintenance Fee bills (2026-2027 Term 1,
-- Rs 40,000 in total) belonging to learners who never submitted a Bus Pass
-- Request (not in tms_billable_learner) and hold no tms_fee_override. They were
-- raised by the 2026-08-11 manual Arts Self generate run or the 2026-09-03/04
-- admission-form bus_required batch, before billing was gated on applicants.
-- On the user's request (2026-10-23): delete all 20 bills.
-- Applied 2026-11-12 for 18 of them (Rs 39,000): by then DEEPIKA K's bill was
-- already cancelled and NISHANTH M's was paid (receipt 2026-11-11), so both
-- were left alone.
--
-- Same pattern as 20261023100000_balasubramaniyam_k_delete_maintenance_bill.sql:
-- delete from the MONEY side (cascades tms_fee_bill), replicate the payment
-- guards, snapshot both rows into tms_activity_log, no override (a learner who
-- applies later should still be billed). All-or-nothing: any failed guard aborts.

do $$
declare
  r record;
  v_n int;
  v_total int := 0;
begin
  for r in
    select * from (values
      ('74d2fd71-4a0c-428b-8292-4b23a3f82031'::uuid, '59487912-0dd7-4eb8-85d6-c2a583186905'::uuid, 'HARI E'),
      ('32be8bbb-69d1-4e4a-8bb6-9df6e56e0025'::uuid, 'a0f4e1b3-40be-44e4-8860-7399d7dd943c'::uuid, 'JANAKIRAMAN P'),
      ('9ea5c630-0c5e-42a7-9a10-ea662cdd6675'::uuid, '3b1e6e60-7e2e-4c5f-bc16-37eb19fe99f4'::uuid, 'JEEVITHA M'),
      ('d5557616-1a8a-4891-b1b0-89c7118f1ee7'::uuid, 'be4da2e1-0588-47bc-8e62-0f9eba582da2'::uuid, 'JOTHI KRISHNAN R'),
      ('55ca0ee5-06fd-4a39-8d52-f28820e906be'::uuid, '9351ef40-1a26-41d9-a9b2-4dd555a3a90d'::uuid, 'KAMALESH K'),
      ('449de1c8-5399-4359-ae17-3cfe7e6f27a4'::uuid, '61735509-16fd-4f37-b942-ff5eb577992c'::uuid, 'KANISHKA K'),
      ('fabb32e6-c21f-439a-b610-343638ba0535'::uuid, '83c2482a-c7a3-44ff-aa80-162d27eb6c2e'::uuid, 'KEERTHANA R'),
      ('2a365523-f5fc-4715-aabb-ed7ce2fda73d'::uuid, 'fad213b5-2485-45fe-8212-2a01fbe32be6'::uuid, 'LALITHA K'),
      ('4b9c5907-f5d8-4b31-9fac-957e1429aa6d'::uuid, '3f213cb8-3e0e-47e1-a1e3-cc5401cf3332'::uuid, 'MONISHA M'),
      ('b50e594f-f039-4fd1-9baa-d66462cc1c29'::uuid, 'f51efe96-d1c5-47fc-9130-91e14409e9ea'::uuid, 'MOUNIKA V'),
      ('564ddc80-dbf7-4d2c-9953-f332d1e9ca79'::uuid, 'dd6448e2-87d0-4624-b109-5de7efdc44cc'::uuid, 'NATARAJAN M'),
      ('a3581ceb-e815-444c-996c-0a649847e159'::uuid, '9b0f4e4f-59f6-49e3-83d0-0bec53469891'::uuid, 'Pooja G'),
      ('71bff781-57b0-4844-ae7f-b6036ca8e81c'::uuid, '7ac030d6-cff3-41ce-ab21-d097da44efa4'::uuid, 'PRAKASH K'),
      ('f397e9a2-2c89-4593-835f-2b09891eb0e1'::uuid, '5e881a0d-968a-4ccd-8edf-314e34a54db0'::uuid, 'PRAVEENKUMAR P'),
      ('c6653a78-a47a-4765-99af-7817c45ea97d'::uuid, 'a1286e7e-b361-4800-8363-12e984362db6'::uuid, 'RAGAVI D'),
      ('154b5f68-fb57-4557-b007-51951af2b4f9'::uuid, 'ceafc117-46f1-4dd6-bcc3-e75312f5604d'::uuid, 'THANGAPANDI M'),
      ('6fbd585d-6113-4d17-b41f-724fd625f4e8'::uuid, '199f5c17-b7d1-43df-a874-13d725959219'::uuid, 'VIGNESH M'),
      ('e5b8adb8-4e3b-4989-a2cd-229e33c1167b'::uuid, '02ef53ac-37b5-4ae1-b1d8-082f6d88cfe0'::uuid, 'VINITHASHREE V')
    ) as t(bill, person, label)
  loop
    if not exists (select 1 from billing_student_bills
                   where id = r.bill and student_id = r.person and status = 'unpaid'
                     and payment_date is null and balance_amount = final_amount) then
      raise exception 'Bill % (%) is not an untouched unpaid bill', r.bill, r.label;
    end if;
    if exists (select 1 from billing_receipt_items where bill_id = r.bill)
       or exists (select 1 from payment_transaction_items where bill_id = r.bill) then
      raise exception 'Bill % (%) has receipts or payment attempts', r.bill, r.label;
    end if;
    if exists (select 1 from tms_billable_learner where id = r.person) then
      raise exception 'Learner % (%) is now a billable bus pass applicant', r.person, r.label;
    end if;
    if not exists (select 1 from tms_fee_bill where billing_student_bill_id = r.bill) then
      raise exception 'Bill % (%) is not a TMS maintenance bill', r.bill, r.label;
    end if;

    insert into tms_activity_log (module, action, entity_type, entity_id, entity_label, description, metadata)
    select 'fees', 'delete', 'fee_bill', t.id::text, r.label,
           format('Deleted Rs %s Transport Maintenance Fee Term 1 - no bus pass request (user request 2026-10-23, batch of 18)', b.final_amount),
           jsonb_build_object('money_row', to_jsonb(b), 'ledger_row', to_jsonb(t))
      from billing_student_bills b
      join tms_fee_bill t on t.billing_student_bill_id = b.id
     where b.id = r.bill;

    delete from billing_student_bills where id = r.bill;
    get diagnostics v_n = row_count;
    if v_n <> 1 then raise exception 'expected to delete bill % (%), deleted %', r.bill, r.label, v_n; end if;
    v_total := v_total + 1;
  end loop;

  if v_total <> 18 then raise exception 'expected 18 deletions, got %', v_total; end if;
end $$;
