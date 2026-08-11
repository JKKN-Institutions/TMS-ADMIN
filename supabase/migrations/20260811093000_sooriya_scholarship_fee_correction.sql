-- 7.5% scholarship correction for SOORIYA B (EE24032, sooriyab2024eee@jkkn.ac.in).
--
-- WHAT: their annual transport fee is Rs 500, not the standard Rs 5,500. They were
-- billed the standard amount (T1 Rs 3,000 + T2 Rs 2,500) and PAID it in full, in
-- cash, on 2026-07-31 (receipt RCP-2026-003412).
--
-- Two things happen here, in one migration because they state one fact:
--   1. Record the rule in tms_fee_override so any future generation bills Rs 500.
--   2. Correct the two existing bills: T1 -> Rs 500, T2 -> cancelled.
--
-- CONSEQUENCE, accepted by explicit decision on 2026-08-11: Rs 5,500 of cash is
-- receipted against Rs 500 of billing. The Rs 5,000 excess is refundable and is
-- recorded in billing_student_bills.remarks for the accounts team. TMS has no
-- refund mechanism and does not attempt one.
--
-- DEPARTURE FROM AN EXISTING RULE: tms_approve_transport_vacate deliberately
-- refuses to cancel a PAID bill (it filters bsb.status <> 'paid' and balance > 0).
-- Cancelling a paid Term 2 here is a knowing exception for this one student, which
-- is why the reason is written into three places: the override row, the bill
-- remarks, and this comment.
--
-- balance_amount and status are written EXPLICITLY below.
-- update_bill_balance_on_amount_change looks like it would maintain them, but it
-- is declared AFTER UPDATE while its body mutates NEW -- PostgreSQL discards an
-- AFTER row trigger's return value, so the function is a no-op.

do $$
declare
  v_learner   uuid;
  v_year      uuid := '6b3768f9-c9fb-48d5-a955-41949983c3b0'; -- TY 2026-2027
  v_n         int;
  v_t1_money  int;
  v_t1_ledger int;
  v_t2_money  int;
  v_t2_ledger int;
begin
  -- Resolve by email, not by a hardcoded uuid, so this fails loudly rather than
  -- silently doing nothing if run against a database where the learner is absent.
  --
  -- Counted and fetched in TWO statements on purpose: PostgreSQL has no min()/max()
  -- aggregate for uuid, so `select count(*), min(id)` fails with 42883. Casting via
  -- min(id::text)::uuid would compile, but it would quietly pick a row by TEXT order
  -- if the exactly-one guard below were ever relaxed. Assert first, then fetch.
  select count(*) into v_n
  from public.learners_profiles
  where lower(college_email) = 'sooriyab2024eee@jkkn.ac.in';

  if v_n <> 1 then
    raise exception
      'Expected exactly 1 learner for sooriyab2024eee@jkkn.ac.in, found %', v_n;
  end if;

  select id into v_learner
  from public.learners_profiles
  where lower(college_email) = 'sooriyab2024eee@jkkn.ac.in';

  -- 1. The durable rule. ON CONFLICT DO NOTHING so re-running is harmless.
  insert into public.tms_fee_override
    (person_id, person_type, transport_year_id, term_no, billable, amount, reason)
  values
    (v_learner, 'learner', v_year, 1, true, 500.00,
     '7.5% SCHOLARSHIP - annual transport fee fixed at Rs 500 (approved 2026-08-11)'),
    (v_learner, 'learner', v_year, 2, false, null,
     '7.5% SCHOLARSHIP - annual fee fully covered by Term 1 (approved 2026-08-11)')
  on conflict (person_id, transport_year_id, term_no) do nothing;

  -- Already corrected? Then stop: the UPDATE below filters on status='generated',
  -- so a second run would match nothing for T2 and trip the assertion.
  select count(*) into v_n
  from public.tms_fee_bill
  where person_id = v_learner
    and transport_year_id = v_year
    and term_no >= 2
    and status = 'cancelled';

  if v_n > 0 then
    raise notice 'Bill correction already applied for learner %; skipping.', v_learner;
    return;
  end if;

  -- 2. Correct both bills in ONE statement, so the TMS ledger and the shared
  -- MyJKKN money table cannot diverge if part of it fails.
  with tgt as (
    select fb.id as ledger_id, fb.billing_student_bill_id as bill_id, fb.term_no
    from public.tms_fee_bill fb
    where fb.person_id         = v_learner
      and fb.person_type       = 'learner'
      and fb.transport_year_id = v_year
      and fb.status            = 'generated'
  ),
  money_t1 as (
    update public.billing_student_bills b
       set unit_amount    = 500,
           total_amount   = 500,
           final_amount   = 500,
           balance_amount = 0,        -- explicit: the balance trigger is a no-op
           status         = 'paid',   -- explicit, same reason
           remarks        = concat_ws(' | ', nullif(b.remarks, ''),
                            '7.5% scholarship: annual transport fee revised to Rs 500 '
                            || 'on 2026-08-11. Rs 5,000 of receipt RCP-2026-003412 is '
                            || 'excess and refundable.'),
           updated_at     = now()
      from tgt
     where tgt.bill_id = b.id and tgt.term_no = 1
    returning b.id
  ),
  ledger_t1 as (
    update public.tms_fee_bill fb
       set amount = 500
      from tgt
     where tgt.ledger_id = fb.id and tgt.term_no = 1
    returning fb.id
  ),
  -- term_no >= 2, not = 2: if the structure ever gains a Term 3 this must not
  -- leave a stray billable term behind.
  money_t2 as (
    update public.billing_student_bills b
       set status     = 'cancelled',
           remarks    = concat_ws(' | ', nullif(b.remarks, ''),
                        '7.5% scholarship: term cancelled on 2026-08-11, annual fee '
                        || 'fully covered by Term 1.'),
           updated_at = now()
      from tgt
     where tgt.bill_id = b.id and tgt.term_no >= 2
    returning b.id
  ),
  ledger_t2 as (
    update public.tms_fee_bill fb
       set status = 'cancelled'
      from tgt
     where tgt.ledger_id = fb.id and tgt.term_no >= 2
    returning fb.id
  )
  select (select count(*) from money_t1),
         (select count(*) from ledger_t1),
         (select count(*) from money_t2),
         (select count(*) from ledger_t2)
    into v_t1_money, v_t1_ledger, v_t2_money, v_t2_ledger;

  if v_t1_money <> 1 or v_t1_ledger <> 1 or v_t2_money <> 1 or v_t2_ledger <> 1 then
    raise exception
      'Unexpected row counts (t1_money=%, t1_ledger=%, t2_money=%, t2_ledger=%) - rolled back',
      v_t1_money, v_t1_ledger, v_t2_money, v_t2_ledger;
  end if;

  raise notice 'SOORIYA B fee correction applied: T1 -> Rs 500, T2 cancelled.';
end $$;
