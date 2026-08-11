-- 7.5% scholarship correction for GOWSIKA M (ES23012, gowsikamcse2023@jkkn.ac.in).
--
-- Same treatment already applied to SOORIYA B (migrations 20260811093000 and
-- 20260811120000), collapsed into ONE migration because the intended end state is
-- known up front rather than arrived at in two steps.
--
-- WHAT: this learner's annual transport fee is Rs 500, not the standard Rs 5,500.
-- They were billed the standard amount (T1 Rs 3,000 + T2 Rs 2,500) and PAID it in
-- full, in cash, on 2026-07-30 (receipt RCP-2026-003379, payer "GOWSHIKA.G").
--
-- Three things happen here, in one migration because they state one fact:
--   1. Record the rule in tms_fee_override so any future generation bills Rs 500.
--   2. Term 1 -> Rs 500, and marked UNPAID so the Rs 500 stands as outstanding.
--   3. Term 2 -> cancelled.
--
-- WHY TERM 1 IS LEFT UNPAID RATHER THAN PAID: the requester's decision, matching
-- SOORIYA. The learner's payment record is rebuilt from scratch rather than
-- inheriting the old over-collection, so accounts reverses the Rs 5,500 receipt and
-- re-collects Rs 500 cleanly.
--
-- WHAT THIS DELIBERATELY DOES NOT DO: it does not touch billing_receipts or
-- billing_receipt_items. Receipt RCP-2026-003379 still allocates Rs 3,000 to Term 1
-- and Rs 2,500 to the now-cancelled Term 2. Reversing that allocation is MyJKKN's
-- domain and was not requested. Until it is reversed, the receipts and these bills
-- disagree by design -- Rs 5,500 receipted against Rs 500 of live billing.
--
-- KNOWN AND ACCEPTED CONSEQUENCE: this LOCKS THE LEARNER OUT of the student portal.
-- tms_student_transport_access is fail-CLOSED on a PAID Term 1 -- it returns
-- allowed=false with reason 'term1_unpaid' the moment Term 1 is not 'paid'. Term 1
-- was due 2026-07-31, so it also reads as OVERDUE. The learner regains access when
-- the Rs 500 is receipted and the bill returns to 'paid'.
--
-- NOT A TEMPLATE FOR AN UNPAID OR PARTIALLY-PAID LEARNER. This file assumes the two
-- bills are currently fully paid and guards on it (`and b.status = 'paid'` below), so
-- a learner in any other state trips the row-count assertion and the whole DO block
-- rolls back. Of the wider 7.5% cohort, 38 have an UNPAID Term 1; for those,
-- balance_amount must be recomputed from what was actually received --
-- greatest(new_final_amount - amount_already_paid, 0) -- rather than assumed.
--
-- balance_amount and status are written EXPLICITLY.
-- update_bill_balance_on_amount_change looks like it would maintain them, but it is
-- declared AFTER UPDATE while its body mutates NEW -- PostgreSQL discards an AFTER
-- row trigger's return value, so the function is a no-op.
--
-- NOTE ON THE UPDATE: balance_amount is set from the v_fee variable, NOT from
-- b.final_amount. In an UPDATE, SET expressions read the OLD row, so
-- `balance_amount = final_amount` would have written the pre-change Rs 3,000.

do $$
declare
  v_learner   uuid;
  v_year      uuid    := '6b3768f9-c9fb-48d5-a955-41949983c3b0'; -- TY 2026-2027
  v_fee       numeric := 500;   -- the agreed annual scholarship fee, billed in Term 1
  v_n         int;
  v_t1_money  int;
  v_t1_ledger int;
  v_t2_money  int;
  v_t2_ledger int;
begin
  -- Resolve by email, not a hardcoded uuid, so this fails loudly rather than silently
  -- doing nothing if run against a database where the learner is absent. Counted and
  -- fetched separately: PostgreSQL has no min()/max() aggregate for uuid.
  select count(*) into v_n
  from public.learners_profiles
  where lower(college_email) = 'gowsikamcse2023@jkkn.ac.in';

  if v_n <> 1 then
    raise exception
      'Expected exactly 1 learner for gowsikamcse2023@jkkn.ac.in, found %', v_n;
  end if;

  select id into v_learner
  from public.learners_profiles
  where lower(college_email) = 'gowsikamcse2023@jkkn.ac.in';

  -- 1. The durable rule. ON CONFLICT DO NOTHING so re-running is harmless.
  insert into public.tms_fee_override
    (person_id, person_type, transport_year_id, term_no, billable, amount, reason)
  values
    (v_learner, 'learner', v_year, 1, true, v_fee,
     '7.5% SCHOLARSHIP - annual transport fee fixed at Rs 500 (approved 2026-08-11)'),
    (v_learner, 'learner', v_year, 2, false, null,
     '7.5% SCHOLARSHIP - annual fee fully covered by Term 1 (approved 2026-08-11)')
  on conflict (person_id, transport_year_id, term_no) do nothing;

  -- Already corrected? Then stop: the CTE below filters on status='generated', so a
  -- second run would match nothing for Term 2 and trip the assertion.
  select count(*) into v_n
  from public.tms_fee_bill
  where person_id = v_learner
    and transport_year_id = v_year
    and term_no >= 2
    and status = 'cancelled';

  if v_n > 0 then
    raise notice 'Correction already applied for learner %; skipping.', v_learner;
    return;
  end if;

  -- 2 + 3. Both bills in ONE statement, so the TMS ledger and the shared MyJKKN money
  -- table cannot diverge if part of it fails.
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
       set unit_amount    = v_fee,
           total_amount   = v_fee,
           final_amount   = v_fee,
           balance_amount = v_fee,     -- explicit: the balance trigger is a no-op,
           status         = 'unpaid',  -- and SET reads the OLD row, so not final_amount
           payment_date   = null,
           remarks        = concat_ws(' | ', nullif(b.remarks, ''),
                            '7.5% scholarship: annual transport fee revised to Rs 500 '
                            || 'on 2026-08-11 and marked UNPAID. Receipt '
                            || 'RCP-2026-003379 still allocates Rs 3,000 here and '
                            || 'Rs 2,500 to the cancelled Term 2 -- accounts to reverse '
                            || 'and re-collect Rs 500.'),
           updated_at     = now()
      from tgt
     where tgt.bill_id = b.id
       and tgt.term_no = 1
       and b.status = 'paid'          -- guard: this file assumes a fully-paid bill
    returning b.id
  ),
  ledger_t1 as (
    update public.tms_fee_bill fb
       set amount = v_fee
      from tgt
     where tgt.ledger_id = fb.id and tgt.term_no = 1
    returning fb.id
  ),
  -- term_no >= 2, not = 2: if the structure ever gains a Term 3 this must not leave a
  -- stray billable term behind.
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

  raise notice 'GOWSIKA M fee correction applied: T1 -> Rs % unpaid, T2 cancelled.', v_fee;
end $$;
